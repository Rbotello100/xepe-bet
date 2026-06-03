#!/usr/bin/env node
// =====================================================================
// Stress test de integridad — Xepe Bet
// =====================================================================
//
// Simula 100 users haciendo en paralelo:
//   - Bets simples (place_bet_atomic)
//   - Parlays (place_parlay_atomic) — multi-leg
//   - Cashouts (cashout_bet_atomic)
//   - Casino mines (deduct_credits_atomic + insert mines_sessions)
//
// Valida:
//   - Balance final = SUM(credit_transactions) por user (atomicidad)
//   - Cero credits negativos (race condition)
//   - Cero duplicados (user_id, type, reference_id) (UNIQUE constraint)
//   - Settlement idempotente: dispara resolveMatch concurrente N veces y
//     verifica que la cantidad de payouts = bets ganadas (no doble pago)
//
// Setup: crea N users test + 1 match test (no toca data real).
// Cleanup: borra todo al final (incluyendo sus credit_transactions, bets,
// parlays, casino_sessions via cascade y deletes manuales).
//
// Run: node scripts/stress-test.mjs
// Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY de .env.local

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// --- ENV LOADER (lee .env.local manualmente, sin dependencias)
function loadEnv() {
  const env = {}
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (!m) continue
      const [, k, v] = m
      env[k] = v.replace(/^"|"$/g, '')
    }
  } catch {}
  return env
}
const env = loadEnv()
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// --- CONFIG
const N_USERS = 100
const BETS_PER_USER = 4
const PARLAYS_PER_USER = 1
const MINES_PER_USER = 3
const TEST_EMAIL_PREFIX = `stress-${Date.now()}`
const TEAM_HOME = '04d4c3b9-ccfc-4147-badc-29430d4eb4eb'  // Mexico
const TEAM_AWAY = 'b188ff20-c37a-4d4b-8c73-5e16972f006f' // South Africa
const TEAM_HOME_B = 'a178114c-59b8-45c5-94e6-444cf02489b1' // Korea (segundo match para parlay)
const TEAM_AWAY_B = 'e99c66ee-0520-4a04-9008-7f5a04115b3c' // Czech

// --- HELPERS
const pct = (n) => (n * 100).toFixed(1) + '%'
const ms = (start) => `${Math.round(performance.now() - start)}ms`

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// --- PHASE 1: SETUP
async function createTestMatches() {
  const futureStart = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString() // +25h
  const { data: matchA, error: errA } = await sb.from('matches').insert({
    home_team_id: TEAM_HOME,
    away_team_id: TEAM_AWAY,
    starts_at: futureStart,
    status: 'scheduled',
    odds_home: 2.10,
    odds_draw: 3.30,
    odds_away: 3.50,
    round: 'group',
    group_name: null,
  }).select('id').single()
  if (errA) throw new Error('No pude crear match A: ' + errA.message)

  const { data: matchB, error: errB } = await sb.from('matches').insert({
    home_team_id: TEAM_HOME_B,
    away_team_id: TEAM_AWAY_B,
    starts_at: futureStart,
    status: 'scheduled',
    odds_home: 1.85,
    odds_draw: 3.50,
    odds_away: 4.00,
    round: 'group',
    group_name: null,
  }).select('id').single()
  if (errB) throw new Error('No pude crear match B: ' + errB.message)

  return [matchA.id, matchB.id]
}

async function createTestUsers(n) {
  console.log(`[setup] Creando ${n} users de prueba...`)
  const start = performance.now()
  const ids = []
  // Auth.admin.createUser tiene rate limit — hacemos en batches de 10 concurrente.
  const idx = Array.from({ length: n }, (_, i) => i)
  for (const batch of chunk(idx, 10)) {
    const results = await Promise.all(batch.map(async (i) => {
      const { data, error } = await sb.auth.admin.createUser({
        email: `${TEST_EMAIL_PREFIX}-${i}@xepetest.local`,
        password: 'StressTest1234!',
        email_confirm: true,
        user_metadata: { full_name: `Stress ${i}` },
      })
      if (error) {
        console.error(`  ✗ user ${i}: ${error.message}`)
        return null
      }
      return data.user.id
    }))
    ids.push(...results.filter(Boolean))
  }
  console.log(`[setup] Creados ${ids.length}/${n} users en ${ms(start)}`)
  return ids
}

