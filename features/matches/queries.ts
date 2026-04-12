import { createServerClient } from '@/lib/supabase/server'
import type { MatchWithTeams } from '@/lib/types'

export async function getUpcomingMatches(): Promise<MatchWithTeams[]> {
  const supabase = await createServerClient()

  // Try join with teams table first. If teams table doesn't exist yet,
  // fall back to matches-only query with inline team data.
  const { data, error } = await supabase
    .from('matches')
    .select('*, home_team:teams!home_team_id(*), away_team:teams!away_team_id(*)')
    .in('status', ['scheduled', 'open'])
    .order('starts_at')

  if (error) {
    // Fallback: query matches directly (old schema without teams FK)
    return getMatchesFallback(supabase)
  }

  // Filter out matches where team joins failed (null)
  const valid = (data ?? []).filter(
    (m: Record<string, unknown>) => m.home_team && m.away_team
  )

  if (valid.length === 0 && (data ?? []).length > 0) {
    // Matches exist but teams didn't join -- use fallback
    return getMatchesFallback(supabase)
  }

  return valid as unknown as MatchWithTeams[]
}

async function getMatchesFallback(supabase: Awaited<ReturnType<typeof createServerClient>>): Promise<MatchWithTeams[]> {
  const { data } = await supabase
    .from('matches')
    .select('*')
    .order('starts_at')

  if (!data) return []

  // Map old flat schema to MatchWithTeams shape
  return data.map((m: Record<string, unknown>) => ({
    ...m,
    home_team: {
      id: m.home_team_id ?? m.id,
      name: (m.home_team as string) ?? 'TBD',
      fifa_code: '???',
      flag: (m.home_flag as string) ?? '🏳️',
      group_name: (m.group_name as string) ?? '?',
    },
    away_team: {
      id: m.away_team_id ?? m.id,
      name: (m.away_team as string) ?? 'TBD',
      fifa_code: '???',
      flag: (m.away_flag as string) ?? '🏳️',
      group_name: (m.group_name as string) ?? '?',
    },
    odds_home: m.odds_home ?? m.odd_home ?? null,
    odds_draw: m.odds_draw ?? m.odd_draw ?? null,
    odds_away: m.odds_away ?? m.odd_away ?? null,
  })) as unknown as MatchWithTeams[]
}

export async function getLiveMatches(): Promise<MatchWithTeams[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('matches')
    .select('*, home_team:teams!home_team_id(*), away_team:teams!away_team_id(*)')
    .eq('status', 'live')
    .order('starts_at')

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as MatchWithTeams[]
}

export async function getMatchById(id: string): Promise<MatchWithTeams | null> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('matches')
    .select('*, home_team:teams!home_team_id(*), away_team:teams!away_team_id(*)')
    .eq('id', id)
    .single()

  if (error) return null
  return data as unknown as MatchWithTeams
}

export async function getMatchesByGroup(group: string): Promise<MatchWithTeams[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('matches')
    .select('*, home_team:teams!home_team_id(*), away_team:teams!away_team_id(*)')
    .eq('group_name', group)
    .order('starts_at')

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as MatchWithTeams[]
}
