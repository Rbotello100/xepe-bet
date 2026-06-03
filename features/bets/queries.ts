import { unstable_cache } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Bet } from '@/lib/types'

// Default limit 50 + opcional offset para paginacion. Antes era unbounded:
// si un user activo del Mundial llegaba a 1000+ bets, /bets cargaba todos
// en una sola query. Ahora caps con sensible defaults; el caller que necesite
// mas paginate via offset.
export async function getUserBets(userId: string, limit = 50, offset = 0): Promise<Bet[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('bets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)
  return (data ?? []) as Bet[]
}

export async function getPendingBets(userId: string, limit = 50): Promise<Bet[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('bets')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit)

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

export async function getUserParlays(userId: string, limit = 50, offset = 0): Promise<ParlayWithLegs[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('parlays')
    .select('*, legs:parlay_legs(*, match:matches!match_id(home_team:teams!home_team_id(name), away_team:teams!away_team_id(name)))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ParlayWithLegs[]
}

// ==========================================================
// Best Bet of the day — used in the left sidebar widget.
// Returns null if no pending bet was placed today (no mock fallback).
// ==========================================================
export interface BestBetData {
  user: string
  label: string
  stake: number
  odds: number
  payout: number
  backers: number
}

export async function getBestBetOfTheDay(): Promise<BestBetData | null> {
  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: bet } = await admin
    .from('bets')
    .select(`
      id, amount, odds_at_placement, potential_payout, pick, match_id,
      user:profiles!user_id(display_name),
      match:matches!match_id(home_team:teams!home_team_id(name), away_team:teams!away_team_id(name))
    `)
    .eq('status', 'pending')
    .gte('created_at', `${today}T00:00:00`)
    .order('potential_payout', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!bet) return null

  // Backers: cuantos users mas tienen el mismo pick en el mismo match
  const { count: backers } = await admin
    .from('bets')
    .select('id', { count: 'exact', head: true })
    .eq('match_id', bet.match_id)
    .eq('pick', bet.pick)

  type MatchedBet = {
    amount: number
    odds_at_placement: number
    potential_payout: number
    pick: string
    user: { display_name: string } | { display_name: string }[]
    match: {
      home_team: { name: string } | { name: string }[]
      away_team: { name: string } | { name: string }[]
    } | null
  }
  const b = bet as unknown as MatchedBet
  const userObj = Array.isArray(b.user) ? b.user[0] : b.user
  const matchObj = b.match
  const homeObj = matchObj ? (Array.isArray(matchObj.home_team) ? matchObj.home_team[0] : matchObj.home_team) : null
  const awayObj = matchObj ? (Array.isArray(matchObj.away_team) ? matchObj.away_team[0] : matchObj.away_team) : null

  const label = b.pick === 'home' || b.pick === '1'
    ? `${homeObj?.name ?? 'Local'} gana`
    : b.pick === 'away' || b.pick === '2'
    ? `${awayObj?.name ?? 'Visita'} gana`
    : 'Empate'

  return {
    user: userObj?.display_name ?? 'Anonimo',
    label,
    stake: Number(b.amount),
    odds: Number(b.odds_at_placement),
    payout: Number(b.potential_payout),
    backers: backers ?? 1,
  }
}

// ==========================================================
// Crowd distribution per match (for MatchCard pickbar).
// Returns map of matchId -> { home, draw, away, total } as ABSOLUTE counts.
// Caller computes percentages and decides whether to render.
// ==========================================================
export interface MatchCrowd {
  home: number
  draw: number
  away: number
  total: number
}

// La distribucion no necesita ser real-time — cambia gradualmente. Cachear
// 30s reduce drásticamente la carga del seq scan de bets pending en cada
// page load. Como devuelve un Map (no serializable), envolvemos el computo
// en una funcion que devuelve un Array y reconstruimos el Map al final.
const _crowdDistArr = unstable_cache(
  async () => {
    const admin = createAdminClient()
    const { data } = await admin.from('bets').select('match_id, pick').eq('status', 'pending')
    const map = new Map<string, MatchCrowd>()
    for (const row of (data ?? []) as { match_id: string; pick: string }[]) {
      if (!row.match_id) continue
      const cur = map.get(row.match_id) ?? { home: 0, draw: 0, away: 0, total: 0 }
      if (row.pick === 'home' || row.pick === '1') cur.home++
      else if (row.pick === 'away' || row.pick === '2') cur.away++
      else cur.draw++
      cur.total++
      map.set(row.match_id, cur)
    }
    return [...map.entries()] as [string, MatchCrowd][]
  },
  ['crowd-distribution'],
  { revalidate: 30, tags: ['crowd-distribution'] },
)

export async function getCrowdDistribution(): Promise<Map<string, MatchCrowd>> {
  const arr = await _crowdDistArr()
  return new Map(arr)
}
