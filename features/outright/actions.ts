'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addCredits, deductCredits } from '@/lib/credits'
import { logError } from '@/lib/log/error'
import { revalidatePath } from 'next/cache'
import { MIN_BET, MAX_PARLAY_PAYOUT } from '@/lib/constants'

interface PlaceOutrightBetInput {
  market_id: string
  team_name: string
  amount: number
  expected_odds: number
}

/**
 * Apuesta de outright (Campeón Mundial). Distinta de placeBet:
 *   - No referencia un match
 *   - Solo se acepta mientras market.status='open' Y now() < closes_at
 *   - Re-valida odds server-side (defense in depth vs cliente desactualizado)
 *   - Cap MAX_PARLAY_PAYOUT como ceiling defensivo (cuotas a campeon pueden
 *     llegar a x300, sin tope una $5K bet pagaria $1.5M y choca con MAX_BALANCE)
 */
export async function placeOutrightBet(input: PlaceOutrightBetInput) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const stake = Number(input.amount)
  if (!Number.isFinite(stake) || stake < MIN_BET) {
    return { error: `Monto mínimo $${MIN_BET}` }
  }

  const admin = createAdminClient()

  const { data: market, error: mErr } = await admin
    .from('outright_markets')
    .select('id, status, closes_at, market_name')
    .eq('id', input.market_id)
    .single()
  if (mErr || !market) return { error: 'Mercado no encontrado' }
  if (market.status !== 'open') return { error: 'Mercado cerrado' }
  if (new Date(market.closes_at).getTime() < Date.now()) return { error: 'Mercado cerrado por horario' }

  // Server-side odds re-fetch — el cliente puede tener cuotas viejas
  const { data: outcome, error: oErr } = await admin
    .from('outright_outcomes')
    .select('odds, team_name')
    .eq('market_id', market.id)
    .eq('team_name', input.team_name)
    .maybeSingle()
  if (oErr || !outcome) return { error: 'Equipo no disponible' }
  const serverOdds = Number(outcome.odds)

  // Tolerancia 3% — si el cliente mostro X.X y la cuota actual es Y.Y muy
  // distinta, rechazamos para que el user vea la nueva
  const drift = Math.abs(serverOdds - input.expected_odds) / input.expected_odds
  if (drift > 0.03) {
    return { error: `Las cuotas cambiaron de ${input.expected_odds} a ${serverOdds}. Refrescá.` }
  }

  const potential = Math.round(stake * serverOdds * 100) / 100
  if (potential > MAX_PARLAY_PAYOUT) {
    return { error: `Premio potencial $${potential.toLocaleString('es-CL')} excede el tope de $${MAX_PARLAY_PAYOUT.toLocaleString('es-CL')}` }
  }

  // Descontar primero, despues insertar (orden conservador — si falla el
  // insert podemos refundar via reference_id sin duplicar el debito)
  const deduct = await deductCredits(user.id, stake, 'bet', `Outright: ${market.market_name} → ${outcome.team_name}`)
  if (!deduct.success) return { error: deduct.error ?? 'No se pudo descontar el stake' }

  const { data: bet, error: bErr } = await admin.from('outright_bets').insert({
    user_id: user.id,
    market_id: market.id,
    team_name: outcome.team_name,
    amount: stake,
    odds_at_placement: serverOdds,
    potential_payout: potential,
  }).select('id').single()

  if (bErr || !bet) {
    // Rollback: refundar el stake con reference_id deterministico
    void logError('outright.placeBet.insertFailed', bErr, { userId: user.id, market_id: market.id })
    await addCredits(user.id, stake, 'refund', `Refund outright fallido (${market.market_name})`, `outright-rollback-${user.id}-${Date.now()}`)
    return { error: 'No se pudo guardar la apuesta. Te devolvimos el stake.' }
  }

  revalidatePath('/champion')
  revalidatePath('/bets')
  return { success: true, bet_id: bet.id, potential_payout: potential }
}
