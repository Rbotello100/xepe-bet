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

    // 3) Top 3 usuarios por puntos
    const { data: topUsers } = await db
      .from('profiles')
      .select('display_name, total_points, credits')
      .order('total_points', { ascending: false })
      .limit(3)

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
      top_usuarios: (topUsers ?? []).map((u) => ({
        nombre: u.display_name,
        puntos: u.total_points,
        creditos: Number(u.credits),
      })),
    }

    const system = `Sos un relator deportivo apasionado narrando el Mundial 2026 para una plataforma interna de prode/apuestas virtuales llamada Mundial Betting. Escribis en espanol rioplatense, informal, con humor, sin exagerar el futbolismo.

Genera exactamente 6 posts cortos (max 140 caracteres cada uno) mezclando estos tipos:
- 2 de tipo "summary": resumen/contexto de los proximos partidos del Mundial
- 2 de tipo "flash": frase flash tipo tweet, energia alta, como si narraras en vivo
- 1 de tipo "analysis": analisis curioso de stats de la plataforma (usuarios activos, apuestas hechas, lider del ranking)
- 1 de tipo "trivia": dato historico curioso del Mundial 2026 o de mundiales pasados

Responde ESTRICTAMENTE en formato JSON, sin markdown, sin explicacion, solo el array:
[
  {"kind": "summary", "content": "..."},
  {"kind": "summary", "content": "..."},
  {"kind": "flash", "content": "..."},
  {"kind": "flash", "content": "..."},
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
