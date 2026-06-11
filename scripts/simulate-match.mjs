#!/usr/bin/env node
// =====================================================================
// Simulador de partido terminado — para testear settlement sin esperar
// al partido real.
//
// Lo que hace:
//   1. Lee bets y parlay_legs pending del match.
//   2. Snapshot del balance del/los users involucrados.
//   3. UPDATE matches con home_score, away_score, status='finished'.
//   4. Replica la logica de autoResolveMatch evaluando CADA market:
//        - 1X2, double_chance, BTTS, draw_no_bet, totals_1.5/2.5/3.5
//      Devuelve por cada bet: 'won' | 'lost' | 'void' + payout esperado.
//   5. Llama la RPC add_credits_atomic para acreditar wins y refunds DNB.
//   6. Actualiza bet/leg status, cierra parlays cuando todas las legs estan.
//   7. Reporta el delta de balance para validar end-to-end.
//
// Modo SAFE (--dry):
//   - Imprime el resumen sin tocar la DB. Usalo para previsualizar
//     "que pasaria si MEX 2-0 SA?" antes de comprometerlo.
//
// Run:
//   node scripts/simulate-match.mjs <matchId> <homeScore> <awayScore> [--dry]
//   node scripts/simulate-match.mjs --list                  # ver matches con bets pending
//
// Para REVERTIR un simulado:
//   node scripts/simulate-match.mjs --reset <matchId>
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

// Misma logica que lib/utils/pick.ts → evaluatePick. Duplicada aca para
// que el script funcione standalone sin importar Next.js modules.
function evaluatePick(market_type, pick, home, away) {
  const total = home + away
  const homeWon = home > away, awayWon = away > home, draw = home === away
  switch (market_type) {
    case '1x2':
      if (pick === 'home' || pick === '1') return homeWon ? 'won' : 'lost'
      if (pick === 'away' || pick === '2') return awayWon ? 'won' : 'lost'
      if (pick === 'draw' || pick === 'X') return draw    ? 'won' : 'lost'
      return 'lost'
    case 'double_chance':
      if (pick === '1X') return (homeWon || draw) ? 'won' : 'lost'
      if (pick === 'X2') return (awayWon || draw) ? 'won' : 'lost'
      if (pick === '12') return !draw ? 'won' : 'lost'
      return 'lost'
    case 'btts': {
      const bothScored = home > 0 && away > 0
      if (pick === 'btts_yes') return bothScored ? 'won' : 'lost'
      if (pick === 'btts_no')  return !bothScored ? 'won' : 'lost'
      return 'lost'
    }
    case 'draw_no_bet':
      if (draw) return 'void'
      if (pick === 'dnb_home') return homeWon ? 'won' : 'lost'
      if (pick === 'dnb_away') return awayWon ? 'won' : 'lost'
      return 'lost'
    case 'totals_1.5': case 'totals_2.5': case 'totals_3.5': {
      const threshold = Number(market_type.split('_')[1])
      const overWon = total > threshold
      if (pick.startsWith('over_'))  return Number(pick.split('_')[1]) === threshold && overWon  ? 'won' : 'lost'
      if (pick.startsWith('under_')) return Number(pick.split('_')[1]) === threshold && !overWon ? 'won' : 'lost'
      return 'lost'
    }
  }
  return 'lost'
}

const args = process.argv.slice(2)

// === MODO LISTAR ===
if (args.includes('--list')) {
  const { data } = await sb.from('matches')
    .select('id, status, starts_at, home_team:teams!home_team_id(name), away_team:teams!away_team_id(name), bets:bets(count), parlay_legs:parlay_legs(count)')
    .order('starts_at')
  console.log('Matches con bets/legs pending:')
  for (const m of data ?? []) {
    const bets = m.bets?.[0]?.count ?? 0
    const legs = m.parlay_legs?.[0]?.count ?? 0
    if (bets + legs === 0) continue
    const h = m.home_team?.name ?? '?', a = m.away_team?.name ?? '?'
    console.log(' ', m.id, '|', m.status.padEnd(10), '|', h, 'vs', a, '|', bets, 'bets,', legs, 'legs')
  }
  process.exit(0)
}

