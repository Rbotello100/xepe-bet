'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { askClaude } from '@/lib/ai/claude'
import {
  getCrackDelDia,
  getQuemadoDelDia,
  getRachaGanadora,
  getRachaPerdedora,
  getParlayArriesgado,
  getCashOutEpico,
  getPartidoCaliente,
  getApostadorMasActivo24h,
  getCasinoRachaMala,
} from '@/features/relator/stats'

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

    // 7) Stats entretenidos (rachas, plata, ranking). Todas devuelven null si
    //    no hay data suficiente — el spread al final del context las descarta.
    const [
      crackDelDia,
      quemadoDelDia,
      rachaGanadora,
      rachaPerdedora,
      parlayArriesgado,
      cashOutEpico,
      partidoCaliente,
      apostadorActivo,
      casinoRachaMala,
    ] = await Promise.all([
      getCrackDelDia(),
      getQuemadoDelDia(),
      getRachaGanadora(),
      getRachaPerdedora(),
      getParlayArriesgado(),
      getCashOutEpico(),
      getPartidoCaliente(),
      getApostadorMasActivo24h(),
      getCasinoRachaMala(),
    ])

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
      // Datazos: solo se incluyen las claves que tienen data real. Claude no
      // ve los null, asi evitamos alucinaciones tipo "Nadie ganó hoy".
      ...(crackDelDia && { crack_del_dia: crackDelDia }),
      ...(quemadoDelDia && { quemado_del_dia: quemadoDelDia }),
      ...(rachaGanadora && { racha_ganadora: rachaGanadora }),
      ...(rachaPerdedora && { racha_perdedora: rachaPerdedora }),
      ...(parlayArriesgado && { parlay_arriesgado: parlayArriesgado }),
      ...(cashOutEpico && { cash_out_epico: cashOutEpico }),
      ...(partidoCaliente && { partido_caliente: partidoCaliente }),
      ...(apostadorActivo && { apostador_mas_activo_24h: apostadorActivo }),
      ...(casinoRachaMala && { casino_racha_mala: casinoRachaMala }),
    }

    const system = `Sos El Relator: locutor apasionado del Mundial 2026 para Mundial Betting, plataforma interna de prode y apuestas con creditos virtuales. Escribis en espanol rioplatense, picaresco, con chispa, MUY chismoso cuando hay datazos de gente real.

REGLA DE ORO: usa SIEMPRE los nombres reales del contexto. Si el contexto trae "crack_del_dia", "quemado_del_dia", "racha_ganadora", "racha_perdedora", "parlay_arriesgado", "cash_out_epico", "partido_caliente" o "casino_racha_mala", esos son los CHISMES principales y van si o si en los analysis.

NUNCA inventes nombres, montos ni rachas. Si una clave no esta en el contexto, simplemente no la menciones.

Genera EXACTAMENTE 6 posts cortos (max 140 caracteres cada uno) con esta distribucion:
- 1 "summary": contexto de proximos partidos del Mundial.
- 1 "flash": frase energica tipo tweet. Si hay "partido_caliente", aprovechalo ("Boca-River local: 12 apostando, 8 a Argentina!"). Si no, narra el arranque del dia.
- 3 "analysis": cada uno con un chisme distinto. PRIORIDAD de seleccion:
  1) crack_del_dia o quemado_del_dia ("Maria ya lleva +$420 hoy", "Pedro se quemó $200 en 3 apuestas, sigue firme")
  2) racha_ganadora o racha_perdedora ("Juan lleva 4 wins seguidos esta semana, no se baja", "Lucia 5 derrotas al hilo, pero no afloja")
  3) parlay_arriesgado o cash_out_epico ("Carla armó un parlay x42, si pega cobra $2100", "Diego se bajó a tiempo con $380")
  4) apostador_mas_activo_24h o casino_racha_mala ("Sofía ya metió 7 bets en el día", "Tomás 4 partidas perdidas seguidas en mines")
  Si quedan menos de 3 chismes, completá con ranking_top5 o apuestas_grandes_hoy. NUNCA repitas el mismo user en dos analysis.
- 1 "trivia": dato historico curioso del Mundial (sin usuarios, sin numeros de la plataforma).

Resaltá numeros y montos. Usa 1 emoji maximo por mensaje, y solo cuando suma.

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
      maxTokens: 1400,
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

    // Desactivar SOLO los AI viejos (no tocar templates ni mensajes on-event).
    // Mensajes sin metadata son zombis pre-split source → tambien se desactivan.
    await db
      .from('ai_feed')
      .update({ is_active: false })
      .eq('is_active', true)
      .or('metadata->>source.eq.ai,metadata.is.null')

    const { error: insertErr } = await db.from('ai_feed').insert(
      clean.map((p) => ({
        kind: p.kind,
        content: p.content,
        is_active: true,
        metadata: { source: 'ai' },
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
