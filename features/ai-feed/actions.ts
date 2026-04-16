'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { askClaude } from '@/lib/ai/claude'

type PostKind = 'summary' | 'flash' | 'analysis' | 'trivia'

interface GeneratedPost {
  kind: PostKind
  content: string
}

/**
 * Genera 6 posts AI para el feed del home. Usa Claude Haiku.
 *
 * Flujo:
 *  1. Lee contexto: proximos partidos, recientes, top usuarios, totales de la plataforma
 *  2. Llama a Claude con un system prompt de "relator de Mundial"
 *  3. Parsea la respuesta en posts
 *  4. Desactiva los viejos (is_active=false) y inserta los nuevos
 *
 * Idempotente: correrla varias veces solo reemplaza el feed anterior.
 */
export async function generateDailyFeed(): Promise<{
  generated: number
  error?: string
}> {
  try {
    const db = createAdminClient()

    // 1) Proximos partidos (3 mas cercanos que no empezaron)
    const now = new Date().toISOString()
    const { data: upcoming } = await db
      .from('matches')
      .select('starts_at, group_name, home:home_team_id(name, fifa_code), away:away_team_id(name, fifa_code)')
      .gt('starts_at', now)
      .eq('status', 'scheduled')
      .order('starts_at', { ascending: true })
      .limit(3)

    // 2) Totales plataforma
    const [{ count: userCount }, { count: betCount }, { count: predictionCount }] = await Promise.all([
      db.from('profiles').select('id', { count: 'exact', head: true }),
      db.from('bets').select('id', { count: 'exact', head: true }),
      db.from('predictions').select('id', { count: 'exact', head: true }),
    ])

    // 3) Top 5 usuarios por puntos (ranking)
    const { data: topUsers } = await db
      .from('profiles')
      .select('display_name, total_points, credits')
      .order('total_points', { ascending: false })
      .limit(5)

    // 4) Apuestas recientes con nombre del usuario y detalle del partido
    const { data: recentBets } = await db
      .from('bets')
      .select('amount, pick, created_at, user:user_id(display_name), match:match_id(home:home_team_id(name), away:away_team_id(name))')
      .order('created_at', { ascending: false })
      .limit(8)

    // 5) Top 3 apuestas grandes del dia (por monto)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: bigBets } = await db
      .from('bets')
      .select('amount, pick, user:user_id(display_name), match:match_id(home:home_team_id(name), away:away_team_id(name))')
      .gte('created_at', todayStart.toISOString())
      .order('amount', { ascending: false })
      .limit(3)

    // 6) Predicciones recientes (prode)
    const { data: recentPreds } = await db
      .from('predictions')
      .select('predicted_winner, predicted_home_score, predicted_away_score, user:user_id(display_name), match:match_id(home:home_team_id(name), away:away_team_id(name))')
      .order('created_at', { ascending: false })
      .limit(5)

    type UserRef = { display_name: string } | null
    type MatchRef = { home: { name: string } | null; away: { name: string } | null } | null

    // Construir contexto para Claude
    const context = {
      proximos_partidos: (upcoming ?? []).map((m) => {
        const home = m.home as unknown as { name: string; fifa_code: string } | null
        const away = m.away as unknown as { name: string; fifa_code: string } | null
        return {
          grupo: m.group_name,
          local: home?.name ?? '?',
          visita: away?.name ?? '?',
          fecha: m.starts_at,
        }
      }),
      totales: {
        usuarios: userCount ?? 0,
        apuestas: betCount ?? 0,
        predicciones: predictionCount ?? 0,
      },
      ranking_top5: (topUsers ?? []).map((u, i) => ({
        puesto: i + 1,
        nombre: u.display_name,
        puntos: u.total_points,
        creditos: Number(u.credits),
      })),
      apuestas_recientes: (recentBets ?? []).map((b) => {
        const user = b.user as unknown as UserRef
        const match = b.match as unknown as MatchRef
        return {
          usuario: user?.display_name ?? 'Alguien',
          monto: Number(b.amount),
          pick: b.pick,
          partido: match ? `${match.home?.name ?? '?'} vs ${match.away?.name ?? '?'}` : null,
        }
      }),
      apuestas_grandes_hoy: (bigBets ?? []).map((b) => {
        const user = b.user as unknown as UserRef
        const match = b.match as unknown as MatchRef
        return {
          usuario: user?.display_name ?? 'Alguien',
          monto: Number(b.amount),
          pick: b.pick,
          partido: match ? `${match.home?.name ?? '?'} vs ${match.away?.name ?? '?'}` : null,
        }
      }),
      predicciones_recientes: (recentPreds ?? []).map((p) => {
        const user = p.user as unknown as UserRef
        const match = p.match as unknown as MatchRef
        return {
          usuario: user?.display_name ?? 'Alguien',
          pronostico: `${p.predicted_home_score ?? '?'}-${p.predicted_away_score ?? '?'} (${p.predicted_winner ?? '?'})`,
          partido: match ? `${match.home?.name ?? '?'} vs ${match.away?.name ?? '?'}` : null,
        }
      }),
    }

    const system = `Sos un relator deportivo apasionado narrando el Mundial 2026 para una plataforma interna de prode/apuestas virtuales llamada Mundial Betting. Escribis en espanol rioplatense, informal, con humor, sin exagerar el futbolismo.

IMPORTANTE: Usa los nombres reales de los usuarios del contexto cuando hables del ranking, de apuestas o predicciones. Ejemplo: "¡Juan Perez sigue firme primero con 1200 puntos!", "¿Sabias que Maria apostó $500 a Brasil vs Morocco?".

Genera exactamente 6 posts cortos (max 140 caracteres cada uno) con esta distribucion:
- 1 "summary": contexto de los proximos partidos del Mundial
- 1 "flash": frase energica tipo tweet, como narrando en vivo
- 2 "analysis": datos concretos del ranking Y de apuestas recientes (usa nombres reales del contexto). Ej: "Fulano lidera el ranking con X pts", "Mengana acaba de apostar $Y a Z"
- 1 "analysis" tipo chisme: una apuesta grande o curiosa del dia con nombre y monto ("¡Pedro le metió $800 a Alemania!")
- 1 "trivia": dato historico curioso del Mundial (sin mencionar usuarios)

Si el contexto viene con pocas apuestas/usuarios (plataforma recien arrancada), igual genera los posts pero reemplaza los de tipo analysis con mensajes de bienvenida ("Recien arrancamos, todavia no hay apuestas") sin inventar nombres que no estan en el contexto.

Responde ESTRICTAMENTE en formato JSON, sin markdown, sin explicacion, solo el array:
[
  {"kind": "summary", "content": "..."},
  {"kind": "flash", "content": "..."},
  {"kind": "analysis", "content": "..."},
  {"kind": "analysis", "content": "..."},
  {"kind": "analysis", "content": "..."},
  {"kind": "trivia", "content": "..."}
]`

    const userMsg = `Contexto actual de la plataforma:\n\n${JSON.stringify(context, null, 2)}`

    const raw = await askClaude({
      system,
      messages: [{ role: 'user', content: userMsg }],
      maxTokens: 1200,
    })

    // Parsear. Claude a veces devuelve el JSON dentro de ```json ... ```
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    let posts: GeneratedPost[]
    try {
      posts = JSON.parse(cleaned)
    } catch {
      return { generated: 0, error: `Claude respondio JSON invalido: ${raw.slice(0, 200)}` }
    }

    if (!Array.isArray(posts) || posts.length === 0) {
      return { generated: 0, error: 'Respuesta vacia o no es array' }
    }

    // Validar cada post
    const validKinds: PostKind[] = ['summary', 'flash', 'analysis', 'trivia']
    const clean = posts.filter(
      (p): p is GeneratedPost =>
        typeof p?.content === 'string' &&
        p.content.length > 0 &&
        validKinds.includes(p.kind as PostKind),
    )

    if (clean.length === 0) {
      return { generated: 0, error: 'Ningun post valido en la respuesta' }
    }

    // Desactivar viejos e insertar nuevos en una sola operacion
    await db.from('ai_feed').update({ is_active: false }).eq('is_active', true)

    const { error: insertErr } = await db.from('ai_feed').insert(
      clean.map((p) => ({
        kind: p.kind,
        content: p.content,
        is_active: true,
      })),
    )

    if (insertErr) {
      return { generated: 0, error: `Insert fallo: ${insertErr.message}` }
    }

    return { generated: clean.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { generated: 0, error: message }
  }
}
