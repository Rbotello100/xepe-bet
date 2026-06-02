import { fetchScores } from '@/lib/odds-api/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { addCredits } from '@/lib/credits'
import { SCORE_SYNC_WINDOW_DAYS } from '@/lib/constants'
import { getMatchesNeedingScoreSync } from './scheduler'
import { logOddsApiUsage, type UsageTrigger } from '@/lib/odds-api/usage'
import type { OddsScoreEvent } from '@/lib/odds-api/types'

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

  let synced = 0
  let stillPlaying = 0
  let notFound = 0
  let autoResolved = 0
  let nameMismatch = 0

  for (const match of pending) {
    if (!match.external_id) {
      await admin.from('matches').update({ score_sync_attempts: 999 }).eq('id', match.id)
      continue
    }

    const event = scoresMap.get(match.external_id)

    if (!event) {
      await incrementSyncAttempts(match.id)
      notFound++
      continue
    }

    if (!event.completed || !event.scores) {
      await incrementSyncAttempts(match.id)
      stillPlaying++
      continue
    }

    const parsed = parseScoresByTeamName(event)
    if (!parsed) {
      await incrementSyncAttempts(match.id)
      nameMismatch++
      continue
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

    if (error) continue
    synced++

    if (wasNotFinished) {
      await autoResolveMatch(match.id, parsed.home, parsed.away)
      autoResolved++
    }
  }

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

  const winner = homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw'

  const { data: config } = await admin.from('scoring_config').select('*').single()
  const correctWinnerPts = config?.correct_winner_points ?? 3
  const exactScorePts = config?.exact_score_points ?? 5

  const { data: predictions } = await admin.from('predictions').select('*').eq('match_id', matchId)
  for (const pred of predictions ?? []) {
    const isWinnerCorrect = pred.predicted_winner === winner
    const isExactScore = pred.predicted_home_score === homeScore && pred.predicted_away_score === awayScore

    let points = 0
    if (isExactScore) points = exactScorePts
    else if (isWinnerCorrect) points = correctWinnerPts

    await admin.from('predictions').update({ is_correct: isWinnerCorrect, points_earned: points }).eq('id', pred.id)

    if (points > 0) {
      const { data: profile } = await admin.from('profiles').select('total_points').eq('id', pred.user_id).single()
      if (profile) {
        await admin.from('profiles').update({ total_points: (profile.total_points ?? 0) + points }).eq('id', pred.user_id)
      }
    }
  }

  const { data: bets } = await admin.from('bets').select('*').eq('match_id', matchId).eq('status', 'pending')
  for (const bet of bets ?? []) {
    const betWon = bet.pick === winner || bet.pick === (winner === 'home' ? '1' : winner === 'away' ? '2' : 'X')

    await admin.from('bets').update({
      status: betWon ? 'won' : 'lost',
      resolved_at: new Date().toISOString(),
    }).eq('id', bet.id).eq('status', 'pending')

    if (betWon) {
      await addCredits(bet.user_id, bet.potential_payout, 'win', `Gano apuesta ${bet.pick} x${bet.odds_at_placement}`, bet.id)
    }
  }

  const { data: parlayLegs } = await admin.from('parlay_legs').select('*').eq('match_id', matchId).eq('status', 'pending')
  for (const leg of parlayLegs ?? []) {
    const legWon = leg.pick === winner || leg.pick === (winner === 'home' ? '1' : winner === 'away' ? '2' : 'X')
    await admin.from('parlay_legs').update({ status: legWon ? 'won' : 'lost' }).eq('id', leg.id).eq('status', 'pending')

    const { data: allLegs } = await admin.from('parlay_legs').select('status').eq('parlay_id', leg.parlay_id)
    const allResolved = allLegs?.every(l => l.status !== 'pending')

    if (allResolved) {
      const allWon = allLegs?.every(l => l.status === 'won')
      const { data: parlay } = await admin.from('parlays').select('*').eq('id', leg.parlay_id).eq('status', 'pending').single()

      if (parlay) {
        await admin.from('parlays').update({ status: allWon ? 'won' : 'lost' }).eq('id', parlay.id).eq('status', 'pending')
        if (allWon) {
          await addCredits(parlay.user_id, parlay.potential_payout, 'win', `Gano parlay x${parlay.total_odds}`, parlay.id)
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
