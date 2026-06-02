'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import {
  MIN_BET,
  MAX_BET,
  BET_LOCK_HOURS,
  MIN_PARLAY_LEGS,
  MAX_PARLAY_LEGS,
  MAX_PARLAY_ODDS,
  MAX_PARLAY_PAYOUT,
} from '@/lib/constants'
import { calculateCashOut } from '@/lib/utils/cash-out'
import { resolveServerOdds, oddsWithinTolerance } from '@/lib/utils/resolve-pick-odds'
import { generateRelatorMessage } from '@/lib/relator/generate-message'
import type { BetInput, ParlayInput } from './types'

// Umbrales para que el Relator no spamee con cada apuesta chica.
const RELATOR_MIN_BET = 50           // bets > $50 narra
const RELATOR_MIN_CASHOUT_GAIN = 30  // cashouts con ganancia neta > $30 narra
const RELATOR_MIN_PARLAY_LEGS = 3    // parlays >= 3 legs narra

function extractTeamName(raw: unknown): string {
  if (!raw) return '?'
  if (Array.isArray(raw)) return (raw[0] as { name?: string })?.name ?? '?'
  return (raw as { name?: string }).name ?? '?'
}

async function getAuthUser() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

function db() { return createAdminClient() }

function validateMatchOpen(match: { starts_at: string; status: string }): string | null {
  if (match.status === 'finished') return 'Partido ya finalizado'
  if (match.status === 'cancelled') return 'Partido cancelado'
  if (match.status === 'live') return 'Partido en curso'
  const lockTime = new Date(new Date(match.starts_at).getTime() - BET_LOCK_HOURS * 60 * 60 * 1000)
  if (new Date() >= lockTime) return 'Apuestas cerradas para este partido'
  return null
}

// Mensajes en castellano para los error_code que devuelven las RPCs SQL.
// Centralizado para mantener consistencia y permitir i18n a futuro.
function mapBetErrorCode(code: string | null): string {
  switch (code) {
    case 'invalid_amount':        return 'Monto invalido'
    case 'invalid_odds':          return 'Odds invalidas'
    case 'invalid_total_odds':    return `Las odds totales exceden el maximo (x${MAX_PARLAY_ODDS})`
    case 'invalid_legs_count':    return `Parlay debe tener entre ${MIN_PARLAY_LEGS} y ${MAX_PARLAY_LEGS} selecciones`
    case 'payout_too_high':       return `Premio potencial excede $${MAX_PARLAY_PAYOUT}`
    case 'insufficient_credits':  return 'Creditos insuficientes'
    case 'match_not_found':       return 'Partido no encontrado'
    case 'match_finished':        return 'Partido ya finalizado'
    case 'match_cancelled':       return 'Partido cancelado'
    case 'match_live':            return 'Partido en curso'
    case 'bets_locked':           return 'Apuestas cerradas para este partido'
    case 'bet_not_cashable':      return 'Apuesta no disponible para cash out'
    case 'invalid_cashout':       return 'Cash out invalido'
    default:                      return 'No se pudo procesar la operacion'
  }
}

