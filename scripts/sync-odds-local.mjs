#!/usr/bin/env node
// Sync de odds local — replica la logica de lib/sync/odds.ts sin pasar por HTTP.
// Util cuando queremos disparar un sync inmediato sin esperar al cron de Vercel
// y sin lidiar con CRON_SECRET. Lee env de .env.local.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ODDS_OPEN_HOURS = 840 // 35 dias — debe matchear lib/constants.ts
const MAX_ATTEMPTS = 10
const SPORT_KEY = 'soccer_fifa_world_cup'

async function getMatchesNeedingOdds() {
  const windowStart = new Date()
  const windowEnd = new Date()
  windowEnd.setHours(windowEnd.getHours() + ODDS_OPEN_HOURS)

  const { data, error } = await sb
    .from('matches')
    .select('id, external_id, sport_key, starts_at')
    .eq('odds_synced', false)
    .lt('odds_sync_attempts', MAX_ATTEMPTS)
    .gte('starts_at', windowStart.toISOString())
    .lte('starts_at', windowEnd.toISOString())
    .in('status', ['scheduled', 'open'])
  if (error) throw error
  return data
}

async function fetchOdds() {
  const url = `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds/?regions=eu&markets=h2h&apiKey=${env.THE_ODDS_API_KEY}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Odds API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const remaining = parseInt(res.headers.get('x-requests-remaining') ?? '0', 10)
  return { data, remaining }
}

const EXTRA_MARKETS = ['btts', 'double_chance', 'draw_no_bet', 'alternate_totals']
const ALLOWED_TOTALS = new Set([1.5, 2.5, 3.5])

async function fetchEventExtraOdds(eventId) {
  const url = `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/events/${eventId}/odds/?regions=eu&markets=${EXTRA_MARKETS.join(',')}&apiKey=${env.THE_ODDS_API_KEY}`
  const res = await fetch(url)
  if (!res.ok) return { data: null, remaining: parseInt(res.headers.get('x-requests-remaining') ?? '0', 10), error: `HTTP ${res.status}` }
  const data = await res.json()
  const remaining = parseInt(res.headers.get('x-requests-remaining') ?? '0', 10)
  return { data, remaining }
}

function parseEventExtraOdds(matchId, eventData) {
  const book = eventData.bookmakers.find(b => b.key === 'pinnacle') ?? eventData.bookmakers[0]
  if (!book) return []
  const home = eventData.home_team
  const away = eventData.away_team
  const rows = []
  for (const m of book.markets) {
    if (m.key === 'btts') {
      for (const o of m.outcomes) {
        const odds = sanity(o.price)
        if (odds == null) continue
        if (o.name === 'Yes') rows.push({ match_id: matchId, market_type: 'btts', pick: 'btts_yes', odds, point: null })
        else if (o.name === 'No') rows.push({ match_id: matchId, market_type: 'btts', pick: 'btts_no', odds, point: null })
      }
    } else if (m.key === 'double_chance') {
      const has = (l, a, b) => {
        const n = l.toLowerCase()
        return n.includes(a.toLowerCase()) && n.includes(b.toLowerCase())
      }
      for (const o of m.outcomes) {
        const odds = sanity(o.price)
        if (odds == null) continue
        if (has(o.name, home, 'draw') || has(o.name, 'home', 'draw')) {
          rows.push({ match_id: matchId, market_type: 'double_chance', pick: '1X', odds, point: null })
        } else if (has(o.name, away, 'draw') || has(o.name, 'away', 'draw')) {
          rows.push({ match_id: matchId, market_type: 'double_chance', pick: 'X2', odds, point: null })
        } else if (has(o.name, home, away) || has(o.name, 'home', 'away')) {
          rows.push({ match_id: matchId, market_type: 'double_chance', pick: '12', odds, point: null })
        }
      }
    } else if (m.key === 'draw_no_bet') {
      for (const o of m.outcomes) {
        const odds = sanity(o.price)
        if (odds == null) continue
        if (o.name === home) rows.push({ match_id: matchId, market_type: 'draw_no_bet', pick: 'dnb_home', odds, point: null })
        else if (o.name === away) rows.push({ match_id: matchId, market_type: 'draw_no_bet', pick: 'dnb_away', odds, point: null })
      }
    } else if (m.key === 'alternate_totals' || m.key === 'totals') {
      for (const o of m.outcomes) {
        if (o.point == null || !ALLOWED_TOTALS.has(o.point)) continue
        const odds = sanity(o.price)
        if (odds == null) continue
        const p = String(o.point)
        const market_type = 'totals_' + p
        if (o.name === 'Over') rows.push({ match_id: matchId, market_type, pick: `over_${p}`, odds, point: o.point })
        else if (o.name === 'Under') rows.push({ match_id: matchId, market_type, pick: `under_${p}`, odds, point: o.point })
      }
    }
  }
  return rows
}

function sanity(p) {
  if (p === null || p === undefined) return null
  if (!Number.isFinite(p)) return null
  if (p < 1.01 || p > 99) return null
  return p
}

async function main() {
  console.log('═══ SYNC ODDS LOCAL ═══')
  const matches = await getMatchesNeedingOdds()
  console.log(`Matches pending sync en ventana ${ODDS_OPEN_HOURS}h: ${matches.length}`)
  if (matches.length === 0) {
    console.log('Nada que sincronizar.')
    return
  }

  const { data: events, remaining } = await fetchOdds()
  console.log(`The Odds API: ${events.length} eventos disponibles | ${remaining} creditos restantes`)

  let synced = 0, notFound = 0, noBook = 0
  let extraSynced = 0, extraRemaining = remaining
  for (const match of matches) {
    if (!match.external_id) {
      await sb.from('matches').update({ odds_sync_attempts: 999 }).eq('id', match.id)
      continue
    }
    const event = events.find(e => e.id === match.external_id)
    if (!event) {
      notFound++
      const { data: cur } = await sb.from('matches').select('odds_sync_attempts').eq('id', match.id).single()
      await sb.from('matches').update({ odds_sync_attempts: (cur?.odds_sync_attempts ?? 0) + 1 }).eq('id', match.id)
      continue
    }
    const book = event.bookmakers.find(b => b.key === 'pinnacle') ?? event.bookmakers[0]
    const h2h = book?.markets.find(m => m.key === 'h2h')
    if (!book || !h2h) { noBook++; continue }

    const home = h2h.outcomes.find(o => o.name === event.home_team)
    const draw = h2h.outcomes.find(o => o.name === 'Draw')
    const away = h2h.outcomes.find(o => o.name === event.away_team)

    const oH = sanity(home?.price)
    const oD = sanity(draw?.price)
    const oA = sanity(away?.price)
    if (oH === null && oD === null && oA === null) { noBook++; continue }

    const { error } = await sb.from('matches').update({
      odds_home: oH, odds_draw: oD, odds_away: oA,
      odds_updated_at: new Date().toISOString(),
      odds_synced: true,
      status: 'open',
    }).eq('id', match.id)
    if (!error) {
      synced++
      // Sync de mercados extra (BTTS, Doble chance, DNB, O/U 1.5/2.5/3.5)
      try {
        const extra = await fetchEventExtraOdds(match.external_id)
        if (extra.data) {
          const rows = parseEventExtraOdds(match.id, extra.data)
          if (rows.length > 0) {
            const { error: upErr } = await sb.from('match_market_odds').upsert(rows, {
              onConflict: 'match_id,market_type,pick',
            })
            if (!upErr) extraSynced += rows.length
          }
        }
        extraRemaining = extra.remaining
      } catch (err) {
        console.log('   ⚠ extra markets fallo para', match.id, ':', err.message)
      }
    }
  }

  // Audit
  await sb.from('odds_api_usage').insert({
    endpoint: 'odds',
    sport_key: SPORT_KEY,
    credits_used: 1,
    remaining,
    triggered_by: 'admin_manual',
    result_summary: { pending: matches.length, synced, not_found: notFound, no_bookmaker: noBook },
  })

  console.log(`\n✓ Synced 1X2: ${synced} | not_found: ${notFound} | no_bookmaker: ${noBook}`)
  console.log(`  Synced mercados extra (rows en match_market_odds): ${extraSynced}`)
  console.log(`  Creditos restantes en The Odds API: ${extraRemaining}`)
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1) })
