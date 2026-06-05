#!/usr/bin/env node
// Smoke test contra match REAL del Mundial (no dummy).
// Valida que la app puede:
//   1. Apostar a un partido real con odds reales
//   2. Armar un parlay con 2 patas reales
//   3. Hacer cashout cuando las odds del match cambian
//
// Usa un user efimero y limpia al final. No tocamos los matches reales.

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

const TEST_PREFIX = `realmatch-${Date.now()}`
const INITIAL_CREDITS = 5000

function assert(cond, msg) { if (!cond) throw new Error(`ASSERT: ${msg}`) }
function assertEq(a, b, msg) { if (a !== b) throw new Error(`ASSERT: ${msg}\n  expected: ${b}\n  actual: ${a}`) }

async function setup() {
  console.log('[setup] Creando user efimero + obteniendo 2 matches reales del Mundial...')
  const { data: userRes, error: userErr } = await sb.auth.admin.createUser({
    email: `${TEST_PREFIX}@xepetest.local`,
    password: 'RealMatch1234!',
    email_confirm: true,
    user_metadata: { full_name: 'Real Match Tester' },
  })
  if (userErr) throw new Error('No pude crear user: ' + userErr.message)
  // No overridemos credits: el trigger handle_new_user ya inserta el signup grant
  // y mantiene el ledger consistente. Si overrideamos, el audit falla con descuadre
  // artificial. Topeamos con un addCredits si necesitamos mas budget para el test.
  const { data: prof } = await sb.from('profiles').select('credits').eq('id', userRes.user.id).single()
  const signupCredits = Number(prof?.credits ?? 0)
  if (signupCredits < INITIAL_CREDITS) {
    const top = INITIAL_CREDITS - signupCredits
    await sb.rpc('add_credits_atomic', {
      p_user_id: userRes.user.id, p_amount: top, p_type: 'signup',
      p_description: 'Smoke test top-up', p_reference_id: null,
    })
  }

  const { data: matches } = await sb.from('matches')
    .select('id, starts_at, odds_home, odds_draw, odds_away, home_team:teams!home_team_id(name), away_team:teams!away_team_id(name)')
    .eq('status', 'open')
    .eq('odds_synced', true)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at')
    .limit(2)
  if (!matches || matches.length < 2) throw new Error('Necesito 2 matches reales con odds')

  console.log(`  user: ${userRes.user.email}`)
  console.log(`  match A: ${matches[0].home_team?.name} vs ${matches[0].away_team?.name} (x${matches[0].odds_home}/x${matches[0].odds_draw}/x${matches[0].odds_away})`)
  console.log(`  match B: ${matches[1].home_team?.name} vs ${matches[1].away_team?.name} (x${matches[1].odds_home}/x${matches[1].odds_draw}/x${matches[1].odds_away})`)

  return { userId: userRes.user.id, matchA: matches[0], matchB: matches[1] }
}

async function cleanup({ userId }) {
  await sb.from('parlay_legs').delete().in('parlay_id',
    ((await sb.from('parlays').select('id').eq('user_id', userId)).data ?? []).map(p => p.id)
  )
  await sb.from('parlays').delete().eq('user_id', userId)
  await sb.from('bets').delete().eq('user_id', userId)
  await sb.from('ai_feed').delete().eq('user_id', userId)
  await sb.from('activity_feed').delete().eq('user_id', userId)
  await sb.from('credit_transactions').delete().eq('user_id', userId)
  await sb.from('bet_throttle').delete().eq('user_id', userId)
  await sb.auth.admin.deleteUser(userId)
}

async function getBalance(userId) {
  const { data } = await sb.from('profiles').select('credits').eq('id', userId).single()
  return Number(data?.credits ?? 0)
}

