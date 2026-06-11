#!/usr/bin/env node
// =====================================================================
// Smoke tests — Xepe Bet (happy paths criticos)
// =====================================================================
//
// Valida los 3 flujos que NO pueden romperse:
//   1. placeBet → autoResolveMatch → win: balance refleja payout, audit OK
//   2. placeBet → cashOutBet: balance refleja cashout, bet status='cashed_out'
//   3. Casino mines: deduct → reveal safes → cashout → balance refleja payout
//
// Filosofia: 1 user test, 1 match test, asserts duros, cleanup completo.
// Si esto pasa, el core de la app esta sano. Corremos antes de cada deploy
// importante.
//
// Run: node scripts/smoke-test.mjs
// Exit code 0 = todos pasaron, 1 = al menos uno fallo.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

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
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// --- CONFIG
const TEAM_HOME = '04d4c3b9-ccfc-4147-badc-29430d4eb4eb'  // Mexico
const TEAM_AWAY = 'b188ff20-c37a-4d4b-8c73-5e16972f006f' // South Africa
const TEST_PREFIX = `smoke-${Date.now()}`
const INITIAL_CREDITS = 5000

// --- ASSERT HELPER
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
}
function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`ASSERT FAILED: ${msg}\n  expected: ${expected}\n  actual:   ${actual}`)
}

// --- SETUP
async function setup() {
  console.log('[setup] Creando user + match de test...')

  const { data: userRes, error: userErr } = await sb.auth.admin.createUser({
    email: `${TEST_PREFIX}@xepetest.local`,
    password: 'SmokeTest1234!',
    email_confirm: true,
    user_metadata: { full_name: 'Smoke Test' },
  })
  if (userErr) throw new Error('No pude crear user: ' + userErr.message)
  const userId = userRes.user.id

  // El trigger handle_new_user da signup credits ($500 default). Lo nivelamos a INITIAL_CREDITS.
  await sb.from('profiles').update({ credits: INITIAL_CREDITS }).eq('id', userId)

  const futureStart = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString()
  const { data: match, error: matchErr } = await sb.from('matches').insert({
    home_team_id: TEAM_HOME,
    away_team_id: TEAM_AWAY,
    starts_at: futureStart,
    status: 'scheduled',
    odds_home: 2.00,
    odds_draw: 3.30,
    odds_away: 3.50,
    round: 'group',
    group_name: null,
  }).select('id').single()
  if (matchErr) throw new Error('No pude crear match: ' + matchErr.message)

  return { userId, matchId: match.id }
}

// --- CLEANUP
async function cleanup({ userId, matchId }) {
  console.log('[cleanup] Borrando data de test...')
  // Orden importa por FKs: leg → parlays → bets → casino_sessions → ai_feed → tx → match → user
  await sb.from('parlay_legs').delete().eq('match_id', matchId)
  await sb.from('parlays').delete().eq('user_id', userId)
  await sb.from('bets').delete().eq('user_id', userId)
  await sb.from('mines_sessions').delete().eq('user_id', userId)
  await sb.from('penalty_sessions').delete().eq('user_id', userId)
  await sb.from('predictions').delete().eq('user_id', userId)
  await sb.from('casino_sessions').delete().eq('user_id', userId)
  await sb.from('activity_feed').delete().eq('user_id', userId)
  await sb.from('ai_feed').delete().eq('user_id', userId)
  await sb.from('credit_transactions').delete().eq('user_id', userId)
  await sb.from('bet_throttle').delete().eq('user_id', userId)
  await sb.from('matches').delete().eq('id', matchId)
  await sb.auth.admin.deleteUser(userId)
}

async function getBalance(userId) {
  const { data } = await sb.from('profiles').select('credits').eq('id', userId).single()
  return data?.credits ?? 0
}

async function getLedgerSum(userId) {
  const { data } = await sb.from('credit_transactions').select('amount').eq('user_id', userId)
  return (data ?? []).reduce((acc, t) => acc + Number(t.amount), 0)
}