export async function placeBet(input: BetInput) {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }
  if (input.amount < MIN_BET) return { error: `Apuesta minima: $${MIN_BET}` }
  if (input.amount > MAX_BET) return { error: `Apuesta maxima: $${MAX_BET}` }

  const admin = db()

  // Pre-validacion para dar UX clara antes de la RPC.
  // La RPC re-valida match abierto dentro de la TX (snapshot en commit).
  const { data: match } = await admin
    .from('matches')
    .select('starts_at, status, odds_home, odds_draw, odds_away, home_team:teams!home_team_id(name), away_team:teams!away_team_id(name)')
    .eq('id', input.match_id)
    .single()
  if (!match) return { error: 'Partido no encontrado' }
  const matchError = validateMatchOpen(match)
  if (matchError) return { error: matchError }

  const serverOdds = resolveServerOdds(match, input.pick)
  if (!serverOdds) return { error: 'Odds no disponibles para este pick' }
  if (!oddsWithinTolerance(input.odds, serverOdds)) {
    return { error: `Las odds cambiaron. Actual: x${serverOdds}. Recargá para ver las nuevas.` }
  }

  // RPC atomica: debit + insert bet + audit + activity_feed en 1 TX.
  // Si cualquier paso falla, toda la TX revierte (no hay plata fantasma).
  const { data, error } = await admin.rpc('place_bet_atomic', {
    p_user_id: user.id,
    p_match_id: input.match_id,
    p_market_type: input.market_type,
    p_pick: input.pick,
    p_amount: input.amount,
    p_server_odds: serverOdds,
  })

  if (error || !data || data.length === 0) {
    return { error: error?.message ?? 'Error al crear apuesta' }
  }

  const result = data[0] as {
    success: boolean
    bet_id: string | null
    potential_payout: number | null
    new_balance: number | null
    error_code: string | null
  }
  if (!result.success) {
    return { error: mapBetErrorCode(result.error_code) }
  }

  // Relator: si la apuesta es importante ($50+), dispara mensaje fire-and-forget
  if (input.amount >= RELATOR_MIN_BET) {
    const homeName = extractTeamName(match.home_team)
    const awayName = extractTeamName(match.away_team)
    const pickLabel = input.pick === 'home' || input.pick === '1'
      ? `${homeName} gana`
      : input.pick === 'away' || input.pick === '2'
      ? `${awayName} gana`
      : 'Empate'
    void generateRelatorMessage({
      kind: 'flash',
      userId: user.id,
      context: `{user} acaba de apostar $${input.amount} a "${pickLabel}" en ${homeName} vs ${awayName}, cuota x${serverOdds}. Premio potencial $${result.potential_payout}.`,
    })
  }

  revalidatePath('/')
  return {
    success: true,
    potential_payout: result.potential_payout ?? undefined,
    new_balance: result.new_balance ?? undefined,
  }
}

export async function cashOutBet(betId: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }

  const admin = db()
  const { data: bet } = await admin.from('bets')
    .select('odds_at_placement, amount, status, match:matches!match_id(starts_at, status, odds_home, odds_draw, odds_away, home_team:teams!home_team_id(name), away_team:teams!away_team_id(name)), pick')
    .eq('id', betId).eq('user_id', user.id).eq('status', 'pending').single()
  if (!bet) return { error: 'Apuesta no encontrada' }

  // Supabase devuelve el match como array cuando es un join 1:N; aca es 1:1, asi
  // que tomamos el primero. El cast pasa por unknown porque los tipos generados
  // declaran la relacion como array.
  type MatchJoined = {
    starts_at: string
    status: string
    odds_home: number
    odds_draw: number
    odds_away: number
    home_team?: { name: string } | { name: string }[]
    away_team?: { name: string } | { name: string }[]
  }
  const matchRaw = bet.match as unknown as MatchJoined | MatchJoined[]
  const match = Array.isArray(matchRaw) ? matchRaw[0] : matchRaw
  if (!match) return { error: 'Partido no encontrado' }
  const matchError = validateMatchOpen(match)
  if (matchError) return { error: `Cash out no disponible: ${matchError}` }

  let currentOdds: number
  if (bet.pick === 'home' || bet.pick === '1') currentOdds = match.odds_home
  else if (bet.pick === 'away' || bet.pick === '2') currentOdds = match.odds_away
  else currentOdds = match.odds_draw
  if (!Number.isFinite(currentOdds) || currentOdds <= 0) return { error: 'Odds no disponibles' }

  const cashOutValue = Math.round(calculateCashOut(bet.odds_at_placement, currentOdds, bet.amount) * 100) / 100
  if (!Number.isFinite(cashOutValue) || cashOutValue <= 0) {
    return { error: 'Cash out no disponible' }
  }

  // RPC atomica: UPDATE bet (con guard status='pending') + add credits + audit + feed en 1 TX.
  // El guard idempotente esta DENTRO de la RPC — si otro request ya proceso esta bet,
  // la RPC devuelve error_code='bet_not_cashable'.
  const { data, error } = await admin.rpc('cashout_bet_atomic', {
    p_bet_id: betId,
    p_user_id: user.id,
    p_cashout_value: cashOutValue,
  })

  if (error || !data || data.length === 0) {
    return { error: error?.message ?? 'Error al procesar cash out' }
  }

  const result = data[0] as { success: boolean; new_balance: number | null; error_code: string | null }
  if (!result.success) {
    return { error: mapBetErrorCode(result.error_code) }
  }

  // Relator: si la ganancia neta del cashout es importante, narra
  const gain = cashOutValue - Number(bet.amount)
  if (gain >= RELATOR_MIN_CASHOUT_GAIN) {
    const homeName = extractTeamName(match.home_team)
    const awayName = extractTeamName(match.away_team)
    void generateRelatorMessage({
      kind: 'flash',
      userId: user.id,
      context: `{user} hizo cashout en ${homeName} vs ${awayName}: apostó $${bet.amount}, retiró $${cashOutValue}. Ganancia neta $${gain.toFixed(0)}.`,
    })
  }

  revalidatePath('/')
  return { success: true, cash_out_amount: cashOutValue, new_balance: result.new_balance ?? undefined }
}