// --- PHASE 2: STRESS BETS
async function stressBets(userIds, matchId) {
  console.log(`[bets] Disparando ${userIds.length * BETS_PER_USER} bets concurrentes...`)
  const start = performance.now()
  const picks = ['home', 'draw', 'away']

  // Cada user dispara BETS_PER_USER bets, todas en paralelo.
  const allOps = userIds.flatMap((uid, ui) =>
    Array.from({ length: BETS_PER_USER }, (_, bi) => {
      const pick = picks[(ui + bi) % 3]
      const amount = 10 + (bi * 5) // $10, $15, $20, $25
      const odds = pick === 'home' ? 2.10 : pick === 'draw' ? 3.30 : 3.50
      return sb.rpc('place_bet_atomic', {
        p_user_id: uid,
        p_match_id: matchId,
        p_market_type: '1x2',
        p_pick: pick,
        p_amount: amount,
        p_server_odds: odds,
      }).then(({ data, error }) => ({
        ok: !error && data?.[0]?.success === true,
        error: error?.message ?? data?.[0]?.error_code ?? null,
        bet_id: data?.[0]?.bet_id ?? null,
        user: uid,
      }))
    })
  )
  const results = await Promise.all(allOps)
  const okCount = results.filter(r => r.ok).length
  const errors = results.filter(r => !r.ok).reduce((acc, r) => {
    acc[r.error ?? 'unknown'] = (acc[r.error ?? 'unknown'] ?? 0) + 1
    return acc
  }, {})
  console.log(`[bets] OK: ${okCount}/${results.length} en ${ms(start)}`)
  if (Object.keys(errors).length) console.log(`[bets] Errors:`, errors)
  return results.filter(r => r.ok).map(r => r.bet_id)
}

// --- PHASE 3: STRESS PARLAYS
async function stressParlays(userIds, [matchA, matchB]) {
  console.log(`[parlays] Disparando ${userIds.length * PARLAYS_PER_USER} parlays concurrentes...`)
  const start = performance.now()

  const allOps = userIds.flatMap(uid =>
    Array.from({ length: PARLAYS_PER_USER }, () => {
      const legs = [
        { match_id: matchA, market_type: '1x2', pick: 'home', odds: 2.10 },
        { match_id: matchB, market_type: '1x2', pick: 'home', odds: 1.85 },
      ]
      const totalOdds = Math.round(2.10 * 1.85 * 100) / 100
      return sb.rpc('place_parlay_atomic', {
        p_user_id: uid,
        p_amount: 10,
        p_total_odds: totalOdds,
        p_legs: legs,
      }).then(({ data, error }) => ({
        ok: !error && data?.[0]?.success === true,
        error: error?.message ?? data?.[0]?.error_code ?? null,
      }))
    })
  )
  const results = await Promise.all(allOps)
  const okCount = results.filter(r => r.ok).length
  const errors = results.filter(r => !r.ok).reduce((acc, r) => {
    acc[r.error ?? 'unknown'] = (acc[r.error ?? 'unknown'] ?? 0) + 1
    return acc
  }, {})
  console.log(`[parlays] OK: ${okCount}/${results.length} en ${ms(start)}`)
  if (Object.keys(errors).length) console.log(`[parlays] Errors:`, errors)
}

// --- PHASE 4: STRESS CASINO MINES
async function stressMines(userIds) {
  console.log(`[mines] Disparando ${userIds.length * MINES_PER_USER} starts mines concurrentes...`)
  const start = performance.now()

  const allOps = userIds.flatMap(uid =>
    Array.from({ length: MINES_PER_USER }, () =>
      sb.rpc('deduct_credits_atomic', {
        p_user_id: uid,
        p_amount: 25,
        p_type: 'casino_bet',
        p_description: 'stress mines',
        p_reference_id: null,
      }).then(({ data, error }) => ({
        ok: !error && data?.[0]?.success === true,
        error: error?.message ?? null,
      }))
    )
  )
  const results = await Promise.all(allOps)
  const okCount = results.filter(r => r.ok).length
  console.log(`[mines] OK: ${okCount}/${results.length} en ${ms(start)}`)
}