// =====================================================================
// TEST 1: placeBet → autoResolveMatch → win
// =====================================================================
async function testPlaceBetWin({ userId, matchId }) {
  console.log('\n[test 1] placeBet → match finished → win → payout')

  const balanceBefore = await getBalance(userId)
  const STAKE = 100
  const PICK = 'home'
  const ODDS = 2.00
  const EXPECTED_PAYOUT = STAKE * ODDS // 200

  // 1. Place bet
  const { data: betData, error: betErr } = await sb.rpc('place_bet_atomic', {
    p_user_id: userId,
    p_match_id: matchId,
    p_market_type: '1x2',
    p_pick: PICK,
    p_amount: STAKE,
    p_server_odds: ODDS,
  })
  if (betErr) throw new Error('place_bet_atomic fallo: ' + betErr.message)
  const bet = betData[0]
  assert(bet.success, `bet no exitosa: ${bet.error_code}`)
  assertEq(Number(bet.potential_payout), EXPECTED_PAYOUT, 'potential_payout debe ser stake * odds')

  const balanceAfterBet = await getBalance(userId)
  assertEq(Number(balanceAfterBet), balanceBefore - STAKE, 'balance debe debitar el stake exacto')

  // 2. Marcar match como finished con home ganando
  await sb.from('matches').update({
    home_score: 2,
    away_score: 0,
    status: 'finished',
    score_synced: true,
  }).eq('id', matchId)

  // 3. Simular autoResolveMatch manual (lo que hace el cron). Para esto la
  //    funcion real es TS — replicamos su logica core: update bet won + addCredits.
  //    En la app real esto corre por scheduler, aca lo hacemos directo.
  await sb.from('bets')
    .update({ status: 'won', resolved_at: new Date().toISOString() })
    .eq('id', bet.bet_id)
    .eq('status', 'pending')

  const { data: payRes, error: payErr } = await sb.rpc('add_credits_atomic', {
    p_user_id: userId,
    p_amount: EXPECTED_PAYOUT,
    p_type: 'win',
    p_description: `Smoke test win`,
    p_reference_id: bet.bet_id,
  })
  if (payErr) throw new Error('add_credits_atomic fallo: ' + payErr.message)
  assert(payRes[0].success, 'pago debio ser exitoso')

  const balanceFinal = await getBalance(userId)
  assertEq(Number(balanceFinal), balanceBefore - STAKE + EXPECTED_PAYOUT, 'balance final = balance - stake + payout')

  // 4. Verificar audit
  const { data: txs } = await sb.from('credit_transactions')
    .select('type, amount, reference_id')
    .eq('user_id', userId)
    .in('type', ['bet', 'win'])
    .eq('reference_id', bet.bet_id)
  assertEq(txs.length, 2, 'debe haber 2 audit rows (bet debit + win credit)')
  const debit = txs.find(t => t.type === 'bet')
  const credit = txs.find(t => t.type === 'win')
  assertEq(Number(debit.amount), -STAKE, 'audit bet debe ser -stake')
  assertEq(Number(credit.amount), EXPECTED_PAYOUT, 'audit win debe ser +payout')

  // 5. Idempotencia: re-llamar add_credits con mismo reference NO debe pagar 2x
  const { data: dupe } = await sb.rpc('add_credits_atomic', {
    p_user_id: userId,
    p_amount: EXPECTED_PAYOUT,
    p_type: 'win',
    p_description: 'dupe attempt',
    p_reference_id: bet.bet_id,
  })
  const balanceAfterDupe = await getBalance(userId)
  assertEq(Number(balanceAfterDupe), Number(balanceFinal), 'balance NO debe cambiar tras retry con mismo reference')

  console.log('  ✓ stake debitado, payout acreditado, audit cuadra, idempotencia OK')
}

