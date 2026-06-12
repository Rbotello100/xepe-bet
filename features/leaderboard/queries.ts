import { createServerClient } from '@/lib/supabase/server'

export interface LeaderboardEntry {
  id: string
  display_name: string
  avatar_url: string | null
  total_points: number
  credits: number
}

export interface CasinoStatsRow {
  user_id: string
  display_name: string
  avatar_url: string | null
  value: number
  meta?: string
}

// ==========================================================
// Ranking principal — ordenado por créditos
// ==========================================================
export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, total_points, credits')
    .order('credits', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []) as LeaderboardEntry[]
}

export async function getUserRank(userId: string): Promise<number> {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .order('credits', { ascending: false })

  if (!data) return 0
  const index = data.findIndex(p => p.id === userId)
  return index >= 0 ? index + 1 : 0
}

// ==========================================================
// Casino stats — leen de casino_pnl_leaderboard view + casino_sessions
// ==========================================================

/**
 * Top N con mayor PnL acumulado en casino (todo el tiempo).
 * Lee de la vista casino_pnl_leaderboard.
 */
export async function getBiggestWinners(limit = 5): Promise<CasinoStatsRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('casino_pnl_leaderboard')
    .select('user_id, display_name, avatar_url, total_pnl, plays')
    .order('total_pnl', { ascending: false })
    .limit(limit)

  if (error || !data) return []

  return data.map(r => ({
    user_id: r.user_id,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    value: Number(r.total_pnl),
    meta: `${r.plays} jugadas`,
  }))
}

/**
 * Top N ganancias individuales más grandes (1 sola partida o 1 sola bet).
 * Une casino_sessions.win_amount + bets ganadas (potential_payout - amount).
 * Via RPC SQL para evitar truncamiento del SDK Supabase y para hacer el UNION ALL
 * en una sola query.
 *
 * Antes solo leía de casino_sessions, por lo que las wins de apuestas a partidos
 * del Mundial NO aparecían y se veía solo gente con $50 de Penales.
 */
export async function getBiggestSingleWins(limit = 5): Promise<CasinoStatsRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('biggest_single_wins', { p_limit: limit })

  if (error || !data) return []

  type Row = {
    user_id: string
    display_name: string
    avatar_url: string | null
    net_win: number
    source: string
  }

  return (data as Row[]).map(r => ({
    user_id: r.user_id,
    display_name: r.display_name ?? 'Anonimo',
    avatar_url: r.avatar_url,
    value: Number(r.net_win),
    meta: r.source,
  }))
}

/**
 * Top N hit rate (% jugadas con net positivo).
 * Mínimo 20 jugadas para entrar — filtramos en JS porque la vista no permite WHERE COUNT.
 */
export async function getCasinoHitRate(limit = 5): Promise<CasinoStatsRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('casino_pnl_leaderboard')
    .select('user_id, display_name, avatar_url, hit_rate_pct, plays')
    .gte('plays', 20)
    .order('hit_rate_pct', { ascending: false })
    .limit(limit)

  if (error || !data) return []

  return data.map(r => ({
    user_id: r.user_id,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    value: Number(r.hit_rate_pct ?? 0),
    meta: `${r.plays} jugadas`,
  }))
}
