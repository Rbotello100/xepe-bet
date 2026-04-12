import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Bet } from '@/lib/types'

export async function getUserBets(userId: string): Promise<Bet[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('bets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Bet[]
}

export async function getPendingBets(userId: string): Promise<Bet[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('bets')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Bet[]
}

export interface ParlayWithLegs {
  id: string
  user_id: string
  amount: number
  total_odds: number
  potential_payout: number
  status: string
  created_at: string
  legs: {
    id: string
    match_id: string
    market_type: string
    pick: string
    odds: number
    status: string
    match?: {
      home_team?: { name: string }
      away_team?: { name: string }
    }
  }[]
}

export async function getUserParlays(userId: string): Promise<ParlayWithLegs[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('parlays')
    .select('*, legs:parlay_legs(*, match:matches!match_id(home_team:teams!home_team_id(name), away_team:teams!away_team_id(name)))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ParlayWithLegs[]
}