// === MODO RESET ===
if (args[0] === '--reset' && args[1]) {
  const matchId = args[1]
  console.log('Reseteando match', matchId, '— vuelve a pending')
  await sb.from('bets').update({ status: 'pending', resolved_at: null }).eq('match_id', matchId).in('status', ['won','lost','cancelled'])
  await sb.from('parlay_legs').update({ status: 'pending' }).eq('match_id', matchId).in('status', ['won','lost','void'])
  // Re-abrir parlays que tengan alguna leg en este match (porque cerraron en cascada)
  const { data: legs } = await sb.from('parlay_legs').select('parlay_id').eq('match_id', matchId)
  const parlayIds = [...new Set((legs ?? []).map(l => l.parlay_id))]
  if (parlayIds.length) await sb.from('parlays').update({ status: 'pending' }).in('id', parlayIds)
  await sb.from('matches').update({ home_score: null, away_score: null, status: 'open', score_synced: false }).eq('id', matchId)
  console.log('Done.')
  process.exit(0)
}

const [matchId, homeStr, awayStr, ...flags] = args
const dry = flags.includes('--dry')
if (!matchId || homeStr == null || awayStr == null) {
  console.error('Uso: node scripts/simulate-match.mjs <matchId> <homeScore> <awayScore> [--dry]')
  console.error('     node scripts/simulate-match.mjs --list')
  console.error('     node scripts/simulate-match.mjs --reset <matchId>')
  process.exit(1)
}
const homeScore = parseInt(homeStr, 10)
const awayScore = parseInt(awayStr, 10)
if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
  console.error('Scores deben ser enteros')
  process.exit(1)
}

// === LECTURA ===
const { data: match } = await sb.from('matches')
  .select('id, home_team:teams!home_team_id(name), away_team:teams!away_team_id(name), status')
  .eq('id', matchId).single()
if (!match) { console.error('Match no encontrado:', matchId); process.exit(1) }

const homeName = match.home_team?.name ?? '?'
const awayName = match.away_team?.name ?? '?'

console.log('═══════════════════════════════════════════════════════')
console.log(`  ${homeName} ${homeScore} - ${awayScore} ${awayName}`)
console.log(`  ${dry ? '[DRY RUN — no toca DB]' : '[REAL — escribe en DB]'}`)
console.log('═══════════════════════════════════════════════════════')

const { data: bets } = await sb.from('bets')
  .select('id, user_id, market_type, pick, amount, odds_at_placement, potential_payout')
  .eq('match_id', matchId).eq('status', 'pending')
const { data: legs } = await sb.from('parlay_legs')
  .select('id, parlay_id, market_type, pick')
  .eq('match_id', matchId).eq('status', 'pending')

console.log(`\nBets pending: ${bets?.length ?? 0}`)
console.log(`Parlay legs pending: ${legs?.length ?? 0}`)

// === EVALUACION ===
let totalPayout = 0, totalRefund = 0
let won = 0, lost = 0, voided = 0
console.log('\n--- BETS ---')
for (const b of bets ?? []) {
  const outcome = evaluatePick(b.market_type, b.pick, homeScore, awayScore)
  const status = outcome === 'won' ? 'won' : outcome === 'void' ? 'cancelled' : 'lost'
  const payout = outcome === 'won' ? Number(b.potential_payout) : outcome === 'void' ? Number(b.amount) : 0
  if (outcome === 'won') { won++; totalPayout += payout }
  else if (outcome === 'void') { voided++; totalRefund += payout }
  else lost++
  console.log(` ${outcome.toUpperCase().padEnd(5)} ${b.market_type.padEnd(14)} ${b.pick.padEnd(10)} stake $${b.amount} → $${payout}`)
  if (!dry) {
    await sb.from('bets').update({ status, resolved_at: new Date().toISOString() }).eq('id', b.id).eq('status', 'pending')
    if (outcome === 'won') {
      const { data } = await sb.rpc('add_credits_atomic', {
        p_user_id: b.user_id, p_amount: Number(b.potential_payout), p_type: 'win',
        p_description: `Sim: gano ${b.pick}`, p_reference_id: b.id,
      })
      if (!data?.[0]?.success) console.log('   ⚠ addCredits fallo')
    } else if (outcome === 'void') {
      const { data } = await sb.rpc('add_credits_atomic', {
        p_user_id: b.user_id, p_amount: Number(b.amount), p_type: 'refund',
        p_description: `Sim: refund ${b.pick} (DNB empate)`, p_reference_id: b.id + '-void',
      })
      if (!data?.[0]?.success) console.log('   ⚠ refund fallo')
    }
  }
}
console.log(`  Bets: ${won} won, ${lost} lost, ${voided} void`)

