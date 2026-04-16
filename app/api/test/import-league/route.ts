import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SPORT_KEY } from '@/lib/constants'

/**
 * Imports events from The Odds API for a given sport key (?sport=soccer_epl).
 * Creates teams if they don't exist, creates matches with external_id.
 * After import, "Sync Odds" will populate real odds.
 * Uses group 'T' for these demo matches so they don't mix with the Mundial groups A-L.
 */
export async function POST(request: Request) {
  try {
    const apiKey = process.env.THE_ODDS_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'THE_ODDS_API_KEY not set' })

    const url = new URL(request.url)
    const sport = url.searchParams.get('sport') ?? SPORT_KEY

    // Fetch events (FREE endpoint)
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/${sport}/events?apiKey=${apiKey}&dateFormat=iso`
    )
    if (!res.ok) return NextResponse.json({ error: `API error: ${res.status}` })

    const events = await res.json()
    if (!Array.isArray(events)) return NextResponse.json({ error: 'Invalid response' })

    const admin = createAdminClient()
    let teamsCreated = 0
    let matchesCreated = 0
    let matchesSkipped = 0

    for (const event of events) {
      // Upsert home team
      const homeCode = event.home_team.substring(0, 3).toUpperCase()
      const { data: homeTeam } = await admin
        .from('teams')
        .upsert({ name: event.home_team, fifa_code: homeCode, flag: '⚽', group_name: 'T' }, { onConflict: 'fifa_code' })
        .select('id')
        .single()

      // Upsert away team
      const awayCode = event.away_team.substring(0, 3).toUpperCase()
      const { data: awayTeam } = await admin
        .from('teams')
        .upsert({ name: event.away_team, fifa_code: awayCode, flag: '⚽', group_name: 'T' }, { onConflict: 'fifa_code' })
        .select('id')
        .single()

      if (!homeTeam || !awayTeam) continue

      // Check if match exists
      const { data: existing } = await admin
        .from('matches')
        .select('id')
        .eq('external_id', event.id)
        .single()

      if (existing) {
        matchesSkipped++
        continue
      }

      // Create match
      const { error } = await admin.from('matches').insert({
        home_team_id: homeTeam.id,
        away_team_id: awayTeam.id,
        group_name: 'T',
        round: 'test',
        starts_at: event.commence_time,
        status: 'scheduled',
        external_id: event.id,
      })

      if (!error) matchesCreated++
      else teamsCreated++ // approximate
    }

    return NextResponse.json({
      sport,
      events_found: events.length,
      matches_created: matchesCreated,
      matches_skipped: matchesSkipped,
      message: `Importados ${matchesCreated} partidos de ${sport}. Ahora usa "Sync Odds" para obtener odds reales.`,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message })
  }
}