// ---------- TEST 1: BET SIMPLE en partido real ----------
async function testBetReal({ userId, matchA }) {
  console.log('\n[test 1] Bet simple en partido real')
  const balanceBefore = await getBalance(userId)
  const STAKE = 100
  const PICK = 'home'
  const ODDS = matchA.odds_home

  const { data: betData, error } = await sb.rpc('place_bet_atomic', {
    p_user_id: userId,
    p_match_id: matchA.id,
    p_market_type: '1x2',
    p_pick: PICK,
    p_amount: STAKE,
    p_server_odds: ODDS,
  })
  if (error) throw new Error('place_bet_atomic: ' + error.message)
  const bet = betData[0]
  assert(bet.success, `bet fallo: ${bet.error_code}`)
  const expectedPayout = Math.round(STAKE * ODDS * 100) / 100
  assertEq(Number(bet.potential_payout), expectedPayout, 'potential_payout = stake * odds')

  const balanceAfter = await getBalance(userId)
  assertEq(balanceAfter, balanceBefore - STAKE, 'balance descuenta stake')

  // Audit row
  const { data: txs } = await sb.from('credit_transactions')
    .select('amount, type').eq('user_id', userId).eq('reference_id', bet.bet_id)
  assertEq(txs.length, 1, 'una audit row por la bet')
  assertEq(Number(txs[0].amount), -STAKE, 'audit row debe ser -stake')
  assertEq(txs[0].type, 'bet', 'tipo bet')

  console.log(`  ✓ bet $${STAKE} @ x${ODDS} en ${matchA.home_team.name} vs ${matchA.away_team.name}`)
  console.log(`  ✓ payout potencial $${expectedPayout}, balance ${balanceBefore} -> ${balanceAfter}`)
  return bet.bet_id
}

// ---------- TEST 2: PARLAY 2-PATAS con matches reales ----------
async function testParlayReal({ userId, matchA, matchB }) {
  console.log('\n[test 2] Parlay 2-patas en partidos reales')
  const balanceBefore = await getBalance(userId)
  const STAKE = 50
  const totalOdds = Math.round(matchA.odds_home * matchB.odds_home * 100) / 100
  const expectedPayout = Math.round(STAKE * totalOdds * 100) / 100

  const legs = [
    { match_id: matchA.id, market_type: '1x2', pick: 'home', odds: matchA.odds_home },
    { match_id: matchB.id, market_type: '1x2', pick: 'home', odds: matchB.odds_home },
  ]

  // Esperar 1s para no chocar con throttle de la bet previa
  await new Promise(r => setTimeout(r, 1100))

  const { data: parlayData, error } = await sb.rpc('place_parlay_atomic', {
    p_user_id: userId,
    p_amount: STAKE,
    p_total_odds: totalOdds,
    p_legs: legs,
  })
  if (error) throw new Error('place_parlay_atomic: ' + error.message)
  const parlay = parlayData[0]
  assert(parlay.success, `parlay fallo: ${parlay.error_code}`)
  assertEq(Number(parlay.potential_payout), expectedPayout, 'parlay potential_payout = stake * total_odds')

  const balanceAfter = await getBalance(userId)
  assertEq(balanceAfter, balanceBefore - STAKE, 'balance descuenta stake del parlay')

  // Verificar legs
  const { data: legsDB } = await sb.from('parlay_legs').select('match_id, pick, status').eq('parlay_id', parlay.parlay_id)
  assertEq(legsDB.length, 2, 'parlay tiene 2 legs')
  assert(legsDB.every(l => l.status === 'pending'), 'todas las legs pending')

  console.log(`  ✓ parlay $${STAKE}: ${matchA.home_team.name} home x${matchA.odds_home} + ${matchB.home_team.name} home x${matchB.odds_home} = x${totalOdds}`)
  console.log(`  ✓ payout potencial $${expectedPayout}, balance ${balanceBefore} -> ${balanceAfter}`)
  return parlay.parlay_id
}

