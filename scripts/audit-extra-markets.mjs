#!/usr/bin/env node
// =====================================================================
// Audit settlement de los 7 mercados nuevos sin tocar data real.
// Crea user + matches sinteticos, coloca bets via RPC, simula scores,
// verifica que cada outcome sea el esperado y que ledger == balance.
//
// Run: node scripts/audit-extra-markets.mjs
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

const TEAM_HOME = '04d4c3b9-ccfc-4147-badc-29430d4eb4eb'  // Mexico
const TEAM_AWAY = 'b188ff20-c37a-4d4b-8c73-5e16972f006f'  // South Africa
const TEST_PREFIX = `audit-${Date.now()}`
const INITIAL = 5000  // signup default

function assert(cond, msg) { if (!cond) throw new Error(`ASSERT FAILED: ${msg}`) }
function assertEq(a, b, msg) { if (a !== b) throw new Error(`ASSERT FAILED: ${msg}\n  expected: ${b}\n  actual:   ${a}`) }

function evaluatePick(market_type, pick, home, away) {
  const total = home + away
  const homeWon = home > away, awayWon = away > home, draw = home === away
  switch (market_type) {
    case '1x2':
      if (pick === 'home') return homeWon ? 'won' : 'lost'
      if (pick === 'away') return awayWon ? 'won' : 'lost'
      if (pick === 'draw') return draw ? 'won' : 'lost'
      return 'lost'
    case 'double_chance':
      if (pick === '1X') return (homeWon || draw) ? 'won' : 'lost'
      if (pick === 'X2') return (awayWon || draw) ? 'won' : 'lost'
      if (pick === '12') return !draw ? 'won' : 'lost'
      return 'lost'
    case 'btts': {
      const bs = home > 0 && away > 0
      if (pick === 'btts_yes') return bs ? 'won' : 'lost'
      if (pick === 'btts_no') return !bs ? 'won' : 'lost'
      return 'lost'
    }
    case 'draw_no_bet':
      if (draw) return 'void'
      if (pick === 'dnb_home') return homeWon ? 'won' : 'lost'
      if (pick === 'dnb_away') return awayWon ? 'won' : 'lost'
      return 'lost'
    case 'totals_1.5': case 'totals_2.5': case 'totals_3.5': {
      const t = Number(market_type.split('_')[1])
      const overWon = total > t
      if (pick.startsWith('over_')) return Number(pick.split('_')[1]) === t && overWon ? 'won' : 'lost'
      if (pick.startsWith('under_')) return Number(pick.split('_')[1]) === t && !overWon ? 'won' : 'lost'
      return 'lost'
    }
  }
  return 'lost'
}

async function getBalance(userId) {
  const { data } = await sb.from('profiles').select('credits').eq('id', userId).single()
  return Number(data?.credits ?? 0)
}
async function getLedger(userId) {
  const { data } = await sb.from('credit_transactions').select('amount').eq('user_id', userId)
  return (data ?? []).reduce((acc, t) => acc + Number(t.amount), 0)
}

async function setup() {
  console.log('[setup] Creando user + 2 matches sinteticos...')
  const { data: userRes, error: ue } = await sb.auth.admin.createUser({
    email: `${TEST_PREFIX}@xepetest.local`,
    password: 'AuditExtra1234!',
    email_confirm: true,
  })
  if (ue) throw new Error('createUser: ' + ue.message)
  const userId = userRes.user.id
  // Asumimos que el signup trigger ya dio INITIAL creditos. Si no, falla el
  // assert de balance.
  const { data: prof } = await sb.from('profiles').select('credits').eq('id', userId).single()
  if (Number(prof.credits) !== INITIAL) {
    throw new Error(`signup default = ${prof.credits}, esperaba ${INITIAL}. Ajustar INITIAL en el script.`)
  }

  const futureA = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString()
  const futureB = new Date(Date.now() + 28 * 60 * 60 * 1000).toISOString()

  const { data: matchA, error: ma } = await sb.from('matches').insert({
    home_team_id: TEAM_HOME, away_team_id: TEAM_AWAY, starts_at: futureA,
    status: 'scheduled', odds_home: 2.00, odds_draw: 3.30, odds_away: 3.50,
    round: 'group',
  }).select('id').single()
  if (ma) throw new Error('match A: ' + ma.message)

  const { data: matchB, error: mb } = await sb.from('matches').insert({
    home_team_id: TEAM_HOME, away_team_id: TEAM_AWAY, starts_at: futureB,
    status: 'scheduled', odds_home: 2.50, odds_draw: 3.10, odds_away: 2.80,
    round: 'group',
  }).select('id').single()
  if (mb) throw new Error('match B: ' + mb.message)

  // Inyectar odds para los mercados extra en match A (escenario score 2-1)
  const oddsA = [
    { market_type: 'double_chance', pick: '1X',       odds: 1.50, point: null },
    { market_type: 'btts',          pick: 'btts_yes', odds: 1.85, point: null },
    { market_type: 'btts',          pick: 'btts_no',  odds: 1.95, point: null },
    { market_type: 'draw_no_bet',   pick: 'dnb_home', odds: 1.65, point: null },
    { market_type: 'totals_1.5',    pick: 'over_1.5', odds: 1.30, point: 1.5 },
    { market_type: 'totals_2.5',    pick: 'over_2.5', odds: 1.85, point: 2.5 },
    { market_type: 'totals_3.5',    pick: 'over_3.5', odds: 2.40, point: 3.5 },
  ].map(r => ({ ...r, match_id: matchA.id }))
  await sb.from('match_market_odds').insert(oddsA)

  // Match B: odds DNB para escenario empate (void)
  await sb.from('match_market_odds').insert([
    { match_id: matchB.id, market_type: 'draw_no_bet', pick: 'dnb_home', odds: 1.70, point: null },
  ])

  return { userId, matchAId: matchA.id, matchBId: matchB.id }
}

