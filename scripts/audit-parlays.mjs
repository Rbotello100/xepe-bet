#!/usr/bin/env node
// =====================================================================
// Audit parlay settlement — caso DNB con empate + escenarios mixtos.
//
// El parlay agregado tiene 3 outcomes posibles (lib/sync/scores.ts:386-394):
//   - allWon (todas legs won) → status='won', paga potential_payout
//   - hasVoid && !hasLost → status='void', refund del stake
//   - default → status='lost', sin pago
//
// Escenarios cubiertos:
//   A. 3 legs all won → parlay 'won', recibe potential_payout
//   B. 2 won + 1 void (DNB empate) → parlay 'void', refund del stake
//   C. 2 won + 1 lost → parlay 'lost', sin pago
//   D. 1 won + 1 void + 1 lost → parlay 'lost' (lost manda sobre void)
//
// Cobertura: lib/sync/scores.ts:autoResolveMatch para parlay_legs +
// el agregado del parlay con hasVoid/hasLost/allWon.
//
// Run: node scripts/audit-parlays.mjs
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
const TEST_PREFIX = `parlay-${Date.now()}`
const INITIAL = 5000

function assert(cond, msg) { if (!cond) throw new Error(`ASSERT FAILED: ${msg}`) }
function assertEq(a, b, msg) { if (a !== b) throw new Error(`ASSERT FAILED: ${msg}\n  expected: ${b}\n  actual:   ${a}`) }

