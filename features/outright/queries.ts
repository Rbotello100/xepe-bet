import { createAdminClient } from '@/lib/supabase/admin'

export interface OutrightMarket {
  id: string
  sport_key: string
  market_name: string
  closes_at: string
  status: 'open' | 'closed' | 'settled'
  winner_team: string | null
}

export interface OutrightOutcome {
  id: string
  team_name: string
  odds: number
}

export interface OutrightBet {
  id: string
  user_id: string
  team_name: string
  amount: number
  odds_at_placement: number
  potential_payout: number
  status: 'pending' | 'won' | 'lost' | 'cancelled'
  created_at: string
  resolved_at: string | null
  market: { market_name: string; winner_team: string | null }
}

/**
 * Devuelve el mercado del Campeon Mundial junto con la lista de equipos
 * ordenada por cuota ascendente (favoritos primero). Si el sync no corrio
 * aun, outcomes es array vacio — la UI maneja ese estado.
 */
export async function getChampionMarket(): Promise<{ market: OutrightMarket | null; outcomes: OutrightOutcome[] }> {
  const admin = createAdminClient()
  const { data: market } = await admin
    .from('outright_markets')
    .select('id, sport_key, market_name, closes_at, status, winner_team')
    .eq('sport_key', 'soccer_fifa_world_cup_winner')
    .maybeSingle()
  if (!market) return { market: null, outcomes: [] }

  const { data: outcomes } = await admin
    .from('outright_outcomes')
    .select('id, team_name, odds')
    .eq('market_id', market.id)
    .order('odds', { ascending: true })

  return { market, outcomes: (outcomes ?? []).map(o => ({ ...o, odds: Number(o.odds) })) as OutrightOutcome[] }
}

/**
 * Devuelve outright_bets de un user con join al market_name para mostrar
 * en /bets. Ordenado por created_at desc.
 */
export async function getUserOutrightBets(userId: string): Promise<OutrightBet[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('outright_bets')
    .select('id, user_id, team_name, amount, odds_at_placement, potential_payout, status, created_at, resolved_at, market:outright_markets!market_id(market_name, winner_team)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []).map(b => ({
    ...b,
    amount: Number(b.amount),
    odds_at_placement: Number(b.odds_at_placement),
    potential_payout: Number(b.potential_payout),
    market: Array.isArray(b.market) ? b.market[0] : b.market,
  })) as OutrightBet[]
}