async function cleanup({ userId, matchAId, matchBId }) {
  console.log('[cleanup] Borrando data de test...')
  await sb.from('parlay_legs').delete().in('match_id', [matchAId, matchBId])
  await sb.from('parlays').delete().eq('user_id', userId)
  await sb.from('bets').delete().eq('user_id', userId)
  await sb.from('credit_transactions').delete().eq('user_id', userId)
  await sb.from('bet_throttle').delete().eq('user_id', userId)
  await sb.from('match_market_odds').delete().in('match_id', [matchAId, matchBId])
  await sb.from('matches').delete().in('id', [matchAId, matchBId])
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
  // bet_throttle bloquea bets dentro de 1s — esperar
  await new Promise(r => setTimeout(r, 1100))
  return data[0]
}

// Replica autoResolveMatch — actualiza bet status + paga via add_credits_atomic
async function resolveBet(userId, bet, market_type, pick, homeScore, awayScore) {
  const outcome = evaluatePick(market_type, pick, homeScore, awayScore)
  const nextStatus = outcome === 'won' ? 'won' : outcome === 'void' ? 'cancelled' : 'lost'
  await sb.from('bets').update({ status: nextStatus, resolved_at: new Date().toISOString() })
    .eq('id', bet.bet_id).eq('status', 'pending')

  if (outcome === 'won') {
    const { data, error } = await sb.rpc('add_credits_atomic', {
      p_user_id: userId, p_amount: Number(bet.potential_payout),
      p_type: 'win', p_description: `audit win ${market_type}/${pick}`,
      p_reference_id: bet.bet_id,
    })
    if (error) throw new Error('add_credits win: ' + error.message)
    if (!data[0].success) throw new Error('add_credits win rejected: ' + data[0].error_code)
  } else if (outcome === 'void') {
    // refund stake — necesitamos el stake. Lo leemos de bets.
    const { data: betRow } = await sb.from('bets').select('amount').eq('id', bet.bet_id).single()
    const { error } = await sb.rpc('add_credits_atomic', {
      p_user_id: userId, p_amount: Number(betRow.amount),
      p_type: 'refund', p_description: `audit void ${market_type}/${pick}`,
      p_reference_id: bet.bet_id,
    })
    if (error) throw new Error('add_credits void: ' + error.message)
  }
  return outcome
}

