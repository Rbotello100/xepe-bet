#!/usr/bin/env node
// Primer fill de match_market_odds para los partidos del Mundial que ya
// tienen 1X2 sincronizado pero aun no tienen rows en match_market_odds.
// Costo: ~4 creditos por partido. Idempotente — solo procesa los que no
// tienen mercados extra todavia.

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

const SPORT_KEY = 'soccer_fifa_world_cup'
const EXTRA = ['btts', 'double_chance', 'draw_no_bet', 'alternate_totals']
const ALLOWED_TOTALS = new Set([1.5, 2.5, 3.5])

function sanity(p) {
  if (p == null || !Number.isFinite(p)) return null
  if (p < 1.01 || p > 99) return null
  return Math.round(p * 100) / 100
}

async function fetchEventExtra(eventId) {
  const url = `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/events/${eventId}/odds/?regions=eu&markets=${EXTRA.join(',')}&apiKey=${env.THE_ODDS_API_KEY}`
  const res = await fetch(url)
  const remaining = parseInt(res.headers.get('x-requests-remaining') ?? '0', 10)
  if (!res.ok) {
    const body = await res.text()
    return { data: null, remaining, error: `${res.status}: ${body.slice(0, 100)}` }
  }
  return { data: await res.json(), remaining }
}

function parse(matchId, ev) {
  if (!ev.bookmakers?.length) return []
  const home = ev.home_team, away = ev.away_team
  const rows = []
  const has = (l, a, b) => {
    const n = l.toLowerCase()
    return n.includes(a.toLowerCase()) && n.includes(b.toLowerCase())
  }

  // No todos los bookmakers soportan todos los mercados. Pinnacle no tiene
  // double_chance para el Mundial, William Hill si. Iteramos por mercado y
  // tomamos el primer bookmaker que lo ofrezca, priorizando pinnacle si
  // esta disponible (mejores odds, menor margen).
  const collectMarket = (key) => {
    const prioritized = [
      ev.bookmakers.find(b => b.key === 'pinnacle'),
      ...ev.bookmakers.filter(b => b.key !== 'pinnacle'),
    ].filter(Boolean)
    for (const b of prioritized) {
      const m = b.markets.find(mk => mk.key === key)
      if (m) return m
    }
    return null
  }
  const marketsToProcess = ['btts', 'double_chance', 'draw_no_bet', 'alternate_totals', 'totals'].map(k => collectMarket(k)).filter(Boolean)

  for (const m of marketsToProcess) {
    if (m.key === 'btts') {
      for (const o of m.outcomes) {
        const odds = sanity(o.price); if (odds == null) continue
        if (o.name === 'Yes') rows.push({ match_id: matchId, market_type: 'btts', pick: 'btts_yes', odds, point: null })
        else if (o.name === 'No') rows.push({ match_id: matchId, market_type: 'btts', pick: 'btts_no', odds, point: null })
      }
    } else if (m.key === 'double_chance') {
      for (const o of m.outcomes) {
        const odds = sanity(o.price); if (odds == null) continue
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
        const odds = sanity(o.price); if (odds == null) continue
        if (o.name === home) rows.push({ match_id: matchId, market_type: 'draw_no_bet', pick: 'dnb_home', odds, point: null })
        else if (o.name === away) rows.push({ match_id: matchId, market_type: 'draw_no_bet', pick: 'dnb_away', odds, point: null })
      }
    } else if (m.key === 'alternate_totals' || m.key === 'totals') {
      for (const o of m.outcomes) {
        if (o.point == null || !ALLOWED_TOTALS.has(o.point)) continue
        const odds = sanity(o.price); if (odds == null) continue
        const p = String(o.point)
        const mt = 'totals_' + p
        if (o.name === 'Over') rows.push({ match_id: matchId, market_type: mt, pick: `over_${p}`, odds, point: o.point })
        else if (o.name === 'Under') rows.push({ match_id: matchId, market_type: mt, pick: `under_${p}`, odds, point: o.point })
      }
    }
  }
  return rows
}

async function main() {
  console.log('═══ SEED match_market_odds (partidos del Mundial sin extras) ═══')

  // 1) Partidos con 1X2 ya sincronizado y external_id no nulo
  const { data: synced } = await sb.from('matches')
    .select('id, external_id, starts_at')
    .eq('sport_key', SPORT_KEY)
    .eq('odds_synced', true)
    .not('external_id', 'is', null)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at')

  // 2) Sacar IDs que ya tienen rows en match_market_odds (idempotencia)
  // LIMIT explicito alto: default Supabase es 1000. Con eliminatorias del Mundial
  // 2026 vamos a tener ~1300 rows. Sin limit el script reprocesaria partidos ya
  // hechos y gastaria creditos.
  const { data: already } = await sb.from('match_market_odds')
    .select('match_id')
    .limit(50000)
  const alreadySet = new Set((already ?? []).map(r => r.match_id))

  const pending = (synced ?? []).filter(m => !alreadySet.has(m.id))
  console.log(`Partidos con 1X2 listo: ${synced?.length ?? 0}`)
  console.log(`Ya tienen mercados extra: ${alreadySet.size}`)
  console.log(`A procesar: ${pending.length}`)
  if (pending.length === 0) { console.log('Nada que hacer.'); return }

  let ok = 0, fail = 0, totalRows = 0, lastRemaining = null
  for (const m of pending) {
    process.stdout.write(`  ${m.id.slice(0,8)}... `)
    try {
      const res = await fetchEventExtra(m.external_id)
      lastRemaining = res.remaining
      if (res.error || !res.data) {
        console.log(`✗ ${res.error}`); fail++; continue
      }
      const rows = parse(m.id, res.data)
      if (rows.length === 0) { console.log('0 rows'); continue }
      const { error: upErr } = await sb.from('match_market_odds').upsert(rows, {
        onConflict: 'match_id,market_type,pick',
      })
      if (upErr) { console.log(`✗ upsert: ${upErr.message}`); fail++; continue }
      ok++; totalRows += rows.length
      console.log(`✓ ${rows.length} rows`)
    } catch (err) {
      console.log(`✗ ${err.message}`); fail++
    }
  }

  console.log(`\n✓ OK: ${ok} | ✗ fail: ${fail} | total rows insertadas: ${totalRows}`)
  console.log(`  Creditos restantes en The Odds API: ${lastRemaining}`)
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
