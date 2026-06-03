#!/usr/bin/env node
// =====================================================================
// HTTP End-to-End Stress Test — Xepe Bet
// =====================================================================
//
// Prueba el stack HTTP completo bajo carga real (no service_role bypass):
//
//   1. Page loads anónimos concurrentes — /, /casino, /leaderboard
//      Mide: latency P50/P95/P99, error rate, throughput
//      Stresa: SSR + 10+ queries paralelas por request (matches, ranking, feed, etc)
//
//   2. Auth login concurrente con signInWithPassword
//      Mide: latency del subsistema de auth de Supabase
//      Stresa: GoTrue + JWT generation
//
//   3. Reads autenticadas vía RPC con JWT
//      Mide: latency con RLS activo
//      Stresa: postgrest + JWT validation + RLS policies
//
// Nota: NO testea Server Actions de Next.js (place_bet_atomic via UI)
// porque requieren handshake interno frágil. Para eso ver scripts/stress-test.mjs
// que invoca las RPCs con service_role bypassing Server Actions.
//
// Run: node scripts/stress-test-http.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

function loadEnv() {
  const env = {}
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (!m) continue
      env[m[1]] = m[2].replace(/^"|"$/g, '')
    }
  } catch {}
  return env
}
const env = loadEnv()
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const SITE_URL = 'https://xepe-bet-botellorodrigo97-3285s-projects.vercel.app'

if (!SUPABASE_URL || !SUPABASE_ANON || !SERVICE_KEY) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// --- CONFIG
const N_USERS = 100
const PAGE_CONCURRENCY = 100   // requests paralelos por endpoint
const PAGE_ROUNDS = 3          // rondas por endpoint
const PASSWORD = 'StressHttp1234!'
const TEST_EMAIL_PREFIX = `httpstress-${Date.now()}`
const ENDPOINTS = ['/', '/casino', '/leaderboard']

// --- HELPERS
const ms = (n) => `${n.toFixed(0)}ms`
const pct = (n) => `${(n * 100).toFixed(1)}%`

function percentile(arr, p) {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p))
  return sorted[idx]
}

function summarize(label, latencies, errors) {
  const total = latencies.length + errors
  const errorRate = errors / total
  return {
    label,
    total,
    ok: latencies.length,
    err: errors,
    errRate: errorRate,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    max: latencies.length ? Math.max(...latencies) : 0,
    avg: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
  }
}

function printSummary(s) {
  console.log(`  ${s.label.padEnd(35)} ` +
    `ok=${s.ok}/${s.total}  err=${pct(s.errRate)}  ` +
    `avg=${ms(s.avg)}  p50=${ms(s.p50)}  p95=${ms(s.p95)}  p99=${ms(s.p99)}  max=${ms(s.max)}`)
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function timed(fn) {
  const t0 = performance.now()
  try {
    await fn()
    return { latency: performance.now() - t0, ok: true }
  } catch (err) {
    return { latency: performance.now() - t0, ok: false, error: String(err.message ?? err) }
  }
}

// --- PHASE 0: SETUP TEST USERS
async function createTestUsers(n) {
  console.log(`\n[setup] Creando ${n} test users (auth.admin)...`)
  const t0 = performance.now()
  const users = []
  const idx = Array.from({ length: n }, (_, i) => i)
  for (const batch of chunk(idx, 10)) {
    const results = await Promise.all(batch.map(async (i) => {
      const email = `${TEST_EMAIL_PREFIX}-${i}@xepetest.local`
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: `HTTPStress ${i}` },
      })
      return error ? null : { id: data.user.id, email }
    }))
    users.push(...results.filter(Boolean))
  }
  console.log(`[setup] OK ${users.length}/${n} en ${ms(performance.now() - t0)}`)
  return users
}

// --- TEST 1: PAGE LOADS ANÓNIMOS
async function testPageLoads() {
  console.log('\n══ TEST 1: Page loads anónimos ══')
  const allSummaries = []
  for (const endpoint of ENDPOINTS) {
    for (let round = 1; round <= PAGE_ROUNDS; round++) {
      const latencies = []
      let errors = 0
      const tasks = Array.from({ length: PAGE_CONCURRENCY }, () =>
        timed(async () => {
          const res = await fetch(`${SITE_URL}${endpoint}`, {
            // Cache-bust por round para forzar SSR fresco (no edge cache)
            headers: { 'cache-control': 'no-cache' },
            redirect: 'manual',
          })
          if (res.status >= 500) throw new Error(`HTTP ${res.status}`)
          // Consumir body para medir tiempo total
          await res.text()
        })
      )
      const results = await Promise.all(tasks)
      for (const r of results) {
        if (r.ok) latencies.push(r.latency)
        else errors++
      }
      const summary = summarize(`${endpoint} round ${round}`, latencies, errors)
      printSummary(summary)
      allSummaries.push(summary)
    }
  }
  return allSummaries
}

