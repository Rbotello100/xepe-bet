import { fetchFixtureById } from '@/lib/football-api/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { addCredits } from '@/lib/credits'
import { getMatchesNeedingScoreSync } from './scheduler'

/**
 * Sincroniza scores 1 sola vez por partido (130 min después del kickoff).
 *
 * Flujo:
 * 1. Lee de la BD los matches que necesitan sync (kickoff + 130min ya pasó, no syncados, < 3 intentos)
 * 2. Para cada match, hace 1 request a API-Football por fixture específico
 * 3. Si el fixture está terminado (FT/AET/PEN), actualiza score + marca synced + dispara autoResolveMatch
 * 4. Si no está terminado o falta info, incrementa attempts (3 fallidos = se rinde)
 */
export async function syncFinishedScores() {
  const admin = createAdminClient()
  const pending = await getMatchesNeedingScoreSync()

  if (pending.length === 0) {
    return { skipped: true, reason: 'No matches pending score sync', synced: 0 }
  }

  let synced = 0
  let stillPlaying = 0
  let notFound = 0
  let autoResolved = 0

  for (const match of pending) {
    if (!match.external_id) {
      await admin
        .from('matches')
        .update({ score_sync_attempts: 999 })
        .eq('id', match.id)
      continue
    }

    let fixture
    try {
      fixture = await fetchFixtureById(match.external_id)
    } catch {
      await incrementSyncAttempts(match.id)
      continue
    }

    if (!fixture) {
      await incrementSyncAttempts(match.id)
      notFound++
      continue
    }

    const { goals, fixture: fix } = fixture
    const isFinished = ['FT', 'AET', 'PEN'].includes(fix.status.short)

    if (!isFinished) {
      // El partido sigue jugándose o aún no empezó el live data — incrementar attempts
      await incrementSyncAttempts(match.id)
      stillPlaying++
      continue
    }

    if (goals.home == null || goals.away == null) {
      await incrementSyncAttempts(match.id)
      continue
    }

    // Detectar si el match estaba pending antes (para evitar double-resolve)
    const { data: existing } = await admin
      .from('matches')
      .select('status')
      .eq('id', match.id)
      .single()

    const wasNotFinished = existing && existing.status !== 'finished'

    // Actualizar match con score y marcar synced
    const { error } = await admin
      .from('matches')
      .update({
        home_score: goals.home,
        away_score: goals.away,
        status: 'finished',
        score_synced: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', match.id)

    if (error) continue
    synced++

    // Auto-resolve solo si no estaba ya finalizado (idempotente)
    if (wasNotFinished) {
      await autoResolveMatch(match.id, goals.home, goals.away)
      autoResolved++
    }
  }

  return { pending: pending.length, synced, still_playing: stillPlaying, not_found: notFound, auto_resolved: autoResolved }
}

async function incrementSyncAttempts(matchId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from('matches').select('score_sync_attempts').eq('id', matchId).single()
  const current = data?.score_sync_attempts ?? 0
  await admin.from('matches').update({ score_sync_attempts: current + 1 }).eq('id', matchId)
}

/**
 * Resuelve automáticamente todas las predictions, bets y parlays de un partido finalizado.
 * Mismo flow que admin.resolveMatch — solo paga bets/legs con status='pending', así es idempotente.
 */
async function autoResolveMatch(matchId: string, homeScore: number, awayScore: number) {
  const admin = createAdminClient()

  const winner = homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw'

  // Scoring config
  const { data: config } = await admin.from('scoring_config').select('*').single()
  const correctWinnerPts = config?.correct_winner_points ?? 3
  const exactScorePts = config?.exact_score_points ?? 5

  // Predictions
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

  // Bets
  const { data: bets } = await admin.from('bets').select('*').eq('match_id', matchId).eq('status', 'pending')
  for (const bet of bets ?? []) {
    const betWon = bet.pick === winner || bet.pick === (winner === 'home' ? '1' : winner === 'away' ? '2' : 'X')

    await admin.from('bets').update({
      status: betWon ? 'won' : 'lost',
      resolved_at: new Date().toISOString(),
    }).eq('id', bet.id).eq('status', 'pending') // guard: solo si sigue pending

    if (betWon) {
      await addCredits(bet.user_id, bet.potential_payout, 'win', `Gano apuesta ${bet.pick} x${bet.odds_at_placement}`, bet.id)
    }
  }

  // Parlay legs
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
