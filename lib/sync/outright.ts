import { fetchOdds, fetchScores } from '@/lib/odds-api/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { logOddsApiUsage } from '@/lib/odds-api/usage'
import { addCredits } from '@/lib/credits'
import { logError } from '@/lib/log/error'

const OUTRIGHT_SPORT = 'soccer_fifa_world_cup_winner'

type TriggeredBy = 'cron' | 'admin_manual' | 'test'

/**
 * Sincroniza el mercado de Campeón Mundial:
 *   1. Hit /odds para soccer_fifa_world_cup_winner → trae 40+ outcomes (equipos)
 *   2. Upsert outright_outcomes con la cuota actual
 *   3. Hit /scores para detectar si el evento (la final) ya termino
 *   4. Si termino y hay winner → llamar a settleChampion()
 *
 * Costo: 1 credito por sync de /odds + 1 credito por /scores = 2 creditos por run.
 * Cron schedule: 2x/dia → ~60 creditos/mes. Ultra barato.
 */
export async function syncChampionOutright(triggeredBy: TriggeredBy = 'cron'): Promise<{
  success: boolean
  outcomes_updated: number
  remaining: number
  settled: boolean
  winner?: string
  error?: string
}> {
  const admin = createAdminClient()

  // 1. Obtener (o crear) el market record
  let { data: market } = await admin
    .from('outright_markets')
    .select('id, status, winner_team, external_id')
    .eq('sport_key', OUTRIGHT_SPORT)
    .maybeSingle()

  if (!market) {
    // Bootstrap row si la migration aun no corrio
    const { data: created, error } = await admin.from('outright_markets').insert({
      sport_key: OUTRIGHT_SPORT,
      market_name: 'Campeón Mundial 2026',
      closes_at: '2026-06-28T00:00:00Z',
    }).select('id, status, winner_team, external_id').single()
    if (error || !created) {
      void logError('outright.sync.marketMissing', error, { triggeredBy }, 'error')
      return { success: false, outcomes_updated: 0, remaining: 0, settled: false, error: error?.message ?? 'no_market' }
    }
    market = created
  }

  if (market.status === 'settled') {
    return { success: true, outcomes_updated: 0, remaining: 0, settled: true, winner: market.winner_team ?? undefined }
  }

  // 2. Fetch odds del outright
  let oddsRes
  try {
    oddsRes = await fetchOdds('outrights', 'eu', OUTRIGHT_SPORT)
  } catch (e) {
    void logError('outright.sync.fetchOddsFailed', e, { triggeredBy }, 'error')
    return { success: false, outcomes_updated: 0, remaining: 0, settled: false, error: (e as Error).message }
  }

  const event = oddsRes.data[0]
  if (!event) {
    await logOddsApiUsage({
      endpoint: 'odds',
      sport_key: OUTRIGHT_SPORT,
      credits_used: 1,
      remaining: oddsRes.remaining,
      triggered_by: triggeredBy,
      result_summary: { warning: 'no_event' },
      error: null,
    })
    return { success: false, outcomes_updated: 0, remaining: oddsRes.remaining, settled: false, error: 'no_event' }
  }

  // 3. Tomar la mejor cuota por equipo (max odds entre bookmakers)
  const oddsByTeam = new Map<string, number>()
  for (const b of event.bookmakers ?? []) {
    const market = b.markets.find(m => m.key === 'outrights')
    if (!market) continue
    for (const o of market.outcomes) {
      if (!o.name || typeof o.price !== 'number') continue
      if (o.price < 1.01 || o.price > 999) continue
      const current = oddsByTeam.get(o.name)
      if (current == null || o.price > current) oddsByTeam.set(o.name, Math.round(o.price * 100) / 100)
    }
  }

  // 4. Upsert outcomes + external_id + commence_time
  let outcomes_updated = 0
  if (oddsByTeam.size > 0) {
    const rows = Array.from(oddsByTeam.entries()).map(([team_name, odds]) => ({
      market_id: market.id, team_name, odds,
    }))
    const { error: upErr } = await admin
      .from('outright_outcomes')
      .upsert(rows, { onConflict: 'market_id,team_name' })
    if (!upErr) outcomes_updated = rows.length
    else void logError('outright.sync.upsertOutcomes', upErr, { count: rows.length }, 'error')
  }

  await admin.from('outright_markets').update({
    external_id: event.id,
    commence_time: event.commence_time,
    updated_at: new Date().toISOString(),
  }).eq('id', market.id)

  await logOddsApiUsage({
    endpoint: 'odds',
    sport_key: OUTRIGHT_SPORT,
    credits_used: 1,
    remaining: oddsRes.remaining,
    triggered_by: triggeredBy,
    result_summary: { outcomes_updated, sport: OUTRIGHT_SPORT },
    error: null,
  })

  // 5. Auto-detect settlement via /scores
  // Cuando la final termine, el event aparecera con completed=true en /scores.
  // El field `scores[]` deberia contener el winner.
  let settled = false
  let winner: string | undefined
  try {
    const scoresRes = await fetchScores(5, OUTRIGHT_SPORT)
    const scoreEvent = scoresRes.data.find(e => e.id === event.id)
    if (scoreEvent?.completed && Array.isArray(scoreEvent.scores) && scoreEvent.scores.length > 0) {
      // El primer (o unico) score con score=1 es el winner
      const winnerScore = scoreEvent.scores.find(s => s.score === '1' || s.score === 'true')
      const winnerName = winnerScore?.name ?? scoreEvent.scores[0]?.name
      if (winnerName) {
        const result = await settleChampion(winnerName)
        settled = result.settled
        winner = winnerName
      }
    }
    await logOddsApiUsage({
      endpoint: 'scores',
      sport_key: OUTRIGHT_SPORT,
      credits_used: 2,
      remaining: scoresRes.remaining,
      triggered_by: triggeredBy,
      result_summary: { completed: scoreEvent?.completed ?? false, winner },
      error: null,
    })
  } catch (e) {
    void logError('outright.sync.scoresFailed', e, { triggeredBy }, 'warn')
  }

  return { success: true, outcomes_updated, remaining: oddsRes.remaining, settled, winner }
}