// --- TEST 2: AUTH LOGIN CONCURRENTE
async function testAuthLogins(users) {
  console.log('\n══ TEST 2: signInWithPassword concurrente ══')
  const sample = users.slice(0, PAGE_CONCURRENCY)
  const latencies = []
  let errors = 0
  const tokens = []

  // Anon client por user (cada uno tiene su propia sesión)
  const tasks = sample.map(u =>
    timed(async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
      const { data, error } = await client.auth.signInWithPassword({ email: u.email, password: PASSWORD })
      if (error) throw error
      tokens.push({ userId: u.id, accessToken: data.session.access_token })
    })
  )
  const results = await Promise.all(tasks)
  for (const r of results) {
    if (r.ok) latencies.push(r.latency)
    else errors++
  }
  const summary = summarize(`POST /auth/v1/token (login)`, latencies, errors)
  printSummary(summary)
  return tokens
}

// --- TEST 3: READS AUTENTICADAS vía RLS
async function testAuthedReads(tokens) {
  console.log('\n══ TEST 3: SELECT profile autenticado (RLS) ══')
  if (tokens.length === 0) {
    console.log('  (skip — no tokens)')
    return
  }
  // Cada token hace 3 SELECTs paralelos a profiles (debe pasar RLS)
  const latencies = []
  let errors = 0
  const tasks = []
  for (const t of tokens) {
    for (let i = 0; i < 3; i++) {
      tasks.push(timed(async () => {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${t.userId}&select=credits,total_points`, {
          headers: {
            apikey: SUPABASE_ANON,
            authorization: `Bearer ${t.accessToken}`,
          },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        await res.json()
      }))
    }
  }
  const results = await Promise.all(tasks)
  for (const r of results) {
    if (r.ok) latencies.push(r.latency)
    else errors++
  }
  const summary = summarize(`GET /rest/v1/profiles (authed)`, latencies, errors)
  printSummary(summary)
}

// --- TEST 4: API endpoint público (sin auth)
async function testApiEndpoints() {
  console.log('\n══ TEST 4: API endpoints públicos ══')
  const endpoints = [
    `${SUPABASE_URL}/rest/v1/matches?select=id,starts_at,status&limit=20&apikey=${SUPABASE_ANON}`,
    `${SUPABASE_URL}/rest/v1/profiles?select=display_name,credits&order=credits.desc&limit=10&apikey=${SUPABASE_ANON}`,
    `${SUPABASE_URL}/rest/v1/ai_feed?select=kind,content&is_active=eq.true&limit=50&apikey=${SUPABASE_ANON}`,
  ]
  for (const url of endpoints) {
    const label = url.match(/\/rest\/v1\/([^?]+)/)[1]
    const latencies = []
    let errors = 0
    const tasks = Array.from({ length: PAGE_CONCURRENCY }, () =>
      timed(async () => {
        const res = await fetch(url, { headers: { apikey: SUPABASE_ANON } })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        await res.json()
      })
    )
    const results = await Promise.all(tasks)
    for (const r of results) {
      if (r.ok) latencies.push(r.latency)
      else errors++
    }
    printSummary(summarize(`PostgREST /${label}`, latencies, errors))
  }
}

// --- CLEANUP
async function cleanup(users) {
  console.log(`\n[cleanup] Borrando ${users.length} test users...`)
  for (const u of users) {
    await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
  console.log('[cleanup] Done.')
}

// --- MAIN
async function main() {
  console.log('═══════════════════════════════════════════════════')
  console.log(`  HTTP Stress Test — ${PAGE_CONCURRENCY} concurrent / ${PAGE_ROUNDS} rounds`)
  console.log(`  Target: ${SITE_URL}`)
  console.log('═══════════════════════════════════════════════════')

  const t0 = performance.now()
  let users = []

  try {
    users = await createTestUsers(N_USERS)
    await testPageLoads()
    const tokens = await testAuthLogins(users)
    await testAuthedReads(tokens)
    await testApiEndpoints()
    console.log(`\n═══════════════════════════════════════════════════`)
    console.log(`  Tiempo total: ${ms(performance.now() - t0)}`)
    console.log('═══════════════════════════════════════════════════')
  } catch (err) {
    console.error('\n✗ Stress test falló:', err)
  } finally {
    if (users.length) await cleanup(users)
  }
}

main()