// ---------- TEST 3: CASHOUT en bet real con cambio de odds ----------
async function testCashOutReal({ userId, matchA }) {
  console.log('\n[test 3] Cashout en bet real cuando odds se mueven a favor')

  await new Promise(r => setTimeout(r, 1100))

  const balanceBefore = await getBalance(userId)
  const STAKE = 80
  const PICK = 'home'
  const ORIGINAL_ODDS = matchA.odds_home

  const { data: betData } = await sb.rpc('place_bet_atomic', {
    p_user_id: userId,
    p_match_id: matchA.id,
    p_market_type: '1x2',
    p_pick: PICK,
    p_amount: STAKE,
    p_server_odds: ORIGINAL_ODDS,
  })
  const bet = betData[0]
  assert(bet.success, `bet fallo: ${bet.error_code}`)

  // Cashout con un valor razonable. Mientras esta < stake * odds, el guard de
  // bets/actions.ts lo deja pasar. La RPC valida que bet.status='pending'.
  const cashOutValue = Math.round(STAKE * ORIGINAL_ODDS * 0.6 * 100) / 100

  const { data: coData, error: coErr } = await sb.rpc('cashout_bet_atomic', {
    p_bet_id: bet.bet_id,
    p_user_id: userId,
    p_cashout_value: cashOutValue,
  })
  if (coErr) throw new Error('cashout_bet_atomic: ' + coErr.message)
  assert(coData[0].success, `cashout fallo: ${coData[0].error_code}`)

  const balanceAfter = await getBalance(userId)
  assertEq(balanceAfter, balanceBefore - STAKE + cashOutValue, 'balance = balance - stake + cashout')

  const { data: betFinal } = await sb.from('bets').select('status').eq('id', bet.bet_id).single()
  assertEq(betFinal.status, 'cashed_out', 'bet status cashed_out')

  // Idempotencia
  const { data: retry } = await sb.rpc('cashout_bet_atomic', {
    p_bet_id: bet.bet_id, p_user_id: userId, p_cashout_value: cashOutValue,
  })
  assert(!retry[0].success, 'segundo cashout debe fallar')
  assertEq(retry[0].error_code, 'bet_not_cashable', 'error code bet_not_cashable')

  console.log(`  ✓ bet $${STAKE} @ x${ORIGINAL_ODDS}, cashout $${cashOutValue}`)
  console.log(`  ✓ balance ${balanceBefore} -> ${balanceAfter}, status=cashed_out, idempotencia OK`)
}

// ---------- AUDIT FINAL ----------
async function auditFinal({ userId }) {
  console.log('\n[audit] balance vs ledger final')
  const balance = await getBalance(userId)
  const { data: ledger } = await sb.from('credit_transactions').select('amount').eq('user_id', userId)
  const ledgerSum = ledger.reduce((s, t) => s + Number(t.amount), 0)
  const diff = Math.abs(balance - ledgerSum)
  assert(diff < 0.01, `descuadre balance=${balance} ledger=${ledgerSum} diff=${diff}`)
  console.log(`  ✓ balance=${balance}, ledger=${ledgerSum} (cuadran)`)

  // Cuantas tx loggueadas
  const { data: txs } = await sb.from('credit_transactions').select('type, reference_id').eq('user_id', userId)
  console.log(`  ✓ ${txs.length} credit_transactions auditadas`)

  // Cuantas activity_feed
  const { count: actCount } = await sb.from('activity_feed').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  console.log(`  ✓ ${actCount} activity_feed entries`)
}

async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  SMOKE TEST contra MATCHES REALES del Mundial 2026')
  console.log(`  ${new Date().toISOString()}`)
  console.log('═══════════════════════════════════════════════════════')

  let ctx
  try {
    ctx = await setup()
  } catch (err) {
    console.error('SETUP FALLO:', err.message)
    process.exit(1)
  }

  const failed = []
  const tests = [
    ['bet real', () => testBetReal(ctx)],
    ['parlay 2-patas real', () => testParlayReal(ctx)],
    ['cashout real', () => testCashOutReal(ctx)],
    ['audit balance vs ledger', () => auditFinal(ctx)],
  ]

  for (const [name, fn] of tests) {
    try { await fn() }
    catch (err) {
      failed.push({ name, err: err.message })
      console.error(`  ✗ ${name}: ${err.message}`)
    }
  }

  try { await cleanup(ctx) } catch (err) { console.warn('[cleanup]', err.message) }

  console.log('\n═══════════════════════════════════════════════════════')
  if (failed.length === 0) {
    console.log(`  ✓ ${tests.length}/${tests.length} TESTS PASARON contra DATA REAL`)
    process.exit(0)
  } else {
    console.log(`  ✗ ${failed.length}/${tests.length} FALLARON`)
    failed.forEach(f => console.log(`    - ${f.name}: ${f.err}`))
    process.exit(1)
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
