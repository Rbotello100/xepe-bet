'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { MIN_BET, MAX_BET, BET_LOCK_HOURS } from '@/lib/constants'
import { calculateCashOut } from '@/lib/utils/cash-out'
import type { BetInput, ParlayInput } from './types'

// Auth check: uses user's session cookies
async function getAuthUser() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// All DB operations use admin client (bypasses RLS)
// This is safe because we validate auth above
function db() {
  return createAdminClient()
}

function validateMatchOpen(match: { starts_at: string; status: string }): string | null {
  if (match.status === 'finished') return 'Partido ya finalizado'
  if (match.status === 'cancelled') return 'Partido cancelado'
  if (match.status === 'live') return 'Partido en curso'
  const lockTime = new Date(new Date(match.starts_at).getTime() - BET_LOCK_HOURS * 60 * 60 * 1000)
  if (new Date() >= lockTime) return 'Apuestas cerradas para este partido'
  return null
}

// ========== PLACE BET ==========
export async function placeBet(input: BetInput) {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }

  if (input.amount < MIN_BET) return { error: `Apuesta minima: $${MIN_BET}` }
  if (input.amount > MAX_BET) return { error: `Apuesta maxima: $${MAX_BET}` }

  const admin = db()

  const { data: match } = await admin.from('matches').select('starts_at, status').eq('id', input.match_id).single()
  if (!match) return { error: 'Partido no encontrado' }

  const matchError = validateMatchOpen(match)
  if (matchError) return { error: matchError }

  const { data: profile } = await admin.from('profiles').select('credits').eq('id', user.id).single()
  if (!profile || profile.credits < input.amount) return { error: 'Creditos insuficientes' }

  const potentialPayout = Math.round(input.amount * input.odds * 100) / 100
  const newBalance = profile.credits - input.amount

  // Deduct credits
  const { error: creditError } = await admin.from('profiles').update({ credits: newBalance }).eq('id', user.id)
  if (creditError) return { error: 'Error al descontar creditos' }

  // Create bet
  const { data: bet, error: betError } = await admin.from('bets').insert({
    user_id: user.id,
    match_id: input.match_id,
    market_type: input.market_type,
    pick: input.pick,
    amount: input.amount,
    odds_at_placement: input.odds,
    potential_payout: potentialPayout,
  }).select('id').single()

  if (betError) {
    await admin.from('profiles').update({ credits: profile.credits }).eq('id', user.id)
    return { error: 'Error al crear apuesta' }
  }

  // Activity feed
  await admin.from('activity_feed').insert({
    user_id: user.id,
    action_type: 'bet',
    description: `aposto $${input.amount} a ${input.pick} x${input.odds}`,
    metadata: { match_id: input.match_id, amount: input.amount, odds: input.odds, market: input.market_type },
  })

  // Credit transaction log (ignore if table doesn't exist)
  await admin.from('credit_transactions').insert({
    user_id: user.id, amount: -input.amount, type: 'bet',
    balance_after: newBalance, reference_id: bet.id,
    description: `Apuesta ${input.pick} x${input.odds}`,
  }).then(() => {}, () => {})

  revalidatePath('/')
  return { success: true, potential_payout: potentialPayout }
}