// =====================================================================
// TEST 2: placeBet → cashOutBet
// =====================================================================
async function testCashOut({ userId, matchId }) {
  console.log('\n[test 2] placeBet → cashOutBet')

  // Reset match a scheduled para poder apostar
  await sb.from('matches').update({
    status: 'scheduled', home_score: null, away_score: null, score_synced: false,
  }).eq('id', matchId)

  const balanceBefore = await getBalance(userId)
  const STAKE = 50
  const PICK = 'away'
  const ODDS = 3.50

  const { data: betData } = await sb.rpc('place_bet_atomic', {
    p_user_id: userId,
    p_match_id: matchId,
    p_market_type: '1x2',
    p_pick: PICK,
    p_amount: STAKE,
    p_server_odds: ODDS,
  })
  const bet = betData[0]
  assert(bet.success, `bet no exitosa: ${bet.error_code}`)

  // Cash out con un valor menor al payout teorico (simulamos que las odds movieron a favor)
  const CASHOUT_VALUE = 70 // < 175 (50 * 3.5)

  const { data: coData, error: coErr } = await sb.rpc('cashout_bet_atomic', {
    p_bet_id: bet.bet_id,
    p_user_id: userId,
    p_cashout_value: CASHOUT_VALUE,
  })
  if (coErr) throw new Error('cashout_bet_atomic fallo: ' + coErr.message)
  assert(coData[0].success, `cashout fallo: ${coData[0].error_code}`)

  const balanceAfter = await getBalance(userId)
  assertEq(Number(balanceAfter), balanceBefore - STAKE + CASHOUT_VALUE, 'balance = balance - stake + cashout')

  // Verificar bet status
  const { data: betFinal } = await sb.from('bets').select('status').eq('id', bet.bet_id).single()
  assertEq(betFinal.status, 'cashed_out', 'bet status debe ser cashed_out')

  // Idempotencia: re-cashout debe fallar
  const { data: retryData } = await sb.rpc('cashout_bet_atomic', {
    p_bet_id: bet.bet_id,
    p_user_id: userId,
    p_cashout_value: CASHOUT_VALUE,
  })
  assert(!retryData[0].success, 're-cashout debe fallar (idempotencia)')
  assertEq(retryData[0].error_code, 'bet_not_cashable', 'error_code esperado: bet_not_cashable')

  const balanceAfterRetry = await getBalance(userId)
  assertEq(Number(balanceAfterRetry), Number(balanceAfter), 'balance NO debe cambiar tras retry')

  console.log('  ✓ cashout aplicado, status correcto, idempotencia OK')
}

// =====================================================================
// TEST 3: Casino mines — deduct → reveal → cashout
// =====================================================================
async function testCasinoMines({ userId }) {
  console.log('\n[test 3] Casino mines: deduct → reveal → cashout')

  const balanceBefore = await getBalance(userId)
  const COST = 25 // MINES_COST default
  const MINE_COUNT = 3
  const GRID_SIZE = 25
  const SAFE_CELLS = GRID_SIZE - MINE_COUNT // 22 safes

  // 1. Deduct para arrancar
  const { data: deductData, error: deductErr } = await sb.rpc('deduct_credits_atomic', {
    p_user_id: userId,
    p_amount: COST,
    p_type: 'casino_bet',
    p_description: 'Smoke mines',
    p_reference_id: null,
  })
  if (deductErr) throw new Error('deduct fallo: ' + deductErr.message)
  assert(deductData[0].success, 'deduct debe ser exitoso')

  const balanceAfterStart = await getBalance(userId)
  assertEq(Number(balanceAfterStart), balanceBefore - COST, 'balance debe debitar cost')

  // 2. Crear sesion (sin minas en las 5 primeras cells para simular reveals safe)
  const minePositions = [22, 23, 24] // minas en las ultimas 3 cells del grid
  const { data: session, error: sessErr } = await sb.from('mines_sessions').insert({
    user_id: userId,
    bet_amount: COST,
    mine_count: MINE_COUNT,
    mine_positions: minePositions,
    safe_revealed: [],
    status: 'active',
    current_multiplier: 1.0,
  }).select('*').single()
  if (sessErr) throw new Error('insert mines_sessions fallo: ' + sessErr.message)

  // 3. Revelar 5 safes (cells 0-4)
  const revealed = [0, 1, 2, 3, 4]
  await sb.from('mines_sessions')
    .update({ safe_revealed: revealed })
    .eq('id', session.id)
    .eq('status', 'active')

  // 4. Cashout — multiplier crece con safes revelados. Para 5 safes hay un payout >= COST.
  //    Replicamos: payout = COST * (SAFE_CELLS / (SAFE_CELLS - revealed)) ^ revealed (formula simplificada del juego)
  //    Para el smoke test usamos un payout fijo razonable; lo importante es que addCredits funcione idempotente.
  const PAYOUT = 60 // > COST, ganancia neta del juego

  // Update sesion como cashed_out con guard
  const { data: closed } = await sb.from('mines_sessions')
    .update({ status: 'cashed_out', payout: PAYOUT, ended_at: new Date().toISOString() })
    .eq('id', session.id)
    .eq('status', 'active')
    .select('id')
    .single()
  assert(closed, 'sesion debe haberse cerrado correctamente')

  // Pagar con reference_id = session.id (clave de idempotencia)
  const { data: payData } = await sb.rpc('add_credits_atomic', {
    p_user_id: userId,
    p_amount: PAYOUT,
    p_type: 'casino_win',
    p_description: 'Smoke mines cashout',
    p_reference_id: session.id,
  })
  assert(payData[0].success, 'pago debe ser exitoso')

  const balanceFinal = await getBalance(userId)
  assertEq(Number(balanceFinal), balanceBefore - COST + PAYOUT, 'balance final = balance - cost + payout')

  // 5. Idempotencia: re-cerrar sesion no debe romper
  const { data: dupClose } = await sb.from('mines_sessions')
    .update({ status: 'cashed_out', payout: 99999 })
    .eq('id', session.id)
    .eq('status', 'active')
    .select('id')
  assertEq(dupClose?.length ?? 0, 0, 're-update con guard active debe devolver 0 rows')

  // 6. Idempotencia: re-pagar con mismo reference no debe duplicar
  const { data: payDupe } = await sb.rpc('add_credits_atomic', {
    p_user_id: userId,
    p_amount: PAYOUT,
    p_type: 'casino_win',
    p_description: 'dupe',
    p_reference_id: session.id,
  })
  // El UNIQUE constraint puede atajarlo con error 23505 o success=true segun la version
  const balanceAfterDupe = await getBalance(userId)
  assertEq(Number(balanceAfterDupe), Number(balanceFinal), 'balance no debe cambiar tras intento de doble pago')

  console.log('  ✓ deduct, reveal, cashout, idempotencia OK')
}

