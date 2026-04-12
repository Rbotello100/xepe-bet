import { fetchOdds } from '@/lib/odds-api/client'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Sync odds from The Odds API into Supabase matches table.
 * Called by /api/cron/sync-odds.
 */
export async function syncMatchOdds() {
  const { data: events, remaining } = await fetchOdds('h2h', 'eu')
  const supabase = createAdminClient()

  let synced = 0
  let noBookmaker = 0
  let noMatch = 0

  for (const event of events) {
    const bookmaker = event.bookmakers.find(b => b.key === 'pinnacle')
      ?? event.bookmakers[0]

    if (!bookmaker) { noBookmaker++; continue }

    const h2h = bookmaker.markets.find(m => m.key === 'h2h')
    if (!h2h) { noBookmaker++; continue }

    const homeOutcome = h2h.outcomes.find(o => o.name === event.home_team)
    const drawOutcome = h2h.outcomes.find(o => o.name === 'Draw')
    const awayOutcome = h2h.outcomes.find(o => o.name === event.away_team)

    // Try update by external_id
    const { data, error } = await supabase
      .from('matches')
      .update({
        odds_home: homeOutcome?.price ?? null,
        odds_draw: drawOutcome?.price ?? null,
        odds_away: awayOutcome?.price ?? null,
        odds_updated_at: new Date().toISOString(),
      })
      .eq('external_id', event.id)
      .select('id')

    if (!error && data && data.length > 0) {
      synced++
    } else {
      noMatch++
    }
  }

  return {
    synced,
    total: events.length,
    remaining,
    no_bookmaker: noBookmaker,
    no_match: noMatch,
  }
}