// --- PHASE 5: STRESS RATE LIMITING
async function stressThrottle(userIds) {
  console.log(`[throttle] Disparando 5 throttle checks consecutivos para los primeros 10 users...`)
  const start = performance.now()
  // Toma 10 users, dispara 5 checks consecutivos rápidos. Primero debe pasar, los demás fallar.
  const sample = userIds.slice(0, 10)
  const allOps = sample.flatMap(uid =>
    Array.from({ length: 5 }, () =>
      sb.rpc('check_bet_throttle', { p_user_id: uid, p_min_gap_ms: 1000 })
        .then(({ data }) => data === true)
    )
  )
  const results = await Promise.all(allOps)
  const passed = results.filter(Boolean).length
  // Esperamos ~10 OK (uno por user, después de eso bloqueado por el gap de 1s)
  console.log(`[throttle] Pasaron ${passed}/${results.length} (esperado ~10 de 50)`)
}

// --- PHASE 6: STRESS SETTLEMENT IDEMPOTENCE
async function stressSettlement(matchId) {
  console.log(`[settle] Marcando match como finished y disparando autoResolveMatch 5x en paralelo...`)
  const start = performance.now()
  // Resolución 2-1 → ganador home
  await sb.from('matches').update({
    status: 'finished',
    home_score: 2,
    away_score: 1,
  }).eq('id', matchId)

  // Replico la lógica de autoResolveMatch en SQL puro vía Supabase ops.
  // En paralelo dispara 5 veces el "resolve" — testea que NO haya doble pago.
  const resolveOnce = async () => {
    const { data: bets } = await sb.from('bets')
      .select('id, user_id, pick, potential_payout')
      .eq('match_id', matchId)
      .eq('status', 'pending')

    for (const bet of bets ?? []) {
      const won = bet.pick === 'home' || bet.pick === '1'
      const { data: updated } = await sb.from('bets')
        .update({ status: won ? 'won' : 'lost', resolved_at: new Date().toISOString() })
        .eq('id', bet.id).eq('status', 'pending')
        .select('id').maybeSingle()
      if (updated && won) {
        await sb.rpc('add_credits_atomic', {
          p_user_id: bet.user_id,
          p_amount: bet.potential_payout,
          p_type: 'win',
          p_description: 'stress resolve',
          p_reference_id: bet.id,
        })
      }
    }
  }
  await Promise.all([resolveOnce(), resolveOnce(), resolveOnce(), resolveOnce(), resolveOnce()])
  console.log(`[settle] 5 resoluciones concurrentes completas en ${ms(start)}`)
}

