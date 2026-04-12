import { fetchLiveScores } from '@/lib/football-api/client'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Sync live scores from API-Football into Supabase matches table.
 * Called by /api/cron/sync-scores.
 *
 * Uses API-Football because it has richer score data and
 * doesn't consume The Odds API's limited monthly quota.
 */
export async function syncLiveScores() {
  const fixtures = await fetchLiveScores()
  const supabase = createAdminClient()

  let synced = 0

  for (const fixture of fixtures) {
    const { goals, fixture: fix } = fixture

    // Map API-Football status to our status
    let status: string
    switch (fix.status.short) {
      case 'FT':
      case 'AET':
      case 'PEN':
        status = 'finished'
        break
      case '1H':
      case '2H':
      case 'HT':
      case 'ET':
      case 'BT':
      case 'P':
        status = 'live'
        break
      default:
        status = 'scheduled'
    }

    // Try to match by external_id or by team names + date
    const { error } = await supabase
      .from('matches')
      .update({
        home_score: goals.home,
        away_score: goals.away,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('external_id', fix.id.toString())

    if (!error) synced++
  }

  return { synced, total: fixtures.length }
}
