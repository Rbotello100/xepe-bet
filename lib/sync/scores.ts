import { fetchScores } from '@/lib/odds-api/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { addCredits } from '@/lib/credits'
import { SCORE_SYNC_WINDOW_DAYS, type BetPick } from '@/lib/constants'
import { getMatchesNeedingScoreSync } from './scheduler'
import { logOddsApiUsage, type UsageTrigger } from '@/lib/odds-api/usage'
import { logError } from '@/lib/log/error'
import { evaluatePick, type Winner } from '@/lib/utils/pick'
import type { BetMarket } from '@/lib/constants'
import type { OddsScoreEvent } from '@/lib/odds-api/types'

// Tipos explicitos para el settlement — previenen any-creep en autoResolveMatch.
// Si el schema cambia, TypeScript lo cacha en compile-time.

interface PendingBetRow {
  id: string
  user_id: string
  pick: BetPick
  market_type: BetMarket
  amount: number
  odds_at_placement: number
  potential_payout: number
}

interface PendingPredictionRow {
  id: string
  user_id: string
  predicted_winner: Winner | null
  predicted_home_score: number | null
  predicted_away_score: number | null
}

interface PendingParlayLegRow {
  id: string
  parlay_id: string
  pick: BetPick
  market_type: BetMarket
}

/**
 * Sincroniza scores 1 sola vez por partido contra The Odds API /scores.
 *
 * Flujo:
 * 1. Lee los matches pending (kickoff + delay ya pasó, < MAX_ATTEMPTS, dentro de ventana 3d).
 * 2. Agrupa por sport_key y hace UNA llamada a /scores por sport (2 creditos c/u).
 * 3. Para cada match pending busca event.id === match.external_id en la respuesta.
 * 4. Si completed + scores: actualiza score, dispara autoResolveMatch (paga bets/parlays/predictions).
 * 5. Si no: incrementa attempts hasta rendirse.
 *
 * Los IDs de /scores MATCHean con los de /events y /odds -- no hace falta lookup por otro lado.
 */