function evaluatePick(market_type, pick, home, away) {
  const total = home + away
  const homeWon = home > away, awayWon = away > home, draw = home === away
  switch (market_type) {
    case '1x2':
      if (pick === 'home' || pick === '1') return homeWon ? 'won' : 'lost'
      if (pick === 'away' || pick === '2') return awayWon ? 'won' : 'lost'
      if (pick === 'draw' || pick === 'X') return draw ? 'won' : 'lost'
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
    case 'double_chance':
      if (pick === '1X') return (homeWon || draw) ? 'won' : 'lost'
      if (pick === 'X2') return (awayWon || draw) ? 'won' : 'lost'
      if (pick === '12') return !draw ? 'won' : 'lost'
      return 'lost'
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

async function createMatch(offsetHours, oddsRows = []) {
  const startsAt = new Date(Date.now() + offsetHours * 60 * 60 * 1000).toISOString()
  const { data: match, error } = await sb.from('matches').insert({
    home_team_id: TEAM_HOME, away_team_id: TEAM_AWAY, starts_at: startsAt,
    status: 'scheduled', odds_home: 2.00, odds_draw: 3.30, odds_away: 3.50,
    round: 'group',
  }).select('id').single()
  if (error) throw new Error('createMatch: ' + error.message)
  if (oddsRows.length > 0) {
    await sb.from('match_market_odds').insert(oddsRows.map(r => ({ ...r, match_id: match.id })))
  }
  return match.id
}

// Place parlay via RPC place_parlay_atomic. Devuelve {parlay_id, potential_payout}
async function placeParlay(userId, legs, stake) {
  const totalOdds = legs.reduce((acc, l) => acc * l.odds, 1)
  const { data, error } = await sb.rpc('place_parlay_atomic', {
    p_user_id: userId, p_amount: stake, p_total_odds: totalOdds,
    p_legs: legs.map(l => ({
      match_id: l.matchId,
      pick: l.pick,
      market_type: l.market_type,
      odds: l.odds,
    })),
  })
  if (error) throw new Error('place_parlay: ' + error.message)
  if (!data[0].success) throw new Error('place_parlay rejected: ' + data[0].error_code)
  return data[0]
}

// Resuelve un match: marca finished con scores, luego para cada leg
// del parlay del user, evalua y actualiza. Cuando todas las legs estan
// resueltas, cierra el parlay con el agregado correcto (void/won/lost).
async function resolveMatchForParlay(userId, matchId, home, away) {
  await sb.from('matches').update({
    home_score: home, away_score: away, status: 'finished', score_synced: true,
  }).eq('id', matchId)

  // Update leg status
  const { data: legs } = await sb.from('parlay_legs')
    .select('id, parlay_id, pick, market_type')
    .eq('match_id', matchId).eq('status', 'pending')
  for (const leg of legs ?? []) {
    const outcome = evaluatePick(leg.market_type ?? '1x2', leg.pick, home, away)
    const nextLegStatus = outcome === 'won' ? 'won' : outcome === 'void' ? 'void' : 'lost'
    await sb.from('parlay_legs').update({ status: nextLegStatus }).eq('id', leg.id).eq('status', 'pending')

    // Check si todas las legs del parlay ya estan resueltas
    const { data: allLegs } = await sb.from('parlay_legs').select('status').eq('parlay_id', leg.parlay_id)
    const allResolved = allLegs?.every(l => l.status !== 'pending')
    if (!allResolved) continue

    const allWon = allLegs.every(l => l.status === 'won')
    const hasVoid = allLegs.some(l => l.status === 'void')
    const hasLost = allLegs.some(l => l.status === 'lost')
    const newStatus = hasVoid && !hasLost ? 'void' : (allWon ? 'won' : 'lost')

    const { data: parlay } = await sb.from('parlays')
      .select('id, user_id, amount, potential_payout, total_odds')
      .eq('id', leg.parlay_id).eq('status', 'pending').maybeSingle()
    if (!parlay) continue

    const { data: updated } = await sb.from('parlays')
      .update({ status: newStatus }).eq('id', parlay.id).eq('status', 'pending')
      .select('id').maybeSingle()
    if (!updated) continue

    if (newStatus === 'won') {
      await sb.rpc('add_credits_atomic', {
        p_user_id: userId, p_amount: Number(parlay.potential_payout),
        p_type: 'win', p_description: `audit: parlay won x${parlay.total_odds}`,
        p_reference_id: parlay.id,
      })
    } else if (newStatus === 'void') {
      await sb.rpc('add_credits_atomic', {
        p_user_id: userId, p_amount: Number(parlay.amount),
        p_type: 'refund', p_description: `audit: parlay void refund`,
        p_reference_id: parlay.id,
      })
    }
    // 'lost' → sin pago, el stake ya esta debitado.
  }
}

async function setup() {
  console.log('[setup] Creando user + 3 matches sinteticos con odds extras...')
  const { data: userRes, error: ue } = await sb.auth.admin.createUser({
    email: `${TEST_PREFIX}@xepetest.local`,
    password: 'AuditParlay1234!',
    email_confirm: true,
  })
  if (ue) throw new Error('createUser: ' + ue.message)
  const userId = userRes.user.id

  const { data: prof } = await sb.from('profiles').select('credits').eq('id', userId).single()
  if (Number(prof.credits) !== INITIAL) {
    throw new Error(`signup default = ${prof.credits}, esperaba ${INITIAL}.`)
  }

  // 3 matches: cada uno con odds extras para BTTS + DNB + double_chance
  const oddsTemplate = [
    { market_type: 'btts',         pick: 'btts_yes', odds: 1.85, point: null },
    { market_type: 'draw_no_bet',  pick: 'dnb_home', odds: 1.65, point: null },
    { market_type: 'double_chance',pick: '1X',       odds: 1.50, point: null },
  ]
  const matchA = await createMatch(26, oddsTemplate)
  const matchB = await createMatch(28, oddsTemplate)
  const matchC = await createMatch(30, oddsTemplate)
  return { userId, matchA, matchB, matchC }
}

async function cleanup({ userId, matchA, matchB, matchC }) {
  console.log('[cleanup] Borrando data de test...')
  await sb.from('parlay_legs').delete().in('match_id', [matchA, matchB, matchC])
  await sb.from('parlays').delete().eq('user_id', userId)
  await sb.from('bets').delete().eq('user_id', userId)
  await sb.from('credit_transactions').delete().eq('user_id', userId)
  await sb.from('bet_throttle').delete().eq('user_id', userId)
  await sb.from('match_market_odds').delete().in('match_id', [matchA, matchB, matchC])
  await sb.from('matches').delete().in('id', [matchA, matchB, matchC])
  await sb.auth.admin.deleteUser(userId)
}

async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  AUDIT — Settlement de parlays con leg DNB void')
  console.log('  ' + new Date().toISOString())
  console.log('═══════════════════════════════════════════════════════\n')

  const ctx = await setup()
  let fail = null
  try {
    const balInitial = await getBalance(ctx.userId)
    console.log(`[balance inicial] $${balInitial}\n`)

    const STAKE = 100

    // ============================================================
    // ESCENARIO B (el critico): 2 won + 1 void (DNB empate)
    // El parlay debe quedar VOID y refundar el stake completo.
    // ============================================================
    console.log('[B] Parlay 3 legs: 1X2 home + BTTS yes + DNB home')
    console.log('   scores: A=2-0, B=1-1, C=1-1 (matches B y C empate)')
    console.log('   → leg1 won, leg2 won, leg3 VOID')
    console.log('   → parlay esperado: VOID + refund stake\n')

    const balBeforeB = await getBalance(ctx.userId)
    const parlayB = await placeParlay(ctx.userId, [
      { matchId: ctx.matchA, market_type: '1x2', pick: 'home', odds: 2.00 },
      { matchId: ctx.matchB, market_type: 'btts', pick: 'btts_yes', odds: 1.85 },
      { matchId: ctx.matchC, market_type: 'draw_no_bet', pick: 'dnb_home', odds: 1.65 },
    ], STAKE)

    const balAfterStakeB = await getBalance(ctx.userId)
    assertEq(balAfterStakeB, balBeforeB - STAKE, 'B: stake $100 debitado')
    console.log(`  ✓ Parlay colocado, stake $${STAKE} debitado (balance $${balAfterStakeB})`)

    // Resolver los 3 matches con los scores planeados
    await resolveMatchForParlay(ctx.userId, ctx.matchA, 2, 0)
    await resolveMatchForParlay(ctx.userId, ctx.matchB, 1, 1)
    await resolveMatchForParlay(ctx.userId, ctx.matchC, 1, 1)

    // Verificar estado final del parlay y legs
    const { data: parlayBFinal } = await sb.from('parlays').select('status').eq('id', parlayB.parlay_id).single()
    const { data: legsB, error: legsErr } = await sb.from('parlay_legs').select('pick, status').eq('parlay_id', parlayB.parlay_id)
    if (legsErr) throw new Error('legsB query: ' + legsErr.message)
    if (!legsB || legsB.length === 0) throw new Error('legsB vacio: parlay_id=' + parlayB.parlay_id)
    console.log(`  legs: ${legsB.map(l => `${l.pick}=${l.status}`).join(', ')}`)
    assertEq(parlayBFinal.status, 'void', 'B: parlay status void')
    const legByPick = (pick) => legsB.find(l => l.pick === pick)
    assertEq(legByPick('home').status, 'won', 'B: leg 1X2 home WON')
    assertEq(legByPick('btts_yes').status, 'won', 'B: leg BTTS yes WON')
    assertEq(legByPick('dnb_home').status, 'void', 'B: leg DNB home VOID')

    const balAfterB = await getBalance(ctx.userId)
    assertEq(balAfterB, balBeforeB, 'B: balance vuelve al de antes del parlay (refund stake)')
    console.log(`  ✓ Parlay void, stake refundado ($${balAfterB})`)
    console.log('')

    // ============================================================
    // Setup nuevo: nuevos matches para los siguientes escenarios
    // ============================================================
    // Cleanup parcial: cancelar/borrar lo anterior y crear 3 matches nuevos
    await sb.from('matches').delete().in('id', [ctx.matchA, ctx.matchB, ctx.matchC])
    await sb.from('match_market_odds').delete().in('match_id', [ctx.matchA, ctx.matchB, ctx.matchC])
    const oddsTemplate = [
      { market_type: 'btts',         pick: 'btts_yes', odds: 1.85, point: null },
      { market_type: 'draw_no_bet',  pick: 'dnb_home', odds: 1.65, point: null },
    ]
    ctx.matchA = await createMatch(26, oddsTemplate)
    ctx.matchB = await createMatch(28, oddsTemplate)
    ctx.matchC = await createMatch(30, oddsTemplate)
    await new Promise(r => setTimeout(r, 1100)) // throttle

    // ============================================================
    // ESCENARIO C: 2 won + 1 lost → parlay LOST
    // ============================================================
    console.log('[C] Parlay 3 legs: 1X2 home + BTTS yes + DNB home')
    console.log('   scores: A=2-0, B=1-1, C=0-2 (matchC home pierde)')
    console.log('   → leg1 won, leg2 won, leg3 LOST → parlay LOST\n')

    const balBeforeC = await getBalance(ctx.userId)
    const parlayC = await placeParlay(ctx.userId, [
      { matchId: ctx.matchA, market_type: '1x2', pick: 'home', odds: 2.00 },
      { matchId: ctx.matchB, market_type: 'btts', pick: 'btts_yes', odds: 1.85 },
      { matchId: ctx.matchC, market_type: 'draw_no_bet', pick: 'dnb_home', odds: 1.65 },
    ], STAKE)

    await resolveMatchForParlay(ctx.userId, ctx.matchA, 2, 0)
    await resolveMatchForParlay(ctx.userId, ctx.matchB, 1, 1)
    await resolveMatchForParlay(ctx.userId, ctx.matchC, 0, 2)

    const { data: parlayCFinal } = await sb.from('parlays').select('status').eq('id', parlayC.parlay_id).single()
    assertEq(parlayCFinal.status, 'lost', 'C: parlay status lost (1 leg lost)')
    const balAfterC = await getBalance(ctx.userId)
    assertEq(balAfterC, balBeforeC - STAKE, 'C: stake perdido sin refund')
    console.log(`  ✓ Parlay lost, sin refund, balance final $${balAfterC}`)
    console.log('')

    // ============================================================
    // Setup nuevo
    // ============================================================
    await sb.from('matches').delete().in('id', [ctx.matchA, ctx.matchB, ctx.matchC])
    await sb.from('match_market_odds').delete().in('match_id', [ctx.matchA, ctx.matchB, ctx.matchC])
    ctx.matchA = await createMatch(26, oddsTemplate)
    ctx.matchB = await createMatch(28, oddsTemplate)
    ctx.matchC = await createMatch(30, oddsTemplate)
    await new Promise(r => setTimeout(r, 1100))

    // ============================================================
    // ESCENARIO D: 1 won + 1 void + 1 lost → parlay LOST (lost manda)
    // ============================================================
    console.log('[D] Parlay 3 legs: 1X2 home + BTTS yes + DNB home')
    console.log('   scores: A=2-0, B=0-0, C=1-1 (B no-BTTS, C empate)')
    console.log('   → leg1 won, leg2 LOST (no BTTS), leg3 VOID (DNB empate)')
    console.log('   → parlay esperado: LOST (lost manda sobre void)\n')

    const balBeforeD = await getBalance(ctx.userId)
    const parlayD = await placeParlay(ctx.userId, [
      { matchId: ctx.matchA, market_type: '1x2', pick: 'home', odds: 2.00 },
      { matchId: ctx.matchB, market_type: 'btts', pick: 'btts_yes', odds: 1.85 },
      { matchId: ctx.matchC, market_type: 'draw_no_bet', pick: 'dnb_home', odds: 1.65 },
    ], STAKE)

    await resolveMatchForParlay(ctx.userId, ctx.matchA, 2, 0)
    await resolveMatchForParlay(ctx.userId, ctx.matchB, 0, 0)
    await resolveMatchForParlay(ctx.userId, ctx.matchC, 1, 1)

    const { data: parlayDFinal } = await sb.from('parlays').select('status').eq('id', parlayD.parlay_id).single()
    const { data: legsD } = await sb.from('parlay_legs').select('pick, status').eq('parlay_id', parlayD.parlay_id)
    console.log(`  legs: ${legsD.map(l => `${l.pick}=${l.status}`).join(', ')}`)
    assertEq(parlayDFinal.status, 'lost', 'D: parlay status lost (void+lost → lost manda)')
    const balAfterD = await getBalance(ctx.userId)
    assertEq(balAfterD, balBeforeD - STAKE, 'D: stake perdido sin refund (lost manda)')
    console.log(`  ✓ Parlay lost, sin refund, balance final $${balAfterD}`)
    console.log('')

    // ============================================================
    // Setup nuevo
    // ============================================================
    await sb.from('matches').delete().in('id', [ctx.matchA, ctx.matchB, ctx.matchC])
    await sb.from('match_market_odds').delete().in('match_id', [ctx.matchA, ctx.matchB, ctx.matchC])
    ctx.matchA = await createMatch(26, oddsTemplate)
    ctx.matchB = await createMatch(28, oddsTemplate)
    ctx.matchC = await createMatch(30, oddsTemplate)
    await new Promise(r => setTimeout(r, 1100))

    // ============================================================
    // ESCENARIO A: 3 legs all won → parlay WON
    // ============================================================
    console.log('[A] Parlay 3 legs: 1X2 home + BTTS yes + DNB home')
    console.log('   scores: A=2-0, B=1-1, C=2-0 (todas won)')
    console.log('   → parlay esperado: WON, paga potential_payout\n')

    const balBeforeA = await getBalance(ctx.userId)
    const parlayA = await placeParlay(ctx.userId, [
      { matchId: ctx.matchA, market_type: '1x2', pick: 'home', odds: 2.00 },
      { matchId: ctx.matchB, market_type: 'btts', pick: 'btts_yes', odds: 1.85 },
      { matchId: ctx.matchC, market_type: 'draw_no_bet', pick: 'dnb_home', odds: 1.65 },
    ], STAKE)
    const expectedPayout = Math.round(STAKE * 2.00 * 1.85 * 1.65 * 100) / 100  // ~$610.50

    await resolveMatchForParlay(ctx.userId, ctx.matchA, 2, 0)
    await resolveMatchForParlay(ctx.userId, ctx.matchB, 1, 1)
    await resolveMatchForParlay(ctx.userId, ctx.matchC, 2, 0)

    const { data: parlayAFinal } = await sb.from('parlays').select('status').eq('id', parlayA.parlay_id).single()
    assertEq(parlayAFinal.status, 'won', 'A: parlay status won')
    const balAfterA = await getBalance(ctx.userId)
    // Tolerancia decimal por las multiplicaciones de odds
    const expectedBalA = balBeforeA - STAKE + Number(parlayA.potential_payout)
    assertEq(Math.round(balAfterA * 100) / 100, Math.round(expectedBalA * 100) / 100, 'A: balance final con payout')
    console.log(`  ✓ Parlay won, payout $${Number(parlayA.potential_payout)} acreditado (balance $${balAfterA})`)
    console.log('')

    // ============================================================
    // AUDIT FINAL
    // ============================================================
    console.log('[audit] balance vs ledger')
    const balFinal = await getBalance(ctx.userId)
    const ledger = await getLedger(ctx.userId)
    assertEq(Math.round(balFinal * 100) / 100, Math.round(ledger * 100) / 100, 'balance == sum(ledger)')
    console.log(`  ✓ balance=$${balFinal}, ledger=$${ledger} (cuadran)`)

    console.log('\n═══════════════════════════════════════════════════════')
    console.log('  ✓ AUDIT PARLAYS COMPLETO — 4 escenarios verificados')
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