export async function placeParlay(input: ParlayInput) {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }
  if (input.legs.length < MIN_PARLAY_LEGS) return { error: `Minimo ${MIN_PARLAY_LEGS} selecciones` }
  if (input.legs.length > MAX_PARLAY_LEGS) return { error: `Maximo ${MAX_PARLAY_LEGS} selecciones` }
  if (input.amount < MIN_BET) return { error: `Apuesta minima: $${MIN_BET}` }
  if (input.amount > MAX_BET) return { error: `Apuesta maxima: $${MAX_BET}` }

  const admin = db()
  const matchIds = input.legs.map(l => l.match_id)
  if (new Set(matchIds).size !== matchIds.length) {
    return { error: 'No puedes agregar dos selecciones del mismo partido' }
  }

  // Pre-validacion + resolucion server-side de odds para cada leg.
  // La RPC NO re-valida los matches (seria 10 SELECTs en la TX) — confiamos
  // en este pre-check. Si una odd cambia entre acá y la TX, el peor caso es
  // un parlay con odds ligeramente desactualizadas (no exploit de plata).
  const serverLegs: Array<{ match_id: string; pick: string; market_type: string; odds: number }> = []
  for (const leg of input.legs) {
    const { data: match } = await admin
      .from('matches')
      .select('starts_at, status, odds_home, odds_draw, odds_away')
      .eq('id', leg.match_id)
      .single()
    if (!match) return { error: 'Partido no encontrado' }
    const err = validateMatchOpen(match)
    if (err) return { error: `${err} (una de las selecciones)` }

    const serverOdds = resolveServerOdds(match, leg.pick)
    if (!serverOdds) return { error: 'Odds no disponibles para una de las selecciones' }
    if (!oddsWithinTolerance(leg.odds, serverOdds)) {
      return { error: `Las odds de una seleccion cambiaron. Recargá para ver las nuevas.` }
    }
    serverLegs.push({ match_id: leg.match_id, pick: leg.pick, market_type: leg.market_type, odds: serverOdds })
  }

  const totalOdds = Math.round(serverLegs.reduce((acc, leg) => acc * leg.odds, 1) * 100) / 100
  if (totalOdds > MAX_PARLAY_ODDS) {
    return { error: `Odds totales muy altas (max x${MAX_PARLAY_ODDS})` }
  }
  const potentialPayout = Math.round(input.amount * totalOdds * 100) / 100
  if (potentialPayout > MAX_PARLAY_PAYOUT) {
    return { error: `Premio potencial excede $${MAX_PARLAY_PAYOUT}` }
  }

  // RPC atomica: debit + insert parlay + insert legs + audit + feed en 1 TX.
  const { data, error } = await admin.rpc('place_parlay_atomic', {
    p_user_id: user.id,
    p_amount: input.amount,
    p_total_odds: totalOdds,
    p_legs: serverLegs,  // jsonb_array_elements en la RPC
  })

  if (error || !data || data.length === 0) {
    return { error: error?.message ?? 'Error al crear parlay' }
  }

  const result = data[0] as {
    success: boolean
    parlay_id: string | null
    potential_payout: number | null
    new_balance: number | null
    error_code: string | null
  }
  if (!result.success) {
    return { error: mapBetErrorCode(result.error_code) }
  }

  // Relator: parlays con >= 3 patas son narrables (combinacion ambiciosa)
  if (serverLegs.length >= RELATOR_MIN_PARLAY_LEGS) {
    void generateRelatorMessage({
      kind: 'flash',
      userId: user.id,
      context: `{user} armó un parlay de ${serverLegs.length} patas por $${input.amount}, cuota total x${totalOdds}. Si todas pegan, paga $${result.potential_payout}.`,
    })
  }

  revalidatePath('/')
  return {
    success: true,
    parlay_id: result.parlay_id ?? undefined,
    total_odds: totalOdds,
    potential_payout: result.potential_payout ?? undefined,
    new_balance: result.new_balance ?? undefined,
  }
}