// ========== CASH OUT ==========
export async function cashOutBet(betId: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }

  const admin = db()

  const { data: bet } = await admin.from('bets')
    .select('*, match:matches!match_id(starts_at, status, odds_home, odds_draw, odds_away)')
    .eq('id', betId).eq('user_id', user.id).eq('status', 'pending').single()

  if (!bet) return { error: 'Apuesta no encontrada' }

  const match = bet.match as { starts_at: string; status: string; odds_home: number; odds_draw: number; odds_away: number }
  const matchError = validateMatchOpen(match)
  if (matchError) return { error: `Cash out no disponible: ${matchError}` }

  let currentOdds: number
  if (bet.pick === 'home' || bet.pick === '1') currentOdds = match.odds_home
  else if (bet.pick === 'away' || bet.pick === '2') currentOdds = match.odds_away
  else currentOdds = match.odds_draw

  if (!currentOdds) return { error: 'Odds no disponibles' }

  const cashOutValue = Math.round(calculateCashOut(bet.odds_at_placement, currentOdds, bet.amount) * 100) / 100

  // Mark bet as cashed out (double-check still pending)
  const { error: updateError } = await admin.from('bets')
    .update({ status: 'cashed_out', cash_out_amount: cashOutValue, cashed_out_at: new Date().toISOString() })
    .eq('id', betId).eq('status', 'pending')

  if (updateError) return { error: 'Error al procesar cash out' }

  // Return credits
  const { data: profile } = await admin.from('profiles').select('credits').eq('id', user.id).single()
  const newBalance = (profile?.credits ?? 0) + cashOutValue
  await admin.from('profiles').update({ credits: newBalance }).eq('id', user.id)

  // Activity feed
  await admin.from('activity_feed').insert({
    user_id: user.id, action_type: 'cash_out',
    description: `hizo cash out de $${cashOutValue}`,
    metadata: { bet_id: betId, cash_out_amount: cashOutValue },
  })

  revalidatePath('/')
  return { success: true, cash_out_amount: cashOutValue }
}

// ========== PLACE PARLAY ==========
export async function placeParlay(input: ParlayInput) {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }

  if (input.legs.length < 2) return { error: 'Minimo 2 selecciones' }
  if (input.legs.length > 10) return { error: 'Maximo 10 selecciones' }
  if (input.amount < MIN_BET) return { error: `Apuesta minima: $${MIN_BET}` }
  if (input.amount > MAX_BET) return { error: `Apuesta maxima: $${MAX_BET}` }

  const admin = db()

  // Validate all legs
  const matchIds = input.legs.map(l => l.match_id)
  if (new Set(matchIds).size !== matchIds.length) return { error: 'No puedes agregar dos selecciones del mismo partido' }

  for (const leg of input.legs) {
    const { data: match } = await admin.from('matches').select('starts_at, status').eq('id', leg.match_id).single()
    if (!match) return { error: 'Partido no encontrado' }
    const err = validateMatchOpen(match)
    if (err) return { error: `${err} (una de las selecciones)` }
  }

  // Check credits
  const { data: profile } = await admin.from('profiles').select('credits').eq('id', user.id).single()
  if (!profile || profile.credits < input.amount) return { error: 'Creditos insuficientes' }

  const totalOdds = Math.round(input.legs.reduce((acc, leg) => acc * leg.odds, 1) * 100) / 100
  const potentialPayout = Math.round(input.amount * totalOdds * 100) / 100
  const newBalance = profile.credits - input.amount

  // Deduct credits
  await admin.from('profiles').update({ credits: newBalance }).eq('id', user.id)

  // Create parlay
  const { data: parlay, error: parlayError } = await admin.from('parlays').insert({
    user_id: user.id, amount: input.amount, total_odds: totalOdds, potential_payout: potentialPayout,
  }).select('id').single()

  if (parlayError) {
    await admin.from('profiles').update({ credits: profile.credits }).eq('id', user.id)
    return { error: 'Error al crear parlay' }
  }

  // Create legs
  const { error: legsError } = await admin.from('parlay_legs').insert(
    input.legs.map(leg => ({
      parlay_id: parlay.id, match_id: leg.match_id,
      market_type: leg.market_type, pick: leg.pick, odds: leg.odds,
    }))
  )

  if (legsError) {
    await admin.from('parlays').delete().eq('id', parlay.id)
    await admin.from('profiles').update({ credits: profile.credits }).eq('id', user.id)
    return { error: 'Error al crear selecciones del parlay' }
  }

  // Activity feed
  await admin.from('activity_feed').insert({
    user_id: user.id, action_type: 'parlay',
    description: `creo un parlay de ${input.legs.length} selecciones por $${input.amount} (x${totalOdds})`,
    metadata: { parlay_id: parlay.id, legs: input.legs.length, total_odds: totalOdds },
  })

  revalidatePath('/')
  return { success: true, parlay_id: parlay.id, total_odds: totalOdds, potential_payout: potentialPayout }
}