// =====================================================================
// AUDIT FINAL: balance vs ledger
// =====================================================================
async function auditBalanceVsLedger({ userId }) {
  console.log('\n[audit] balance vs ledger')
  const balance = await getBalance(userId)
  const ledger = await getLedgerSum(userId)
  const diff = Math.abs(Number(balance) - Number(ledger))
  assert(diff < 0.01, `descuadre balance vs ledger: balance=${balance}, ledger=${ledger}, diff=${diff}`)
  console.log(`  ✓ balance=${balance}, ledger=${ledger} (cuadran)`)
}

// =====================================================================
// MAIN
// =====================================================================
async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log(`  SMOKE TESTS — Xepe Bet`)
  console.log(`  ${new Date().toISOString()}`)
  console.log('═══════════════════════════════════════════════════════')

  let ctx
  let failed = []
  try {
    ctx = await setup()
    console.log(`  userId: ${ctx.userId}`)
    console.log(`  matchId: ${ctx.matchId}`)
  } catch (err) {
    console.error('SETUP FALLO:', err.message)
    process.exit(1)
  }

  const tests = [
    ['placeBet → win', () => testPlaceBetWin(ctx)],
    ['cashOutBet', () => testCashOut(ctx)],
    ['casino mines', () => testCasinoMines(ctx)],
    ['audit balance vs ledger', () => auditBalanceVsLedger(ctx)],
  ]

  for (const [name, fn] of tests) {
    try {
      await fn()
    } catch (err) {
      failed.push({ name, error: err.message })
      console.error(`  ✗ ${name}: ${err.message}`)
    }
  }

  try {
    await cleanup(ctx)
  } catch (err) {
    console.warn('[cleanup] error (no fatal):', err.message)
  }

  console.log('\n═══════════════════════════════════════════════════════')
  if (failed.length === 0) {
    console.log(`  ✓ TODOS LOS TESTS PASARON (${tests.length}/${tests.length})`)
    console.log('═══════════════════════════════════════════════════════')
    process.exit(0)
  } else {
    console.log(`  ✗ ${failed.length}/${tests.length} TESTS FALLARON`)
    failed.forEach(f => console.log(`    - ${f.name}: ${f.error}`))
    console.log('═══════════════════════════════════════════════════════')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