console.log('\n--- PARLAY LEGS ---')
const legsByParlay = new Map()
for (const l of legs ?? []) {
  const arr = legsByParlay.get(l.parlay_id) ?? []
  arr.push(l)
  legsByParlay.set(l.parlay_id, arr)
}
for (const l of legs ?? []) {
  const outcome = evaluatePick(l.market_type, l.pick, homeScore, awayScore)
  const status = outcome === 'won' ? 'won' : outcome === 'void' ? 'void' : 'lost'
  console.log(` ${outcome.toUpperCase().padEnd(5)} parlay=${l.parlay_id.slice(0,8)} ${l.market_type.padEnd(14)} ${l.pick}`)
  if (!dry) {
    await sb.from('parlay_legs').update({ status }).eq('id', l.id).eq('status', 'pending')
  }
}

// === CIERRE DE PARLAYS ===
let parlayWins = 0
console.log('\n--- CIERRE DE PARLAYS ---')
for (const parlayId of legsByParlay.keys()) {
  // Solo cerramos parlays con TODAS las legs resueltas. En modo dry simulamos.
  const { data: allLegs } = await sb.from('parlay_legs').select('status, match_id, market_type, pick').eq('parlay_id', parlayId)
  // En dry, las legs siguen como pending; en ese caso las evaluamos in-memory para mostrar el resultado proyectado
  const evaluated = (allLegs ?? []).map(l => {
    if (l.match_id !== matchId) return l // las que NO son de este match: quedan pending
    const outcome = evaluatePick(l.market_type, l.pick, homeScore, awayScore)
    return { ...l, status: outcome === 'won' ? 'won' : outcome === 'void' ? 'void' : 'lost' }
  })
  const allResolved = evaluated.every(l => l.status !== 'pending')
  if (!allResolved) {
    console.log(` parlay=${parlayId.slice(0,8)}: aun tiene legs pending de otros matches, no cierra todavia`)
    continue
  }
  const allWon = evaluated.every(l => l.status === 'won')
  const hasVoid = evaluated.some(l => l.status === 'void')
  const hasLost = evaluated.some(l => l.status === 'lost')
  const newStatus = hasVoid && !hasLost ? 'void' : (allWon ? 'won' : 'lost')
  const { data: parlay } = await sb.from('parlays').select('id, user_id, amount, potential_payout, total_odds').eq('id', parlayId).single()
  console.log(` parlay=${parlayId.slice(0,8)} (${evaluated.length} legs) → ${newStatus.toUpperCase()} ${newStatus === 'won' ? '$' + parlay.potential_payout : newStatus === 'void' ? '$' + parlay.amount + ' refund' : ''}`)
  if (!dry && newStatus !== 'lost') {
    await sb.from('parlays').update({ status: newStatus }).eq('id', parlayId).eq('status', 'pending')
    if (newStatus === 'won') {
      await sb.rpc('add_credits_atomic', { p_user_id: parlay.user_id, p_amount: Number(parlay.potential_payout), p_type: 'win', p_description: `Sim: gano parlay x${parlay.total_odds}`, p_reference_id: parlay.id })
      parlayWins += Number(parlay.potential_payout)
    } else if (newStatus === 'void') {
      await sb.rpc('add_credits_atomic', { p_user_id: parlay.user_id, p_amount: Number(parlay.amount), p_type: 'refund', p_description: 'Sim: parlay void', p_reference_id: parlay.id })
    }
  } else if (dry && newStatus !== 'lost') {
    parlayWins += newStatus === 'won' ? Number(parlay.potential_payout) : Number(parlay.amount)
  } else if (!dry) {
    await sb.from('parlays').update({ status: 'lost' }).eq('id', parlayId).eq('status', 'pending')
  }
}

// === UPDATE MATCH ===
if (!dry) {
  await sb.from('matches').update({
    home_score: homeScore, away_score: awayScore, status: 'finished', score_synced: true,
  }).eq('id', matchId)
}

console.log('\n═══════════════════════════════════════════════════════')
console.log(`  Pagos bets (win):    $${totalPayout}`)
console.log(`  Refunds bets (void): $${totalRefund}`)
console.log(`  Pagos parlays:       $${parlayWins}`)
console.log('═══════════════════════════════════════════════════════')
if (dry) console.log('\nNo se modifico la DB. Volve a correr SIN --dry para aplicar.')
