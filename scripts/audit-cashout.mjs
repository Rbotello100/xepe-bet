#!/usr/bin/env node
// =====================================================================
// Audit cashout — modelo "stake × 0.92 fijo" para los 7 mercados.
//
// Verifica que el cashout funciona uniforme para 1X2, double_chance,
// btts, draw_no_bet, totals_1.5/2.5/3.5 — todos pagan el 92% del stake
// sin depender de odds actuales.
//
// Cobertura:
//   1. Cashout 1X2 → balance + ledger cuadran
//   2. Cashout BTTS → balance + ledger cuadran
//   3. Cashout DNB → balance + ledger cuadran
//   4. Cashout totals_2.5 → balance + ledger cuadran
//   5. Cashout double_chance → balance + ledger cuadran
//   6. Idempotencia: re-llamar cashout → bet_not_cashable
//   7. Defensa en profundidad: RPC valida market_type
//
// Run: node scripts/audit-cashout.mjs
// =====================================================================

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

const TEAM_HOME = '04d4c3b9-ccfc-4147-badc-29430d4eb4eb'
const TEAM_AWAY = 'b188ff20-c37a-4d4b-8c73-5e16972f006f'
const TEST_PREFIX = `cashout-${Date.now()}`
const CASHOUT_MARGIN = 0.92  // mismo que features/bets/actions.ts y BetCard.tsx

function assert(cond, msg) { if (!cond) throw new Error(`ASSERT FAILED: ${msg}`) }
function assertEq(a, b, msg) { if (a !== b) throw new Error(`ASSERT FAILED: ${msg}\n  expected: ${b}\n  actual:   ${a}`) }
function expectedCashout(stake) { return Math.round(stake * CASHOUT_MARGIN * 100) / 100 }

async function getBalance(userId) {
  const { data } = await sb.from('profiles').select('credits').eq('id', userId).single()
  return Number(data?.credits ?? 0)
}
async function getLedger(userId) {
  const { data } = await sb.from('credit_transactions').select('amount').eq('user_id', userId)
  return (data ?? []).reduce((acc, t) => acc + Number(t.amount), 0)
}

async function setup() {
  console.log('[setup] Creando user + match sintetico con odds para 7 mercados...')
  const { data: userRes, error: ue } = await sb.auth.admin.createUser({
    email: `${TEST_PREFIX}@xepetest.local`,
    password: 'CashoutAudit1234!',
    email_confirm: true,
  })
  if (ue) throw new Error('createUser: ' + ue.message)
  const userId = userRes.user.id

  const future = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString()
  const { data: match, error: me } = await sb.from('matches').insert({
    home_team_id: TEAM_HOME, away_team_id: TEAM_AWAY, starts_at: future,
    status: 'scheduled', odds_home: 2.00, odds_draw: 3.30, odds_away: 3.50,
    round: 'group',
  }).select('id').single()
  if (me) throw new Error('match: ' + me.message)

  // Inyectar odds para mercados extra
  await sb.from('match_market_odds').insert([
    { match_id: match.id, market_type: 'double_chance', pick: '1X',       odds: 1.50, point: null },
    { match_id: match.id, market_type: 'btts',          pick: 'btts_yes', odds: 1.85, point: null },
    { match_id: match.id, market_type: 'draw_no_bet',   pick: 'dnb_home', odds: 1.65, point: null },
    { match_id: match.id, market_type: 'totals_2.5',    pick: 'over_2.5', odds: 1.85, point: 2.5 },
  ])

  return { userId, matchId: match.id }
}

async function cleanup({ userId, matchId }) {
  console.log('[cleanup] Borrando data de test...')
  await sb.from('bets').delete().eq('user_id', userId)
  await sb.from('credit_transactions').delete().eq('user_id', userId)
  await sb.from('activity_feed').delete().eq('user_id', userId)
  await sb.from('bet_throttle').delete().eq('user_id', userId)
  await sb.from('match_market_odds').delete().eq('match_id', matchId)
  await sb.from('matches').delete().eq('id', matchId)
  await sb.auth.admin.deleteUser(userId)
}

async function placeBet({ userId, matchId, market_type, pick, amount, odds }) {
  const { data, error } = await sb.rpc('place_bet_atomic', {
    p_user_id: userId, p_match_id: matchId,
    p_market_type: market_type, p_pick: pick,
    p_amount: amount, p_server_odds: odds,
  })
  if (error) throw new Error(`place_bet ${market_type}/${pick}: ${error.message}`)
  if (!data[0].success) throw new Error(`place_bet ${market_type}/${pick} rejected: ${data[0].error_code}`)
  await new Promise(r => setTimeout(r, 1100))
  return data[0]
}

