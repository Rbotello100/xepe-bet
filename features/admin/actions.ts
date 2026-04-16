'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { syncMatchOdds } from '@/lib/sync/odds'
import { addCredits } from '@/lib/credits'

export async function resolveMatch(matchId: string, homeScore: number, awayScore: number) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return { error: 'No autorizado' }

  const admin = createAdminClient()

  // Get match info for feed
  const { data: match } = await admin.from('matches')
    .select('*, home_team:teams!home_team_id(name), away_team:teams!away_team_id(name)')
    .eq('id', matchId).single()

  // Update match
  await admin.from('matches').update({
    home_score: homeScore,
    away_score: awayScore,
    status: 'finished',
    updated_at: new Date().toISOString(),
  }).eq('id', matchId)

  // Determine winner
  const winner = homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw'

  // Get scoring config
  const { data: config } = await admin.from('scoring_config').select('*').single()
  const correctWinnerPts = config?.correct_winner_points ?? 3
  const exactScorePts = config?.exact_score_points ?? 5

  // Resolve predictions
  const { data: predictions } = await admin.from('predictions').select('*').eq('match_id', matchId)
  for (const pred of predictions ?? []) {
    const isWinnerCorrect = pred.predicted_winner === winner
    const isExactScore = pred.predicted_home_score === homeScore && pred.predicted_away_score === awayScore

    let points = 0
    if (isExactScore) points = exactScorePts
    else if (isWinnerCorrect) points = correctWinnerPts

    await admin.from('predictions').update({
      is_correct: isWinnerCorrect,
      points_earned: points,
    }).eq('id', pred.id)

    // Update user total points
    if (points > 0) {
      const { data: userProfile } = await admin.from('profiles').select('total_points').eq('id', pred.user_id).single()
      if (userProfile) {
        await admin.from('profiles').update({
          total_points: (userProfile.total_points ?? 0) + points,
        }).eq('id', pred.user_id)
      }
    }
  }

  // Resolve bets
  const { data: bets } = await admin.from('bets').select('*').eq('match_id', matchId).eq('status', 'pending')
  let betsWon = 0
  let betsLost = 0
  for (const bet of bets ?? []) {
    const betWon = bet.pick === winner || bet.pick === (winner === 'home' ? '1' : winner === 'away' ? '2' : 'X')

    await admin.from('bets').update({
      status: betWon ? 'won' : 'lost',
      resolved_at: new Date().toISOString(),
    }).eq('id', bet.id)

    if (betWon) {
      betsWon++
      await addCredits(bet.user_id, bet.potential_payout, 'win', `Gano apuesta ${bet.pick} x${bet.odds_at_placement}`, bet.id)
    } else {
      betsLost++
    }
  }

  // Resolve parlay legs for this match
  const { data: parlayLegs } = await admin.from('parlay_legs').select('*').eq('match_id', matchId).eq('status', 'pending')
  let parlaysResolved = 0
  for (const leg of parlayLegs ?? []) {
    const legWon = leg.pick === winner || leg.pick === (winner === 'home' ? '1' : winner === 'away' ? '2' : 'X')

    await admin.from('parlay_legs').update({
      status: legWon ? 'won' : 'lost',
    }).eq('id', leg.id)

    // Check if ALL legs of this parlay are resolved
    const { data: allLegs } = await admin.from('parlay_legs').select('status').eq('parlay_id', leg.parlay_id)
    const allResolved = allLegs?.every(l => l.status !== 'pending')

    if (allResolved) {
      const allWon = allLegs?.every(l => l.status === 'won')
      const { data: parlay } = await admin.from('parlays').select('*').eq('id', leg.parlay_id).single()

      if (parlay) {
        await admin.from('parlays').update({
          status: allWon ? 'won' : 'lost',
        }).eq('id', parlay.id)

        if (allWon) {
          await addCredits(parlay.user_id, parlay.potential_payout, 'win', `Gano parlay ${allLegs?.length} legs x${parlay.total_odds}`, parlay.id)
        }
        parlaysResolved++
      }
    }
  }

  // Activity feed for match resolution
  await admin.from('activity_feed').insert({
    user_id: user.id,
    action_type: 'achievement',
    description: `resolvio ${match.home_team?.name ?? 'Local'} ${homeScore}-${awayScore} ${match.away_team?.name ?? 'Visita'}`,
    metadata: { match_id: matchId, home_score: homeScore, away_score: awayScore },
  }).then(() => {})

  revalidatePath('/')
  return {
    success: true,
    predictions_resolved: predictions?.length ?? 0,
    bets_won: betsWon,
    bets_lost: betsLost,
    parlays_resolved: parlaysResolved,
  }
}

export async function syncOddsManual() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return { error: 'No autorizado' }

  try {
    const result = await syncMatchOdds()
    return result
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function updateScoringConfig(config: {
  correct_winner_points: number
  exact_score_points: number
  correct_goal_diff_points: number
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return { error: 'No autorizado' }

  const admin = createAdminClient()
  const { error } = await admin.from('scoring_config').upsert({
    id: '00000000-0000-0000-0000-000000000001',
    ...config,
    updated_at: new Date().toISOString(),
  })

  if (error) return { error: error.message }
  revalidatePath('/admin')
  return { success: true }
}
