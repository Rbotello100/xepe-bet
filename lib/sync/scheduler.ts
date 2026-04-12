import { ODDS_OPEN_HOURS_BEFORE } from '@/lib/constants'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Check if any matches are within the odds window (3h before kickoff).
 * Used by the cron job to decide whether to sync odds.
 */
export async function hasMatchesInOddsWindow(): Promise<boolean> {
  const supabase = createAdminClient()

  const windowStart = new Date()
  const windowEnd = new Date()
  windowEnd.setHours(windowEnd.getHours() + ODDS_OPEN_HOURS_BEFORE)

  const { count } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .gte('starts_at', windowStart.toISOString())
    .lte('starts_at', windowEnd.toISOString())
    .in('status', ['scheduled', 'open'])

  return (count ?? 0) > 0
}

/**
 * Check if any matches are currently live.
 */
export async function hasLiveMatches(): Promise<boolean> {
  const supabase = createAdminClient()

  const { count } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'live')

  return (count ?? 0) > 0
}
