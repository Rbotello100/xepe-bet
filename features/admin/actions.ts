'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { syncMatchOdds } from '@/lib/sync/odds'
import { syncFinishedScores, autoResolveMatch, voidBetsForCancelledMatch } from '@/lib/sync/scores'
import { discoverAllSports, type DiscoverResult } from '@/lib/sync/discover'
import { addCredits } from '@/lib/credits'
import { logError } from '@/lib/log/error'
import { pickMatchesWinner } from '@/lib/utils/pick'
import { ACTIVE_SPORT_KEYS, type BetPick } from '@/lib/constants'

/**
 * Devuelve null si el request es de un admin válido; devuelve `{ error }` si falla.
 * Callers: `const fail = await requireAdmin(); if (fail) return fail;`
 */
async function requireAdmin(): Promise<{ error: string } | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return { error: 'No autorizado' }
  return null
}

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

  // Resolve predictions — guard idempotente (mismo patron que autoResolveMatch).
  // is_correct IS NULL antes de resolver, set después. UPDATE con .is(null) +
  // rowcount=1 garantiza que la suma a total_points solo pasa una vez.
  const { data: predictions } = await admin.from('predictions').select('*').eq('match_id', matchId).is('is_correct', null)
  for (const pred of predictions ?? []) {
    const isWinnerCorrect = pred.predicted_winner === winner
    const isExactScore = pred.predicted_home_score === homeScore && pred.predicted_away_score === awayScore

    let points = 0
    if (isExactScore) points = exactScorePts
    else if (isWinnerCorrect) points = correctWinnerPts

    const { data: updatedPred } = await admin.from('predictions').update({
      is_correct: isWinnerCorrect,
      points_earned: points,
    }).eq('id', pred.id).is('is_correct', null).select('id').maybeSingle()

    if (updatedPred && points > 0) {
      const { data: userProfile } = await admin.from('profiles').select('total_points').eq('id', pred.user_id).single()
      if (userProfile) {
        await admin.from('profiles').update({
          total_points: (userProfile.total_points ?? 0) + points,
        }).eq('id', pred.user_id)
      }
    }
  }

  // Resolve bets — UPDATE con guard pending + rowcount check para idempotencia.
  // Si el partido se resolvio antes (cron concurrente o admin retry), el UPDATE
  // devuelve 0 rows y no llamamos addCredits (addCredits tambien tiene chequeo
  // de idempotency via reference_id como segunda capa).
  const { data: bets } = await admin.from('bets').select('*').eq('match_id', matchId).eq('status', 'pending')
  let betsWon = 0
  let betsLost = 0
  for (const bet of bets ?? []) {
    const betWon = pickMatchesWinner(bet.pick as BetPick, winner)

    const { data: updatedBet } = await admin.from('bets').update({
      status: betWon ? 'won' : 'lost',
      resolved_at: new Date().toISOString(),
    }).eq('id', bet.id).eq('status', 'pending').select('id').maybeSingle()

    if (!updatedBet) continue  // ya procesada por otra invocacion

    if (betWon) {
      betsWon++
      const paid = await addCredits(bet.user_id, bet.potential_payout, 'win', `Gano apuesta ${bet.pick} x${bet.odds_at_placement}`, bet.id)
      if (!paid.success) {
        // La bet ya quedo marcada won. addCredits logueo el error. Logueamos
        // duplicado con contexto admin para que sea trivial encontrarlo en obs.
        await logError('admin.resolveMatch.payBet', paid.error ?? 'pago_fallido', { betId: bet.id, userId: bet.user_id, amount: bet.potential_payout, matchId }, 'critical')
      }
    } else {
      betsLost++
    }
  }

  // Resolve parlay legs — mismo patron. Si TODAS las legs estan resueltas, cerrar
  // el parlay: 'won' si todas ganaron, 'void' si hay una void (refund stake),
  // 'lost' en cualquier otro caso.
  const { data: parlayLegs } = await admin.from('parlay_legs').select('*').eq('match_id', matchId).eq('status', 'pending')
  let parlaysResolved = 0
  for (const leg of parlayLegs ?? []) {
    const legWon = pickMatchesWinner(leg.pick as BetPick, winner)

    await admin.from('parlay_legs').update({
      status: legWon ? 'won' : 'lost',
    }).eq('id', leg.id).eq('status', 'pending')

    const { data: allLegs } = await admin.from('parlay_legs').select('status').eq('parlay_id', leg.parlay_id)
    const allResolved = allLegs?.every(l => l.status !== 'pending')

    if (allResolved) {
      const allWon = allLegs?.every(l => l.status === 'won') ?? false
      const hasVoid = allLegs?.some(l => l.status === 'void') ?? false
      const hasLost = allLegs?.some(l => l.status === 'lost') ?? false
      // void solo si hay una leg void Y ninguna leg lost: el partido cancelado
      // privo al user de la chance de ganar. Si ya habia una leg perdida, el
      // parlay ya estaba muerto antes del void, sigue como lost.
      const newStatus = hasVoid && !hasLost ? 'void' : (allWon ? 'won' : 'lost')

      const { data: parlay } = await admin.from('parlays')
        .select('*').eq('id', leg.parlay_id).eq('status', 'pending').maybeSingle()

      if (parlay) {
        const { data: updatedParlay } = await admin.from('parlays')
          .update({ status: newStatus })
          .eq('id', parlay.id).eq('status', 'pending').select('id').maybeSingle()

        if (updatedParlay) {
          if (newStatus === 'won') {
            const paid = await addCredits(parlay.user_id, parlay.potential_payout, 'win', `Gano parlay ${allLegs?.length} legs x${parlay.total_odds}`, parlay.id)
            if (!paid.success) {
              await logError('admin.resolveMatch.payParlay', paid.error ?? 'pago_fallido', { parlayId: parlay.id, userId: parlay.user_id, amount: parlay.potential_payout, matchId }, 'critical')
            }
          } else if (newStatus === 'void') {
            const refunded = await addCredits(parlay.user_id, parlay.amount, 'refund', `Parlay void: leg cancelada`, parlay.id)
            if (!refunded.success) {
              await logError('admin.resolveMatch.refundParlay', refunded.error ?? 'refund_fallido', { parlayId: parlay.id, userId: parlay.user_id, amount: parlay.amount, matchId }, 'critical')
            }
          }
          parlaysResolved++
        }
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

/**
 * Marca un partido como cancelled y dispara refund automatico de todas las
 * apuestas afectadas (single bets + parlay legs).
 *
 * Idempotente: si el partido ya esta cancelled o el refund ya corrio, no duplica.
 */
export async function cancelMatch(matchId: string, reason?: string) {
  const fail = await requireAdmin()
  if (fail) return fail

  const admin = createAdminClient()
  const { data: match } = await admin
    .from('matches')
    .select('id, status, home_team:teams!home_team_id(name), away_team:teams!away_team_id(name)')
    .eq('id', matchId)
    .single()

  if (!match) return { error: 'Partido no encontrado' }
  if (match.status === 'cancelled') {
    // Idempotencia: re-correr para procesar bets que hayan quedado pendientes
    const reRefund = await voidBetsForCancelledMatch(matchId)
    revalidatePath('/admin')
    return { success: true, already_cancelled: true, ...reRefund }
  }
  if (match.status === 'finished') return { error: 'Partido ya finalizado, no se puede cancelar' }

  await admin
    .from('matches')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', matchId)

  const refundResult = await voidBetsForCancelledMatch(matchId)

  const homeName = (Array.isArray(match.home_team) ? match.home_team[0] : match.home_team)?.name ?? 'Local'
  const awayName = (Array.isArray(match.away_team) ? match.away_team[0] : match.away_team)?.name ?? 'Visita'

  await admin.from('activity_feed').insert({
    user_id: (await (await createServerClient()).auth.getUser()).data.user?.id,
    action_type: 'achievement',
    description: `cancelo ${homeName} vs ${awayName}${reason ? ` (${reason})` : ''}`,
    metadata: { match_id: matchId, reason: reason ?? null, ...refundResult },
  })

  revalidatePath('/admin')
  return { success: true, ...refundResult }
}

export async function syncOddsManual(sportKey?: string) {
  const fail = await requireAdmin()
  if (fail) return fail

  try {
    const result = await syncMatchOdds(sportKey, 'admin_manual')
    revalidatePath('/admin')
    return result
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/**
 * Descubre events nuevos en The Odds API y los reconcilia con la tabla matches.
 * Linka seeds existentes o inserta matches nuevos a medida que la API los publica.
 */
export async function discoverMatchesManual(sportKey?: string): Promise<{ error: string } | { results: DiscoverResult[] }> {
  const fail = await requireAdmin()
  if (fail) return fail

  try {
    const sports = sportKey ? [sportKey] : [...ACTIVE_SPORT_KEYS]
    const results = await discoverAllSports(sports, 'admin_manual')
    revalidatePath('/admin')
    return { results }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function syncScoresManual() {
  const fail = await requireAdmin()
  if (fail) return fail

  try {
    const result = await syncFinishedScores('admin_manual')
    revalidatePath('/admin')
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

// ===================================================================
// HEALTH CHECK — diagnósticos del panel admin
// ===================================================================

export interface HealthCheckResult {
  orphan_parlays: { id: string; user_id: string; amount: number; created_at: string }[]
  legs_without_match: { id: string; parlay_id: string; pick: string }[]
  bets_pending_finished_match: { id: string; user_id: string; match_id: string; amount: number }[]
  matches_finished_no_score: { id: string; home_name: string; away_name: string }[]
  bets_pending_old: { id: string; user_id: string; match_id: string; amount: number; starts_at: string; home_name: string; away_name: string }[]
}

export async function getHealthChecks(): Promise<{ error: string } | HealthCheckResult> {
  const fail = await requireAdmin()
  if (fail) return fail

  const admin = createAdminClient()

  // 1. Parlays sin legs
  const { data: parlays } = await admin
    .from('parlays')
    .select('id, user_id, amount, created_at')
    .eq('status', 'pending')
  const parlayIds = (parlays ?? []).map(p => p.id)

  let orphanParlays: HealthCheckResult['orphan_parlays'] = []
  if (parlayIds.length > 0) {
    const { data: legsByParlay } = await admin
      .from('parlay_legs')
      .select('parlay_id')
      .in('parlay_id', parlayIds)
    const parlaysWithLegs = new Set((legsByParlay ?? []).map(l => l.parlay_id))
    orphanParlays = (parlays ?? []).filter(p => !parlaysWithLegs.has(p.id))
  }

  // 2. Legs sin match (match_id NULL o match inexistente)
  const { data: allLegs } = await admin
    .from('parlay_legs')
    .select('id, parlay_id, match_id, pick')
    .eq('status', 'pending')
  const matchIds = [...new Set((allLegs ?? []).map(l => l.match_id).filter((x): x is string => !!x))]
  const { data: existingMatches } = matchIds.length > 0
    ? await admin.from('matches').select('id').in('id', matchIds)
    : { data: [] as { id: string }[] }
  const existingMatchSet = new Set((existingMatches ?? []).map(m => m.id))
  const legsWithoutMatch = (allLegs ?? [])
    .filter(l => !l.match_id || !existingMatchSet.has(l.match_id))
    .map(l => ({ id: l.id, parlay_id: l.parlay_id, pick: l.pick }))

  // 3. Bets pending cuyo match ya está finished (deberían haberse pagado)
  const { data: orphanBets } = await admin
    .from('bets')
    .select('id, user_id, match_id, amount, match:matches!match_id(status)')
    .eq('status', 'pending')
  const betsPendingFinishedMatch = (orphanBets ?? [])
    .filter(b => {
      const m = Array.isArray(b.match) ? b.match[0] : b.match
      return m?.status === 'finished'
    })
    .map(b => ({ id: b.id, user_id: b.user_id, match_id: b.match_id, amount: b.amount }))

  // 4. Matches status=finished pero sin score
  const { data: noScoreMatches } = await admin
    .from('matches')
    .select('id, home_team:teams!home_team_id(name), away_team:teams!away_team_id(name), home_score, away_score')
    .eq('status', 'finished')
    .or('home_score.is.null,away_score.is.null')
  const matchesFinishedNoScore = (noScoreMatches ?? []).map(m => {
    const home = Array.isArray(m.home_team) ? m.home_team[0] : m.home_team
    const away = Array.isArray(m.away_team) ? m.away_team[0] : m.away_team
    return { id: m.id, home_name: home?.name ?? '?', away_name: away?.name ?? '?' }
  })

  // 5. Bets pending con match > 3 días viejo (fuera de ventana /scores)
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data: oldBets } = await admin
    .from('bets')
    .select('id, user_id, match_id, amount, match:matches!match_id(starts_at, status, home_team:teams!home_team_id(name), away_team:teams!away_team_id(name))')
    .eq('status', 'pending')
  const betsPendingOld = (oldBets ?? [])
    .filter(b => {
      const m = Array.isArray(b.match) ? b.match[0] : b.match
      return m?.starts_at && m.starts_at < cutoff && m.status !== 'finished'
    })
    .map(b => {
      const m = (Array.isArray(b.match) ? b.match[0] : b.match) as { starts_at: string; home_team: { name: string } | { name: string }[]; away_team: { name: string } | { name: string }[] }
      const home = Array.isArray(m.home_team) ? m.home_team[0] : m.home_team
      const away = Array.isArray(m.away_team) ? m.away_team[0] : m.away_team
      return {
        id: b.id,
        user_id: b.user_id,
        match_id: b.match_id,
        amount: b.amount,
        starts_at: m.starts_at,
        home_name: home?.name ?? '?',
        away_name: away?.name ?? '?',
      }
    })

  return {
    orphan_parlays: orphanParlays,
    legs_without_match: legsWithoutMatch,
    bets_pending_finished_match: betsPendingFinishedMatch,
    matches_finished_no_score: matchesFinishedNoScore,
    bets_pending_old: betsPendingOld,
  }
}

/**
 * Cierra un parlay huérfano (sin legs) marcándolo 'void' y reintegrando el monto al usuario.
 * Idempotente: si el parlay no está pending, no hace nada.
 */
export async function voidOrphanParlay(parlayId: string) {
  const fail = await requireAdmin()
  if (fail) return fail

  const admin = createAdminClient()

  const { data: parlay } = await admin
    .from('parlays')
    .select('id, user_id, amount, status')
    .eq('id', parlayId)
    .single()

  if (!parlay) return { error: 'Parlay no encontrado' }
  if (parlay.status !== 'pending') return { error: `Parlay ya está en estado ${parlay.status}` }

  const { count: legCount } = await admin
    .from('parlay_legs')
    .select('id', { count: 'exact', head: true })
    .eq('parlay_id', parlayId)

  if ((legCount ?? 0) > 0) return { error: 'Parlay tiene legs, no es huérfano' }

  const { error } = await admin
    .from('parlays')
    .update({ status: 'void' })
    .eq('id', parlayId)
    .eq('status', 'pending')

  if (error) return { error: error.message }

  const refunded = await addCredits(parlay.user_id, parlay.amount, 'refund', `Refund parlay huérfano`, parlayId)
  if (!refunded.success) {
    // El parlay quedo void. addCredits ya logueo. Devolvemos error al admin
    // para que sepa que el refund no se aplico y deba retry manualmente.
    await logError('admin.refundOrphanParlay', refunded.error ?? 'refund_fallido', { parlayId, userId: parlay.user_id, amount: parlay.amount }, 'critical')
    return { error: 'Parlay marcado void, pero el refund fallo. Reintentá desde observabilidad.' }
  }

  revalidatePath('/admin')
  return { success: true, refunded: parlay.amount, user_id: parlay.user_id }
}

/**
 * Cierra TODOS los parlays huérfanos de la tabla y refunda a sus users.
 * Uso: botón 'Cerrar todos los huérfanos' en el panel admin.
 */
export async function voidAllOrphanParlays() {
  const fail = await requireAdmin()
  if (fail) return fail

  const health = await getHealthChecks()
  if ('error' in health) return health

  const results: { parlay_id: string; success: boolean; refunded?: number; error?: string }[] = []
  for (const p of health.orphan_parlays) {
    const r = await voidOrphanParlay(p.id)
    if ('error' in r) {
      results.push({ parlay_id: p.id, success: false, error: r.error })
    } else {
      results.push({ parlay_id: p.id, success: true, refunded: r.refunded })
    }
  }

  revalidatePath('/admin')
  return {
    total: results.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  }
}

/**
 * Re-corre la lógica de auto-resolución para un partido ya finished.
 * Usa el score ya guardado en la tabla. Idempotente gracias al guard eq('status','pending').
 */
export async function reconcileMatch(matchId: string) {
  const fail = await requireAdmin()
  if (fail) return fail

  const admin = createAdminClient()
  const { data: match } = await admin
    .from('matches')
    .select('id, status, home_score, away_score')
    .eq('id', matchId)
    .single()

  if (!match) return { error: 'Partido no encontrado' }
  if (match.status !== 'finished') return { error: 'Partido no está finished' }
  if (match.home_score === null || match.away_score === null) return { error: 'Partido sin score' }

  await autoResolveMatch(matchId, match.home_score, match.away_score)
  revalidatePath('/admin')
  return { success: true }
}

// ===================================================================
// ODDS API USAGE
// ===================================================================

export interface ApiUsageEntry {
  id: string
  endpoint: string
  sport_key: string
  credits_used: number
  remaining: number | null
  triggered_by: string
  result_summary: Record<string, unknown> | null
  error: string | null
  created_at: string
}

export interface ApiUsageSummary {
  recent: ApiUsageEntry[]
  last_remaining: number | null
  credits_today: number
  credits_this_month: number
  by_endpoint: { endpoint: string; credits: number }[]
}

export async function getOddsApiUsage(days = 30): Promise<{ error: string } | ApiUsageSummary> {
  const fail = await requireAdmin()
  if (fail) return fail

  const admin = createAdminClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data: rows } = await admin
    .from('odds_api_usage')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  const entries = (rows ?? []) as ApiUsageEntry[]

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const creditsToday = entries
    .filter(e => new Date(e.created_at) >= startOfToday)
    .reduce((sum, e) => sum + (e.credits_used ?? 0), 0)

  const creditsThisMonth = entries
    .filter(e => new Date(e.created_at) >= startOfMonth)
    .reduce((sum, e) => sum + (e.credits_used ?? 0), 0)

  const byEndpoint = new Map<string, number>()
  for (const e of entries) {
    byEndpoint.set(e.endpoint, (byEndpoint.get(e.endpoint) ?? 0) + (e.credits_used ?? 0))
  }

  const lastWithRemaining = entries.find(e => e.remaining !== null)

  return {
    recent: entries.slice(0, 20),
    last_remaining: lastWithRemaining?.remaining ?? null,
    credits_today: creditsToday,
    credits_this_month: creditsThisMonth,
    by_endpoint: Array.from(byEndpoint, ([endpoint, credits]) => ({ endpoint, credits })),
  }
}