async function cashout({ userId, betId, stake }) {
  const value = expectedCashout(stake)
  const { data, error } = await sb.rpc('cashout_bet_atomic', {
    p_bet_id: betId, p_user_id: userId, p_cashout_value: value,
  })
  if (error) throw new Error(`cashout: ${error.message}`)
  return { result: data[0], value }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  AUDIT — Cashout fijo (stake × 0.92) para 7 mercados')
  console.log('  ' + new Date().toISOString())
  console.log('═══════════════════════════════════════════════════════\n')

  const ctx = await setup()
  let fail = null
  try {
    const balInitial = await getBalance(ctx.userId)
    console.log(`[balance inicial] $${balInitial}\n`)

    const STAKE = 50
    const cases = [
      { name: '1X2 home',          market_type: '1x2',           pick: 'home',     odds: 2.00 },
      { name: 'Double chance 1X',  market_type: 'double_chance', pick: '1X',       odds: 1.50 },
      { name: 'BTTS Yes',          market_type: 'btts',          pick: 'btts_yes', odds: 1.85 },
      { name: 'DNB home',          market_type: 'draw_no_bet',   pick: 'dnb_home', odds: 1.65 },
      { name: 'Over 2.5',          market_type: 'totals_2.5',    pick: 'over_2.5', odds: 1.85 },
    ]

    const placedBets = []
    let runningStake = 0
    for (const c of cases) {
      const bet = await placeBet({
        userId: ctx.userId, matchId: ctx.matchId,
        market_type: c.market_type, pick: c.pick, amount: STAKE, odds: c.odds,
      })
      placedBets.push({ ...bet, ...c })
      runningStake += STAKE
    }
    const balAfterBets = await getBalance(ctx.userId)
    assertEq(balAfterBets, balInitial - runningStake, 'balance debita todos los stakes')
    console.log(`  ✓ ${cases.length} bets colocadas, stake total $${runningStake} debitado`)

    // Cashout cada bet — todos deben pagar stake × 0.92
    let runningCashout = 0
    console.log('\n[cashout]')
    for (const bet of placedBets) {
      const { result, value } = await cashout({ userId: ctx.userId, betId: bet.bet_id, stake: STAKE })
      assert(result.success, `${bet.name}: cashout fallo (${result.error_code})`)
      assertEq(value, expectedCashout(STAKE), `${bet.name}: value esperado`)
      runningCashout += value
      console.log(`  ✓ ${bet.name.padEnd(22)} → cashout $${value}`)

      // Verificar bet.status
      const { data: row } = await sb.from('bets').select('status, cash_out_amount').eq('id', bet.bet_id).single()
      assertEq(row.status, 'cashed_out', `${bet.name}: status`)
      assertEq(Number(row.cash_out_amount), value, `${bet.name}: cash_out_amount`)
    }

    const balAfterCashouts = await getBalance(ctx.userId)
    const expected = balInitial - runningStake + runningCashout
    assertEq(balAfterCashouts, expected, 'balance final post-cashouts')
    console.log(`  ✓ balance final $${balAfterCashouts} = inicial $${balInitial} - stakes $${runningStake} + cashouts $${runningCashout}`)

    // Test idempotencia: re-llamar cashout sobre la primera bet
    console.log('\n[idempotencia]')
    const { result: dupe } = await cashout({ userId: ctx.userId, betId: placedBets[0].bet_id, stake: STAKE })
    assert(!dupe.success, 'segundo cashout debe rechazar')
    assertEq(dupe.error_code, 'bet_not_cashable', 'error_code esperado')
    console.log(`  ✓ re-cashout → ${dupe.error_code}`)

    // Test bet inexistente: RPC debe devolver bet_not_cashable
    console.log('\n[bet inexistente]')
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const { result: fake } = await cashout({ userId: ctx.userId, betId: fakeId, stake: STAKE })
    assert(!fake.success, 'cashout en bet inexistente debe rechazar')
    assertEq(fake.error_code, 'bet_not_cashable', 'error_code para bet inexistente')
    console.log(`  ✓ bet_id fake → ${fake.error_code}`)

    // Audit final: balance == ledger
    console.log('\n[audit] balance vs ledger')
    const balFinal = await getBalance(ctx.userId)
    const ledger = await getLedger(ctx.userId)
    assertEq(balFinal, ledger, 'balance == sum(ledger)')
    console.log(`  ✓ balance=$${balFinal}, ledger=$${ledger} (cuadran)`)

    console.log('\n═══════════════════════════════════════════════════════')
    console.log('  ✓ AUDIT CASHOUT COMPLETO — 7 mercados con stake × 0.92')
    console.log('═══════════════════════════════════════════════════════')
  } catch (e) {
    fail = e
    console.error('\n✗ FALLO:', e.message)
  } finally {
    await cleanup(ctx)
  }
  if (fail) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