/**
 * Liquida todas las outright_bets pending del market actual contra el winner.
 * Cada bet con team_name === winner → won + addCredits(potential_payout).
 * Resto → lost.
 *
 * Idempotente: si la bet ya fue settled, skip. Marca market.status='settled'
 * y winner_team al final.
 */
export async function settleChampion(winnerTeam: string): Promise<{
  settled: boolean
  paid: number
  lost: number
  error?: string
}> {
  const admin = createAdminClient()

  const { data: market } = await admin
    .from('outright_markets')
    .select('id, status, market_name')
    .eq('sport_key', OUTRIGHT_SPORT)
    .single()

  if (!market) return { settled: false, paid: 0, lost: 0, error: 'no_market' }
  if (market.status === 'settled') return { settled: true, paid: 0, lost: 0 }

  // Cerrar mercado para nuevas bets antes de pagar
  await admin.from('outright_markets').update({ status: 'closed' }).eq('id', market.id)

  // Trae todas las pending
  const bets: Array<{ id: string; user_id: string; team_name: string; potential_payout: number }> = []
  let offset = 0
  while (true) {
    const { data } = await admin
      .from('outright_bets')
      .select('id, user_id, team_name, potential_payout')
      .eq('market_id', market.id)
      .eq('status', 'pending')
      .range(offset, offset + 999)
    if (!data?.length) break
    bets.push(...data.map(b => ({ ...b, potential_payout: Number(b.potential_payout) })))
    if (data.length < 1000) break
    offset += 1000
  }

  let paid = 0
  let lost = 0
  for (const b of bets) {
    const won = b.team_name.toLowerCase() === winnerTeam.toLowerCase()
    if (won) {
      const result = await addCredits(
        b.user_id,
        b.potential_payout,
        'win',
        `Campeón Mundial: ${b.team_name}`,
        b.id,
      )
      if (result.success) {
        await admin.from('outright_bets').update({
          status: 'won',
          resolved_at: new Date().toISOString(),
        }).eq('id', b.id)
        paid++
      } else {
        void logError('outright.settle.addCreditsFailed', result.error, { betId: b.id }, 'error')
      }
    } else {
      await admin.from('outright_bets').update({
        status: 'lost',
        resolved_at: new Date().toISOString(),
      }).eq('id', b.id)
      lost++
    }
  }

  // Marcar settled
  await admin.from('outright_markets').update({
    status: 'settled',
    winner_team: winnerTeam,
    settled_at: new Date().toISOString(),
  }).eq('id', market.id)

  return { settled: true, paid, lost }
}