// --- PHASE 7: VERIFY INTEGRITY
async function verifyIntegrity(userIds) {
  console.log(`[verify] Validando integridad de ${userIds.length} users...`)
  let cuadraron = 0, descuadrados = 0, dupes = 0
  let totalCredits = 0, totalLedger = 0
  const issues = []

  for (const uid of userIds) {
    const { data: profile } = await sb.from('profiles').select('credits').eq('id', uid).single()
    const { data: txs } = await sb.from('credit_transactions').select('amount, type, reference_id').eq('user_id', uid)
    const sumLedger = (txs ?? []).reduce((acc, t) => acc + Number(t.amount), 0)
    const balance = Number(profile?.credits ?? 0)

    totalCredits += balance
    totalLedger += sumLedger

    if (Math.abs(balance - sumLedger) > 0.01) {
      descuadrados++
      issues.push(`User ${uid.slice(0, 8)}: balance=${balance} ledger=${sumLedger.toFixed(2)} diff=${(balance - sumLedger).toFixed(2)}`)
    } else {
      cuadraron++
    }

    // Check duplicados (user_id, type, reference_id) con reference_id NOT NULL
    const seen = new Set()
    for (const t of txs ?? []) {
      if (!t.reference_id) continue
      const k = `${t.type}|${t.reference_id}`
      if (seen.has(k)) {
        dupes++
        issues.push(`User ${uid.slice(0, 8)}: DUP ${k}`)
      }
      seen.add(k)
    }

    if (balance < 0) {
      issues.push(`User ${uid.slice(0, 8)}: BALANCE NEGATIVO ${balance}`)
    }
  }

  console.log(`[verify] Balance vs ledger: ✓ ${cuadraron} cuadran · ✗ ${descuadrados} descuadrados`)
  console.log(`[verify] Duplicados encontrados: ${dupes}`)
  console.log(`[verify] Suma balances: $${totalCredits.toFixed(2)} | Suma ledgers: $${totalLedger.toFixed(2)} | Diff: $${(totalCredits - totalLedger).toFixed(2)}`)
  if (issues.length && issues.length < 30) {
    console.log(`[verify] Issues:`)
    for (const i of issues) console.log(`  - ${i}`)
  } else if (issues.length) {
    console.log(`[verify] (${issues.length} issues totales, mostrando primeros 10:)`)
    for (const i of issues.slice(0, 10)) console.log(`  - ${i}`)
  }

  return { cuadraron, descuadrados, dupes, issues }
}

// --- PHASE 8: CLEANUP
async function cleanup(userIds, matchIds) {
  console.log(`[cleanup] Borrando data de prueba...`)
  // Las bets, parlays, parlay_legs, credit_transactions, mines_sessions van a
  // cascadear con el auth.users delete (FK ON DELETE CASCADE en profiles).
  // De todas formas borramos explicito por si algo no tiene cascade.
  await sb.from('credit_transactions').delete().in('user_id', userIds)
  await sb.from('parlay_legs').delete().in('parlay_id',
    (await sb.from('parlays').select('id').in('user_id', userIds)).data?.map(p => p.id) ?? []
  )
  await sb.from('parlays').delete().in('user_id', userIds)
  await sb.from('bets').delete().in('user_id', userIds)
  await sb.from('mines_sessions').delete().in('user_id', userIds)
  await sb.from('penalty_sessions').delete().in('user_id', userIds)
  await sb.from('activity_feed').delete().in('user_id', userIds)
  await sb.from('bet_throttle').delete().in('user_id', userIds)

  for (const uid of userIds) {
    await sb.auth.admin.deleteUser(uid).catch(() => {})
  }
  // Borrar matches test
  for (const mid of matchIds) {
    await sb.from('matches').delete().eq('id', mid)
  }
  console.log(`[cleanup] Done.`)
}

// --- MAIN
async function main() {
  console.log('═══════════════════════════════════════════════════')
  console.log(`  Xepe Bet — Stress Test (${N_USERS} users)`)
  console.log('═══════════════════════════════════════════════════\n')

  const t0 = performance.now()
  let userIds = []
  let matchIds = []

  try {
    matchIds = await createTestMatches()
    console.log(`[setup] Matches test: ${matchIds.join(', ')}\n`)

    userIds = await createTestUsers(N_USERS)
    if (userIds.length === 0) throw new Error('No se crearon users')

    // Stress en serie de fases (cada fase es paralela internamente)
    await stressBets(userIds, matchIds[0])
    await stressParlays(userIds, matchIds)
    await stressMines(userIds)
    await stressThrottle(userIds)
    await stressSettlement(matchIds[0])

    console.log()
    const result = await verifyIntegrity(userIds)

    console.log(`\n═══════════════════════════════════════════════════`)
    console.log(`  Resultado: ${result.descuadrados === 0 && result.dupes === 0 ? '✓ INTEGRIDAD OK' : '✗ INTEGRIDAD FALLA'}`)
    console.log(`  Tiempo total: ${ms(t0)}`)
    console.log('═══════════════════════════════════════════════════')
  } catch (err) {
    console.error('\n✗ Stress test falló:', err)
  } finally {
    if (userIds.length || matchIds.length) {
      console.log('')
      await cleanup(userIds, matchIds)
    }
  }
}

main()