export async function syncFinishedScores(triggeredBy: UsageTrigger = 'cron') {
  const admin = createAdminClient()
  const pending = await getMatchesNeedingScoreSync()

  if (pending.length === 0) {
    return { skipped: true, reason: 'No matches pending score sync', synced: 0 }
  }

  const bySport = new Map<string, typeof pending>()
  for (const m of pending) {
    const bucket = bySport.get(m.sport_key) ?? []
    bucket.push(m)
    bySport.set(m.sport_key, bucket)
  }

  const scoresMap = new Map<string, OddsScoreEvent>()
  const apiErrors: { sport_key: string; error: string }[] = []
  let apiRemaining: number | null = null

  for (const [sportKey, matches] of bySport) {
    let remaining: number | null = null
    let errorMsg: string | null = null
    let fetched = 0
    try {
      const res = await fetchScores(SCORE_SYNC_WINDOW_DAYS, sportKey)
      remaining = res.remaining
      apiRemaining = remaining
      fetched = res.data.length
      for (const event of res.data) scoresMap.set(event.id, event)
    } catch (err) {
      errorMsg = (err as Error).message
      apiErrors.push({ sport_key: sportKey, error: errorMsg })
      // Fallo de la API significa que NINGUN partido de este sport puede settlear
      // este run. Es bloqueante para el cron — critical.
      void logError('sync.scores.fetchScores', err, { sportKey, pendingInBucket: matches.length }, 'critical')
    }

    await logOddsApiUsage({
      endpoint: 'scores',
      sport_key: sportKey,
      credits_used: 2,
      remaining,
      triggered_by: triggeredBy,
      result_summary: { pending_in_bucket: matches.length, events_fetched: fetched },
      error: errorMsg,
    })
  }

  // Paralelizar el procesamiento de matches. Cada match es independiente
  // (distinto match_id), asi que sus UPDATEs + autoResolveMatch corren en
  // paralelo. Para una jornada con 8 partidos finished simultaneos antes
  // tardabamos ~8x el tiempo de uno solo (~1-2 min en partidos calientes).
  // Ahora wall-clock = el mas lento, no la suma.
  const counters = { synced: 0, stillPlaying: 0, notFound: 0, autoResolved: 0, nameMismatch: 0 }

  await Promise.all(pending.map(async (match) => {
    if (!match.external_id) {
      await admin.from('matches').update({ score_sync_attempts: 999 }).eq('id', match.id)
      return
    }

    const event = scoresMap.get(match.external_id)
    if (!event) {
      await incrementSyncAttempts(match.id)
      counters.notFound++
      return
    }

    if (!event.completed || !event.scores) {
      await incrementSyncAttempts(match.id)
      counters.stillPlaying++
      return
    }

    const parsed = parseScoresByTeamName(event)
    if (!parsed) {
      await incrementSyncAttempts(match.id)
      counters.nameMismatch++
      // Mismatch de nombres = el partido NO se va a resolver automaticamente.
      // Requiere intervencion manual (admin resolveMatch) o seguira pending.
      // Critical para apostadores con plata bloqueada.
      void logError('sync.scores.nameMismatch', 'team_name_not_matched', {
        matchId: match.id, externalId: match.external_id,
        eventHome: event.home_team, eventAway: event.away_team,
        scores: event.scores,
      }, 'critical')
      return
    }

    const { data: existing } = await admin
      .from('matches')
      .select('status')
      .eq('id', match.id)
      .single()

    const wasNotFinished = existing && existing.status !== 'finished'

    const { error } = await admin
      .from('matches')
      .update({
        home_score: parsed.home,
        away_score: parsed.away,
        status: 'finished',
        score_synced: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', match.id)

    if (error) return
    counters.synced++

    if (wasNotFinished) {
      await autoResolveMatch(match.id, parsed.home, parsed.away)
      counters.autoResolved++
    }
  }))

  const synced = counters.synced
  const stillPlaying = counters.stillPlaying
  const notFound = counters.notFound
  const autoResolved = counters.autoResolved
  const nameMismatch = counters.nameMismatch

  return {
    pending: pending.length,
    synced,
    still_playing: stillPlaying,
    not_found: notFound,
    name_mismatch: nameMismatch,
    auto_resolved: autoResolved,
    sports_queried: Array.from(bySport.keys()),
    api_remaining: apiRemaining,
    api_errors: apiErrors.length ? apiErrors : undefined,
  }
}

/**
 * /scores no garantiza orden (home puede venir en scores[0] o scores[1]), asi que
 * matcheamos por name contra event.home_team / away_team.
 * Retorna null si no encuentra ambos scores (caller incrementa attempts, no resuelve).
 */
function parseScoresByTeamName(event: OddsScoreEvent): { home: number; away: number } | null {
  if (!event.scores) return null

  const home = event.scores.find(s => s.name === event.home_team)
  const away = event.scores.find(s => s.name === event.away_team)

  if (!home || !away) return null

  const homeNum = parseInt(home.score, 10)
  const awayNum = parseInt(away.score, 10)
  if (Number.isNaN(homeNum) || Number.isNaN(awayNum)) return null

  return { home: homeNum, away: awayNum }
}

async function incrementSyncAttempts(matchId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from('matches').select('score_sync_attempts').eq('id', matchId).single()
  const current = data?.score_sync_attempts ?? 0
  await admin.from('matches').update({ score_sync_attempts: current + 1 }).eq('id', matchId)
}

/**
 * Resuelve automaticamente todas las predictions, bets y parlays de un partido finalizado.
 * Mismo flow que admin.resolveMatch -- solo paga bets/legs con status='pending', asi es idempotente.
 */
export async function autoResolveMatch(matchId: string, homeScore: number, awayScore: number) {
  const admin = createAdminClient()

  const winner: Winner = homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw'

  const { data: config } = await admin.from('scoring_config').select('*').single()
  const correctWinnerPts = config?.correct_winner_points ?? 3
  const exactScorePts = config?.exact_score_points ?? 5

  // Predictions: guard idempotente usando is_correct IS NULL.
  // Hoy is_correct arranca como NULL y se setea al resolver. El UPDATE con
  // .is('is_correct', null) garantiza que solo se transiciona una vez —
  // si re-corre, el rowcount=0 y no volvemos a sumar total_points.
  //
  // Paralelizado con Promise.all: para un partido con N predictions/bets,
  // antes hacíamos N round-trips secuenciales (~10s para 100 bets).
  // Ahora son N requests concurrentes (~200ms). Las RPCs atomic_credits
  // son safe con concurrencia (row-level lock) + el UNIQUE constraint
  // sigue siendo defensa en profundidad.
  const { data: predictions } = await admin
    .from('predictions')
    .select('id, user_id, predicted_winner, predicted_home_score, predicted_away_score')
    .eq('match_id', matchId)
    .is('is_correct', null)
    .returns<PendingPredictionRow[]>()

  await Promise.all((predictions ?? []).map(async (pred) => {
    const isWinnerCorrect = pred.predicted_winner === winner
    const isExactScore = pred.predicted_home_score === homeScore && pred.predicted_away_score === awayScore

    let points = 0
    if (isExactScore) points = exactScorePts
    else if (isWinnerCorrect) points = correctWinnerPts

    const { data: updated } = await admin
      .from('predictions')
      .update({ is_correct: isWinnerCorrect, points_earned: points })
      .eq('id', pred.id)
      .is('is_correct', null)
      .select('id')
      .maybeSingle()

    if (updated && points > 0) {
      // Atomic increment via RPC. El SELECT-then-UPDATE de antes podia perder
      // puntos si el mismo user tenia predictions en 2 matches resolviendo
      // concurrentes (autoResolveMatch corre Promise.all a nivel match en
      // syncFinishedScores). add_points hace UPDATE SET total_points =
      // total_points + N en 1 sola query con row-lock implicito.
      const { error: addErr } = await admin.rpc('add_points', { p_user_id: pred.user_id, p_amount: points })
      if (addErr) {
        void logError('sync.autoResolveMatch.addPoints', addErr, { userId: pred.user_id, points, matchId }, 'error')
      }
    }
  }))

  const { data: bets } = await admin
    .from('bets')
    .select('id, user_id, pick, market_type, amount, odds_at_placement, potential_payout')
    .eq('match_id', matchId)
    .eq('status', 'pending')
    .returns<PendingBetRow[]>()

  await Promise.all((bets ?? []).map(async (bet) => {
    // evaluatePick ramifica por market_type. Para 1X2 mantiene comportamiento
    // viejo. Para btts/totals/double_chance/dnb agrega settlement correcto.
    // 'void' (solo en Draw No Bet con empate) -> bet cancelled + refund stake.
    const outcome = evaluatePick(bet.market_type, bet.pick, homeScore, awayScore)
    const nextStatus = outcome === 'won' ? 'won' : outcome === 'void' ? 'cancelled' : 'lost'

    const { data: updatedBet } = await admin
      .from('bets')
      .update({ status: nextStatus, resolved_at: new Date().toISOString() })
      .eq('id', bet.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (!updatedBet) return

    if (outcome === 'won') {
      const paid = await addCredits(bet.user_id, bet.potential_payout, 'win', `Gano apuesta ${bet.pick} x${bet.odds_at_placement}`, bet.id)
      if (!paid.success) {
        // Bet quedo marcada como won pero el pago fallo — descuadre balance vs ledger.
        // Critical: aparecera en el panel de observabilidad bajo "diff balance vs ledger".
        void logError('sync.autoResolveMatch.paymentFailed', paid.error ?? 'unknown', {
          betId: bet.id, userId: bet.user_id, amount: bet.potential_payout, matchId,
        }, 'critical')
      }
    } else if (outcome === 'void') {
      // Refund del stake con reference_id estable. Sufijo '-void' diferencia
      // del posible 'win' que comparta el bet.id como referencia. UNIQUE
      // constraint en credit_transactions(user_id, type, reference_id)
      // garantiza idempotencia si se reintenta.
      const refunded = await addCredits(
        bet.user_id, bet.amount, 'refund',
        `Refund apuesta ${bet.pick} (Draw No Bet con empate)`,
        bet.id + '-void',
      )
      if (!refunded.success) {
        void logError('sync.autoResolveMatch.voidRefundFailed', refunded.error ?? 'unknown', {
          betId: bet.id, userId: bet.user_id, amount: bet.amount, matchId,
        }, 'critical')
      }
    }
  }))

  const { data: parlayLegs } = await admin
    .from('parlay_legs')
    .select('id, parlay_id, pick, market_type')
    .eq('match_id', matchId)
    .eq('status', 'pending')
    .returns<PendingParlayLegRow[]>()
  // Parlay legs NO se paralelizan: cada cierre de parlay implica leer todas
  // las legs del mismo parlay para detectar allResolved. Si dos legs del
  // mismo parlay corren concurrentes, ambas verían "allResolved" y intentarían
  // cerrar el parlay. El UPDATE con guard pending solo deja pasar uno, pero
  // simpler: procesarlos en serie. La cantidad de parlays con leg en un mismo
  // match suele ser baja vs. bets individuales.
  for (const leg of parlayLegs ?? []) {
    // evaluatePick ramifica por market_type. Misma logica que en bets.
    // Si una leg sale 'void' (DNB con empate), tratamos como 'void' status
    // de la leg — el agregado del parlay ya maneja void (lo recalcula como
    // si la leg fuera neutral, mismo patron que cuando un match se cancela).
    const outcome = evaluatePick(leg.market_type, leg.pick, homeScore, awayScore)
    const nextLegStatus = outcome === 'won' ? 'won' : outcome === 'void' ? 'void' : 'lost'
    await admin.from('parlay_legs').update({ status: nextLegStatus }).eq('id', leg.id).eq('status', 'pending')

    const { data: allLegs } = await admin.from('parlay_legs').select('status').eq('parlay_id', leg.parlay_id)
    const allResolved = allLegs?.every(l => l.status !== 'pending')

    if (allResolved) {
      // Tres outcomes posibles del parlay:
      //  - allWon (todas legs won) → status='won', paga potential_payout
      //  - hasVoid (alguna leg void por match cancelado) → status='void', refund del stake
      //  - default → status='lost', sin pago
      const allWon = allLegs?.every(l => l.status === 'won') ?? false
      const hasVoid = allLegs?.some(l => l.status === 'void') ?? false
      const newStatus = hasVoid && !allLegs?.some(l => l.status === 'lost')
        ? 'void'
        : (allWon ? 'won' : 'lost')

      const { data: parlay } = await admin
        .from('parlays')
        .select('*')
        .eq('id', leg.parlay_id)
        .eq('status', 'pending')
        .maybeSingle()

      if (parlay) {
        const { data: updatedParlay } = await admin
          .from('parlays')
          .update({ status: newStatus })
          .eq('id', parlay.id)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle()

        if (updatedParlay) {
          if (newStatus === 'won') {
            const paid = await addCredits(parlay.user_id, parlay.potential_payout, 'win', `Gano parlay x${parlay.total_odds}`, parlay.id)
            if (!paid.success) {
              void logError('sync.autoResolveMatch.parlayPaymentFailed', paid.error ?? 'unknown', {
                parlayId: parlay.id, userId: parlay.user_id, amount: parlay.potential_payout, matchId,
              }, 'critical')
            }
          } else if (newStatus === 'void') {
            const refunded = await addCredits(parlay.user_id, parlay.amount, 'refund', `Parlay void: leg cancelada`, parlay.id)
            if (!refunded.success) {
              void logError('sync.autoResolveMatch.parlayRefundFailed', refunded.error ?? 'unknown', {
                parlayId: parlay.id, userId: parlay.user_id, amount: parlay.amount, matchId,
              }, 'critical')
            }
          }
        }
      }
    }
  }
}

/**
 * Cancela un partido y reembolsa todas las apuestas afectadas.
 *
 * Reglas:
 * - Bets pending de este match → status='cancelled' + refund del amount original.
 * - Parlay legs pending → status='void'.
 * - Cada parlay con una leg void se vuelve 'void' + refund del amount original.
 *   Regla conservadora (favor del user): una sola leg void cancela todo el parlay
 *   y refunda. Alternativa sportsbook (recalcular odds sin la leg void) es mas
 *   compleja y la dejamos para una version futura.
 * - Si un parlay ya tenia legs perdidas, queda como 'lost' (no refund) — la
 *   leg void no salva un parlay ya perdido.
 *
 * Idempotente: usa .eq('status','pending') en cada UPDATE. Si esta funcion se
 * llama 2 veces, la segunda no afecta rows.
 *
 * NOTA: cada refund llama addCredits() que usa add_credits_atomic (atomico
 * con audit). No es 100% transaccional a nivel "cancelMatch entero" — si crashea
 * a mitad, algunas bets quedan canceladas y otras pending. Un re-run del mismo
 * cancelMatch va a cubrir las restantes.
 */
export async function voidBetsForCancelledMatch(matchId: string): Promise<{
  bets_voided: number
  parlay_legs_voided: number
  parlays_voided: number
  parlays_lost: number
  refunded_amount: number
}> {
  const admin = createAdminClient()
  let betsVoided = 0
  let parlayLegsVoided = 0
  let parlaysVoided = 0
  let parlaysLost = 0
  let refundedTotal = 0

  // ─── Bets singles ─────────────────────────────────────────────
  const { data: bets } = await admin
    .from('bets')
    .select('id, user_id, amount, pick, odds_at_placement')
    .eq('match_id', matchId)
    .eq('status', 'pending')

  for (const bet of bets ?? []) {
    const { data: updated } = await admin
      .from('bets')
      .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
      .eq('id', bet.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (!updated) continue  // alguien ya lo proceso

    const refund = await addCredits(
      bet.user_id,
      bet.amount,
      'refund',
      `Refund apuesta ${bet.pick} (partido cancelado)`,
      bet.id,
    )
    if (refund.success) {
      betsVoided++
      refundedTotal += bet.amount
    }
  }

  // ─── Parlay legs ──────────────────────────────────────────────
  const { data: legs } = await admin
    .from('parlay_legs')
    .select('id, parlay_id')
    .eq('match_id', matchId)
    .eq('status', 'pending')

  const affectedParlayIds = new Set<string>()
  for (const leg of legs ?? []) {
    const { data: updated } = await admin
      .from('parlay_legs')
      .update({ status: 'void' })
      .eq('id', leg.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (!updated) continue
    parlayLegsVoided++
    affectedParlayIds.add(leg.parlay_id)
  }

  // ─── Parlays afectados ────────────────────────────────────────
  for (const parlayId of affectedParlayIds) {
    const { data: parlay } = await admin
      .from('parlays')
      .select('id, user_id, amount, status')
      .eq('id', parlayId)
      .single()
    if (!parlay) continue

    // Si el parlay ya no esta pending (resuelto antes), no tocamos.
    if (parlay.status !== 'pending') continue

    const { data: allLegs } = await admin
      .from('parlay_legs')
      .select('status')
      .eq('parlay_id', parlayId)

    const hasLost = allLegs?.some(l => l.status === 'lost') ?? false
    const hasPending = allLegs?.some(l => l.status === 'pending') ?? false

    if (hasLost) {
      // Parlay ya estaba perdido — marcamos lost, sin refund.
      const { data: updated } = await admin
        .from('parlays')
        .update({ status: 'lost' })
        .eq('id', parlayId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      if (updated) parlaysLost++
      continue
    }

    if (hasPending) {
      // El parlay tiene otras legs todavia pending — esperamos a que se
      // resuelvan. La leg void cuenta como "no perdida" pero aun no
      // disparamos refund hasta saber el destino final del parlay.
      continue
    }

    // Todas las legs son void o won (sin lost ni pending). Conservador:
    // una sola void = parlay void + refund completo.
    const hasVoid = allLegs?.some(l => l.status === 'void') ?? false
    if (hasVoid) {
      const { data: updated } = await admin
        .from('parlays')
        .update({ status: 'void' })
        .eq('id', parlayId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      if (!updated) continue

      const refund = await addCredits(
        parlay.user_id,
        parlay.amount,
        'refund',
        `Refund parlay (partido cancelado)`,
        parlay.id,
      )
      if (refund.success) {
        parlaysVoided++
        refundedTotal += parlay.amount
      }
    }
  }

  return {
    bets_voided: betsVoided,
    parlay_legs_voided: parlayLegsVoided,
    parlays_voided: parlaysVoided,
    parlays_lost: parlaysLost,
    refunded_amount: refundedTotal,
  }
}