async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  AUDIT — Settlement de 7 mercados extra')
  console.log('  ' + new Date().toISOString())
  console.log('═══════════════════════════════════════════════════════\n')

  const ctx = await setup()
  let fail = null
  try {
    const STAKE = 50

    // --- Escenario A: score 2-1 (home wins, both score, total 3)
    console.log('[A] Coloco 7 bets en match A (score esperado: 2-1)...')
    const bets = []
    bets.push({ ...await placeBet({ userId: ctx.userId, matchId: ctx.matchAId, market_type: '1x2', pick: 'home', amount: STAKE, odds: 2.00 }), market_type: '1x2', pick: 'home' })
    bets.push({ ...await placeBet({ userId: ctx.userId, matchId: ctx.matchAId, market_type: 'double_chance', pick: '1X', amount: STAKE, odds: 1.50 }), market_type: 'double_chance', pick: '1X' })
    bets.push({ ...await placeBet({ userId: ctx.userId, matchId: ctx.matchAId, market_type: 'btts', pick: 'btts_yes', amount: STAKE, odds: 1.85 }), market_type: 'btts', pick: 'btts_yes' })
    bets.push({ ...await placeBet({ userId: ctx.userId, matchId: ctx.matchAId, market_type: 'draw_no_bet', pick: 'dnb_home', amount: STAKE, odds: 1.65 }), market_type: 'draw_no_bet', pick: 'dnb_home' })
    bets.push({ ...await placeBet({ userId: ctx.userId, matchId: ctx.matchAId, market_type: 'totals_1.5', pick: 'over_1.5', amount: STAKE, odds: 1.30 }), market_type: 'totals_1.5', pick: 'over_1.5' })
    bets.push({ ...await placeBet({ userId: ctx.userId, matchId: ctx.matchAId, market_type: 'totals_2.5', pick: 'over_2.5', amount: STAKE, odds: 1.85 }), market_type: 'totals_2.5', pick: 'over_2.5' })
    bets.push({ ...await placeBet({ userId: ctx.userId, matchId: ctx.matchAId, market_type: 'totals_3.5', pick: 'over_3.5', amount: STAKE, odds: 2.40 }), market_type: 'totals_3.5', pick: 'over_3.5' })

    const balAfterBets = await getBalance(ctx.userId)
    assertEq(balAfterBets, INITIAL - STAKE * 7, 'balance debe debitar 7 stakes')
    console.log(`  ✓ 7 bets colocadas, stake total debitado ($${STAKE * 7})`)

    // Resolver: marcar match finished y aplicar evaluatePick a cada bet
    await sb.from('matches').update({
      home_score: 2, away_score: 1, status: 'finished', score_synced: true,
    }).eq('id', ctx.matchAId)

    const expectedOutcomes = {
      '1x2/home':              'won',
      'double_chance/1X':      'won',
      'btts/btts_yes':         'won',
      'draw_no_bet/dnb_home':  'won',
      'totals_1.5/over_1.5':   'won',
      'totals_2.5/over_2.5':   'won',
      'totals_3.5/over_3.5':   'lost',
    }
    let expectedPayout = 0
    for (const bet of bets) {
      const outcome = await resolveBet(ctx.userId, bet, bet.market_type, bet.pick, 2, 1)
      const key = `${bet.market_type}/${bet.pick}`
      assertEq(outcome, expectedOutcomes[key], `outcome ${key}`)
      if (outcome === 'won') expectedPayout += Number(bet.potential_payout)
      console.log(`  ${outcome === 'won' ? '✓' : '✗'} ${key.padEnd(28)} → ${outcome.padEnd(6)} (payout esperado ${outcome === 'won' ? `+$${Number(bet.potential_payout)}` : '$0'})`)
    }

    const balFinalA = await getBalance(ctx.userId)
    const expectedBalA = INITIAL - STAKE * 7 + expectedPayout
    assertEq(balFinalA, expectedBalA, 'balance final escenario A')
    console.log(`  ✓ balance final = $${balFinalA} (esperado $${expectedBalA})`)

    // --- Escenario B: DNB con empate 1-1 → void + refund
    console.log('\n[B] Coloco 1 bet DNB en match B (score esperado: 1-1 = void)...')
    const balBeforeB = await getBalance(ctx.userId)
    const dnbBet = await placeBet({
      userId: ctx.userId, matchId: ctx.matchBId,
      market_type: 'draw_no_bet', pick: 'dnb_home', amount: STAKE, odds: 1.70,
    })

    const balAfterStakeB = await getBalance(ctx.userId)
    assertEq(balAfterStakeB, balBeforeB - STAKE, 'B: stake debitado')

    await sb.from('matches').update({
      home_score: 1, away_score: 1, status: 'finished', score_synced: true,
    }).eq('id', ctx.matchBId)

    const outcomeB = await resolveBet(ctx.userId, { ...dnbBet, market_type: 'draw_no_bet', pick: 'dnb_home' }, 'draw_no_bet', 'dnb_home', 1, 1)
    assertEq(outcomeB, 'void', 'DNB empate debe ser void')

    const balAfterB = await getBalance(ctx.userId)
    assertEq(balAfterB, balBeforeB, 'B: stake refunded (balance vuelve al de antes de la bet)')
    console.log(`  ✓ DNB con empate → void + refund. Balance volvio a $${balBeforeB}`)

    // --- Audit final: ledger == balance
    const ledger = await getLedger(ctx.userId)
    const balance = await getBalance(ctx.userId)
    const expectedLedger = balance - INITIAL  // INITIAL son los signup credits, no estan en ledger del flujo de bets
    // En realidad el INITIAL viene del trigger handle_new_user, hay 1 row en ledger con +500 o +1000
    // Mejor: ledger debe ser = balance final menos el initial implicito del trigger? Vamos a checkear ambos.
    console.log(`\n[audit] balance=$${balance}, ledger_sum=$${ledger}`)
    // Sumamos initial_signup que es el row del trigger
    const { data: txs } = await sb.from('credit_transactions').select('type, amount').eq('user_id', ctx.userId)
    const signupTx = txs.find(t => t.type === 'initial' || t.type === 'signup' || t.type === 'initial_credits')
    const signupAmount = signupTx ? Number(signupTx.amount) : 0
    console.log(`  ledger detalle (${txs.length} txs): ${txs.map(t => `${t.type}:${t.amount}`).join(', ')}`)
    // El balance debe ser igual al ledger total (incluyendo el initial). Si no, hay drift.
    assertEq(balance, ledger, 'balance debe coincidir con sum(ledger)')
    console.log('  ✓ balance == ledger (cuadra)')

    console.log('\n═══════════════════════════════════════════════════════')
    console.log('  ✓ AUDIT COMPLETO — 7 mercados liquidan correcto')
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
