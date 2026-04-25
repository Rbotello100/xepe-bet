'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { deductCredits, addCredits } from '@/lib/credits'
import { MIN_BET, MAX_BET } from '@/lib/constants'
import {
  FELIPE_ROOMS,
  FELIPE_CHIPS,
  getRoomById,
  getRoomMultiplier,
  pickWinningRoomServer,
} from './felipe-config'

async function getAuthUser() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

function db() { return createAdminClient() }

async function canPlayToday(userId: string, gameType: string): Promise<boolean> {
  const admin = db()
  const today = new Date().toISOString().split('T')[0]
  const { count } = await admin
    .from('activity_feed')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action_type', 'achievement')
    .gte('created_at', `${today}T00:00:00`)
    .lte('created_at', `${today}T23:59:59`)
    .like('description', `%${gameType}%`)
  return (count ?? 0) === 0
}

/**
 * Inserta un row en casino_sessions para tracking de PnL.
 * Llamado al cierre de cada partida (incluso si win=0).
 */
async function recordCasinoSession(
  userId: string,
  game: 'slots' | 'penalty' | 'scratch' | 'mines',
  betAmount: number,
  winAmount: number,
  metadata?: Record<string, unknown>
) {
  const admin = db()
  await admin.from('casino_sessions').insert({
    user_id: userId,
    game,
    bet_amount: betAmount,
    win_amount: winAmount,
    metadata: metadata ?? null,
  }).then(() => {}, () => {})
}

// ==========================================================
// SLOTS 3×3 — 3 paylines (RTP ~88%)
// Costo fijo por giro ($10). Los payouts son fijos tambien — a mejor simbolo
// mayor premio pero menor probabilidad (definida por WEIGHTS).
// ==========================================================
const SLOTS_COST = 10
const SYMBOLS = ['s1', 's2', 's3', 's4', 's5', 's6']
const WEIGHTS = [4, 8, 14, 24, 30, 20]

const PAYOUTS: Record<string, number> = {
  s1: 8000, s2: 1500, s3: 300, s4: 70, s5: 18, s6: 10,
}

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
]

function spinCell(): string {
  const rand = Math.random() * 100
  let cumulative = 0
  for (let i = 0; i < SYMBOLS.length; i++) {
    cumulative += WEIGHTS[i]
    if (rand < cumulative) return SYMBOLS[i]
  }
  return 's5'
}

function checkWinLines(grid: string[]): { winLine: number[]; symbol: string; payout: number } | null {
  let best: { winLine: number[]; symbol: string; payout: number } | null = null
  for (const line of WIN_LINES) {
    const [a, b, c] = line
    if (grid[a] === grid[b] && grid[b] === grid[c]) {
      const sym = grid[a]
      const payout = PAYOUTS[sym] ?? 0
      if (!best || payout > best.payout) {
        best = { winLine: line, symbol: sym, payout }
      }
    }
  }
  return best
}

export async function playSlots() {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }

  const free = await canPlayToday(user.id, 'slots')
  const cost = free ? 0 : SLOTS_COST

  if (cost > 0) {
    const result = await deductCredits(user.id, cost, 'casino_bet', `Slots giro $${cost}`)
    if (!result.success) return { error: result.error ?? 'Creditos insuficientes' }
  }

  const grid = Array.from({ length: 9 }, () => spinCell())
  const win = checkWinLines(grid)
  const payout = win?.payout ?? 0

  if (payout > 0) {
    await addCredits(user.id, payout, 'casino_win', `Slots gano $${payout}`)
  }

  // Tracking PnL — siempre insertamos, gane o pierda
  await recordCasinoSession(user.id, 'slots', cost, payout, {
    grid, winLine: win?.winLine ?? null, symbol: win?.symbol ?? null, free,
  })

  const admin = db()
  await admin.from('activity_feed').insert({
    user_id: user.id, action_type: 'achievement',
    description: `jugo slots${payout > 0 ? ` y gano $${payout}` : ''}`,
    metadata: { game: 'slots', grid, winLine: win?.winLine ?? null, symbol: win?.symbol ?? null, payout, free },
  })

  revalidatePath('/casino')
  return {
    grid,
    winLine: win?.winLine ?? null,
    symbol: win?.symbol ?? null,
    payout,
    free,
  }
}

// ==========================================================
// PENALTY — 12 zonas con sesión persistente en BD (fix Bugs #2 #4 #5)
// El cliente NUNCA controla el estado; todo viene de penalty_sessions.
// ==========================================================
const TOTAL_ZONES = 12
const GK_COVERAGE = [5, 6, 7, 8, 9, 10]
const PENALTY_MULTIPLIERS = [1.5, 3.5, 8, 20, 55, 200]

function getPenaltyMultiplier(goalsScored: number): number {
  return PENALTY_MULTIPLIERS[Math.min(goalsScored - 1, PENALTY_MULTIPLIERS.length - 1)]
}

function getPenaltyCoverage(goalsScored: number): number {
  return GK_COVERAGE[Math.min(goalsScored, GK_COVERAGE.length - 1)]
}

function getPenaltyNextProb(goalsScored: number): number {
  const coverage = getPenaltyCoverage(goalsScored)
  return (TOTAL_ZONES - coverage) / TOTAL_ZONES
}

export async function startPenaltyGame(bet: number) {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }

  // Validacion de monto: finite, positivo, dentro del rango permitido.
  // Evita bet negativo (deductCredits suma en vez de restar) o NaN.
  if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
    return { error: `Apuesta debe estar entre $${MIN_BET} y $${MAX_BET}` }
  }

  // Cancelar cualquier sesión activa previa (defensa contra abandono)
  const admin = db()
  await admin
    .from('penalty_sessions')
    .update({ status: 'busted', ended_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('status', 'active')

  const free = await canPlayToday(user.id, 'penales')
  const cost = free ? 0 : bet

  if (cost > 0) {
    const result = await deductCredits(user.id, cost, 'casino_bet', `Penales apuesta $${cost}`)
    if (!result.success) return { error: result.error ?? 'Creditos insuficientes' }
  }

  const { data: session, error } = await admin
    .from('penalty_sessions')
    .insert({
      user_id: user.id,
      bet_amount: cost,
      goals_scored: 0,
      status: 'active',
    })
    .select('id')
    .single()

  if (error || !session) return { error: 'Error al crear sesion' }

  return { sessionId: session.id, free, firstProb: getPenaltyNextProb(0) }
}

export async function takePenaltyKick(sessionId: string, kickedZone: number) {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }

  if (kickedZone < 0 || kickedZone >= TOTAL_ZONES) return { error: 'Zona invalida' }

  const admin = db()

  // Cargar y validar sesión (debe ser del usuario, debe estar activa)
  const { data: session, error: loadError } = await admin
    .from('penalty_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (loadError || !session) return { error: 'Sesion invalida o cerrada' }

  const goalsScored: number = session.goals_scored
  const coverage = getPenaltyCoverage(goalsScored)

  // RNG server-side (Fisher-Yates)
  const allZones = Array.from({ length: TOTAL_ZONES }, (_, i) => i)
  for (let i = allZones.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allZones[i], allZones[j]] = [allZones[j], allZones[i]]
  }
  const coveredZones = allZones.slice(0, coverage)
  const isGoal = !coveredZones.includes(kickedZone)

  if (isGoal) {
    const newGoals = goalsScored + 1

    // Update sesión con UNA query — guard sobre status='active' previene races
    const { data: updated, error: updateError } = await admin
      .from('penalty_sessions')
      .update({ goals_scored: newGoals })
      .eq('id', sessionId)
      .eq('status', 'active')
      .select('id')
      .single()

    if (updateError || !updated) return { error: 'Sesion ya cerrada' }

    const multiplier = getPenaltyMultiplier(newGoals)
    const nextProb = newGoals < GK_COVERAGE.length ? getPenaltyNextProb(newGoals) : 0
    return { isGoal: true, coveredZones, kickedZone, multiplier, nextProb, sessionId, goalsScored: newGoals }
  }

  // Miss — cerrar sesión como busted (idempotente con guard)
  const { data: closed } = await admin
    .from('penalty_sessions')
    .update({ status: 'busted', ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('status', 'active')
    .select('id')
    .single()

  if (closed) {
    // Tracking PnL — pérdida total de la apuesta
    await recordCasinoSession(user.id, 'penalty', Number(session.bet_amount), 0, {
      goalsScored, result: 'miss', kickedZone,
    })

    await admin.from('activity_feed').insert({
      user_id: user.id, action_type: 'achievement',
      description: `jugo penales: fallo en tiro ${goalsScored + 1}, perdio $${session.bet_amount}`,
      metadata: { game: 'penalty', goalsScored, bet: session.bet_amount, result: 'miss' },
    })
  }

  revalidatePath('/casino')
  return { isGoal: false, coveredZones, kickedZone, multiplier: 0, nextProb: 0, sessionId }
}

export async function cashoutPenalty(sessionId: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }

  const admin = db()

  // Update atómico con guard — si no estaba 'active', no hace nada
  const { data: session, error } = await admin
    .from('penalty_sessions')
    .update({ status: 'cashed_out', ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .select('*')
    .single()

  if (error || !session) return { error: 'Sesion invalida o ya cerrada' }
  if (session.goals_scored < 1) return { error: 'Sin goles para retirar' }

  const multiplier = getPenaltyMultiplier(session.goals_scored)
  const payout = Math.round(Number(session.bet_amount) * multiplier)

  await addCredits(user.id, payout, 'casino_win', `Penales retiro con ${session.goals_scored} gol(es), gano $${payout}`)

  // Persist payout en la sesión
  await admin
    .from('penalty_sessions')
    .update({ payout })
    .eq('id', sessionId)

  // Tracking PnL
  await recordCasinoSession(user.id, 'penalty', Number(session.bet_amount), payout, {
    goalsScored: session.goals_scored, multiplier,
  })

  await admin.from('activity_feed').insert({
    user_id: user.id, action_type: 'achievement',
    description: `jugo penales: ${session.goals_scored} gol(es), retiro $${payout}`,
    metadata: { game: 'penalty', goalsScored: session.goals_scored, bet: session.bet_amount, multiplier, payout },
  })

  revalidatePath('/casino')
  return { payout, multiplier, goalsScored: session.goals_scored }
}

// ==========================================================
// SCRATCH CARD — con sesión persistente (fix Bug #1)
// El claim valida la session_id contra la BD, no se puede inventar
// ==========================================================
const SCRATCH_SYMBOLS = ['⚽', '🏆', '🟨', '🥅', '⭐']
const SCRATCH_PRIZEMAP: Record<string, number> = { '⚽': 300, '🏆': 150, '⭐': 100, '🥅': 50, '🟨': 15 }
const SCRATCH_COST = 15

export async function playScratchCard() {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }

  const admin = db()

  // Cancelar cualquier sesión activa previa
  await admin
    .from('scratch_sessions')
    .update({ status: 'expired' })
    .eq('user_id', user.id)
    .eq('status', 'active')

  const free = await canPlayToday(user.id, 'rasca')
  const cost = free ? 0 : SCRATCH_COST

  if (cost > 0) {
    const result = await deductCredits(user.id, cost, 'casino_bet', `Rasca y gana $${cost}`)
    if (!result.success) return { error: result.error ?? 'Creditos insuficientes' }
  }

  const roll = Math.random() * 100
  let cells: string[]
  let prizeSymbol: string | null = null

  if (roll < 75) {
    cells = generateLosingCard(SCRATCH_SYMBOLS)
  } else if (roll < 95) {
    prizeSymbol = Math.random() < 0.7 ? '🟨' : '🥅'
    cells = generateWinningCard(prizeSymbol, SCRATCH_SYMBOLS)
  } else if (roll < 99) {
    prizeSymbol = '⭐'
    cells = generateWinningCard(prizeSymbol, SCRATCH_SYMBOLS)
  } else {
    prizeSymbol = Math.random() < 0.7 ? '🏆' : '⚽'
    cells = generateWinningCard(prizeSymbol, SCRATCH_SYMBOLS)
  }

  const prizeAmount = prizeSymbol ? SCRATCH_PRIZEMAP[prizeSymbol] ?? 0 : 0

  // Crear sesión — el premio queda guardado en BD, el cliente no lo controla
  const { data: session, error } = await admin
    .from('scratch_sessions')
    .insert({
      user_id: user.id,
      bet_amount: cost,
      cells,
      prize_symbol: prizeSymbol,
      prize_amount: prizeAmount,
      status: 'active',
    })
    .select('id')
    .single()

  if (error || !session) return { error: 'Error al crear sesion' }

  return { sessionId: session.id, cells, free, prizemap: SCRATCH_PRIZEMAP }
}

function generateLosingCard(symbols: string[]): string[] {
  const cells: string[] = []
  const counts: Record<string, number> = {}
  for (let i = 0; i < 9; i++) {
    let sym: string
    let attempts = 0
    do {
      sym = symbols[Math.floor(Math.random() * symbols.length)]
      attempts++
    } while ((counts[sym] ?? 0) >= 2 && attempts < 20)
    cells.push(sym)
    counts[sym] = (counts[sym] ?? 0) + 1
  }
  return cells
}

function generateWinningCard(winSymbol: string, symbols: string[]): string[] {
  const cells: string[] = Array(9).fill('')
  const positions = [0, 1, 2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5)
  cells[positions[0]] = winSymbol
  cells[positions[1]] = winSymbol
  cells[positions[2]] = winSymbol
  const others = symbols.filter(s => s !== winSymbol)
  const counts: Record<string, number> = {}
  for (let i = 3; i < 9; i++) {
    let sym: string
    let attempts = 0
    do {
      sym = others[Math.floor(Math.random() * others.length)]
      attempts++
    } while ((counts[sym] ?? 0) >= 2 && attempts < 20)
    cells[positions[i]] = sym
    counts[sym] = (counts[sym] ?? 0) + 1
  }
  return cells
}

export async function claimScratchPrize(sessionId: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }

  const admin = db()

  // Update atómico con guard
  const { data: session, error } = await admin
    .from('scratch_sessions')
    .update({ status: 'claimed', claimed_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .select('*')
    .single()

  if (error || !session) return { error: 'Sesion invalida o ya reclamada' }

  const payout = Number(session.prize_amount ?? 0)

  if (payout > 0) {
    await addCredits(user.id, payout, 'casino_win', `Rasca y gana $${payout}`)
  }

  // Tracking PnL
  await recordCasinoSession(user.id, 'scratch', Number(session.bet_amount), payout, {
    prize_symbol: session.prize_symbol,
  })

  await admin.from('activity_feed').insert({
    user_id: user.id, action_type: 'achievement',
    description: `jugo rasca y gana${payout > 0 ? ` y gano $${payout}` : ''}`,
    metadata: { game: 'scratch', symbol: session.prize_symbol, payout },
  })

  revalidatePath('/casino')
  return { payout }
}

// ==========================================================
// MINES — Cancha Minada 6×6
// 36 celdas, niveles de dificultad: 3 / 5 / 8 / 12 minas
// RTP 97% — fórmula Stake estándar
// ==========================================================
const MINES_GRID_SIZE = 36
const MINES_LEVELS = [3, 5, 8, 12]
const MINES_RTP = 0.97
const MINES_COST = 25

/**
 * multiplier(N safes revealed) = RTP / P(N safe picks consecutivos)
 * P = C(safe_total, N) / C(total, N)
 */
function calcMinesMultiplier(mineCount: number, safeRevealed: number): number {
  if (safeRevealed === 0) return 1
  const safeTotal = MINES_GRID_SIZE - mineCount
  if (safeRevealed > safeTotal) return 0

  // Producto incremental para evitar overflow en factoriales
  let probability = 1
  for (let i = 0; i < safeRevealed; i++) {
    probability *= (safeTotal - i) / (MINES_GRID_SIZE - i)
  }

  const multiplier = MINES_RTP / probability
  return Math.round(multiplier * 100) / 100
}

export async function startMines(mineCount: number) {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }

  if (!MINES_LEVELS.includes(mineCount)) return { error: 'Cantidad de minas invalida' }

  const admin = db()

  // Cancelar sesión activa previa
  await admin
    .from('mines_sessions')
    .update({ status: 'busted', ended_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('status', 'active')

  const free = await canPlayToday(user.id, 'minas')
  const cost = free ? 0 : MINES_COST

  if (cost > 0) {
    const result = await deductCredits(user.id, cost, 'casino_bet', `Cancha Minada $${cost}`)
    if (!result.success) return { error: result.error ?? 'Creditos insuficientes' }
  }

  // Generar posiciones de minas server-side (Fisher-Yates)
  const positions = Array.from({ length: MINES_GRID_SIZE }, (_, i) => i)
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]]
  }
  const minePositions = positions.slice(0, mineCount)

  const { data: session, error } = await admin
    .from('mines_sessions')
    .insert({
      user_id: user.id,
      bet_amount: cost,
      mine_count: mineCount,
      mine_positions: minePositions,
      safe_revealed: [],
      status: 'active',
      current_multiplier: 1.0,
    })
    .select('id')
    .single()

  if (error || !session) return { error: 'Error al crear sesion' }

  return { sessionId: session.id, mineCount, free, gridSize: MINES_GRID_SIZE }
}

export async function revealMineCell(sessionId: string, cellIndex: number) {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }

  if (cellIndex < 0 || cellIndex >= MINES_GRID_SIZE) return { error: 'Celda invalida' }

  const admin = db()

  const { data: session, error: loadError } = await admin
    .from('mines_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (loadError || !session) return { error: 'Sesion invalida o cerrada' }

  const minePositions: number[] = session.mine_positions
  const safeRevealed: number[] = session.safe_revealed

  if (safeRevealed.includes(cellIndex)) return { error: 'Celda ya revelada' }

  const isMine = minePositions.includes(cellIndex)

  if (isMine) {
    // BUST — cerrar sesión
    const { data: closed } = await admin
      .from('mines_sessions')
      .update({ status: 'busted', ended_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('status', 'active')
      .select('id')
      .single()

    if (closed) {
      await recordCasinoSession(user.id, 'mines', Number(session.bet_amount), 0, {
        mineCount: session.mine_count,
        safeRevealed: safeRevealed.length,
        bustedAt: cellIndex,
      })

      await admin.from('activity_feed').insert({
        user_id: user.id, action_type: 'achievement',
        description: `jugo minas: piso una mina con ${safeRevealed.length} celdas, perdio $${session.bet_amount}`,
        metadata: { game: 'mines', mineCount: session.mine_count, safeRevealed: safeRevealed.length, result: 'busted' },
      })
    }

    return {
      isMine: true,
      cellIndex,
      minePositions, // revelar todas las minas al perder
      safeRevealed,
      multiplier: 0,
    }
  }

  // Safe — agregar a revealed y recalcular multiplier
  const newSafeRevealed = [...safeRevealed, cellIndex]
  const newMultiplier = calcMinesMultiplier(session.mine_count, newSafeRevealed.length)

  const { data: updated, error: updateError } = await admin
    .from('mines_sessions')
    .update({
      safe_revealed: newSafeRevealed,
      current_multiplier: newMultiplier,
    })
    .eq('id', sessionId)
    .eq('status', 'active')
    .select('id')
    .single()

  if (updateError || !updated) return { error: 'Sesion ya cerrada' }

  // Si ya reveló todas las seguras, auto-cashout
  const safeTotal = MINES_GRID_SIZE - session.mine_count
  if (newSafeRevealed.length === safeTotal) {
    return await cashoutMines(sessionId)
  }

  return {
    isMine: false,
    cellIndex,
    safeRevealed: newSafeRevealed,
    multiplier: newMultiplier,
    nextMultiplier: calcMinesMultiplier(session.mine_count, newSafeRevealed.length + 1),
  }
}

export async function cashoutMines(sessionId: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }

  const admin = db()

  const { data: session, error } = await admin
    .from('mines_sessions')
    .update({ status: 'cashed_out', ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .select('*')
    .single()

  if (error || !session) return { error: 'Sesion invalida o ya cerrada' }

  const safeRevealed: number[] = session.safe_revealed
  if (safeRevealed.length === 0) return { error: 'Sin celdas reveladas' }

  const multiplier = calcMinesMultiplier(session.mine_count, safeRevealed.length)
  const payout = Math.round(Number(session.bet_amount) * multiplier)

  if (payout > 0) {
    await addCredits(user.id, payout, 'casino_win', `Cancha Minada x${multiplier}, gano $${payout}`)
  }

  await admin
    .from('mines_sessions')
    .update({ payout })
    .eq('id', sessionId)

  await recordCasinoSession(user.id, 'mines', Number(session.bet_amount), payout, {
    mineCount: session.mine_count,
    safeRevealed: safeRevealed.length,
    multiplier,
  })

  await admin.from('activity_feed').insert({
    user_id: user.id, action_type: 'achievement',
    description: `jugo minas: ${safeRevealed.length} celdas, gano $${payout}`,
    metadata: { game: 'mines', mineCount: session.mine_count, safeRevealed: safeRevealed.length, multiplier, payout },
  })

  revalidatePath('/casino')

  return {
    isMine: false,
    cashout: true,
    payout,
    multiplier,
    safeRevealed,
    minePositions: session.mine_positions,
  }
}

// ==========================================================
// ¿DONDE ESTA FELIPE? — Casino game multi-bet con reveal
// ==========================================================
// Flow: placeFelipeBets descuenta total, crea session 'active'.
// revealFelipe corre RNG ponderado server-side, paga, cierra session.
// Guards atomicos previenen doble reveal y bypass de chips.
// ==========================================================

interface FelipeBetInput {
  room_id: string
  amount: number
}

const FELIPE_MAX_BETS_PER_ROUND = 24 // todas las salas

export async function placeFelipeBets(bets: FelipeBetInput[]) {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }

  if (!Array.isArray(bets) || bets.length === 0) {
    return { error: 'Tenes que apostar a al menos una sala' }
  }
  if (bets.length > FELIPE_MAX_BETS_PER_ROUND) {
    return { error: 'Demasiadas apuestas' }
  }

  // Validar cada bet: room_id existe, amount es chip valido
  const validatedBets: FelipeBetInput[] = []
  for (const b of bets) {
    if (!getRoomById(b.room_id)) {
      return { error: `Sala invalida: ${b.room_id}` }
    }
    if (!Number.isFinite(b.amount) || b.amount <= 0) {
      return { error: 'Monto invalido' }
    }
    if (!FELIPE_CHIPS.includes(b.amount as typeof FELIPE_CHIPS[number])) {
      return { error: `Ficha invalida. Permitidas: $${FELIPE_CHIPS.join(', $')}` }
    }
    validatedBets.push({ room_id: b.room_id, amount: b.amount })
  }

  // Sin duplicados de sala (si quiere apostar mas, que stackee chip mas alto)
  const roomIds = validatedBets.map(b => b.room_id)
  if (new Set(roomIds).size !== roomIds.length) {
    return { error: 'No podes apostar dos veces a la misma sala' }
  }

  const totalBet = validatedBets.reduce((sum, b) => sum + b.amount, 0)
  if (totalBet < MIN_BET) return { error: `Apuesta minima total: $${MIN_BET}` }
  if (totalBet > MAX_BET * 5) return { error: `Apuesta maxima total: $${MAX_BET * 5}` }

  const admin = db()

  // Cancelar cualquier sesion activa previa (defensa contra abandono)
  await admin
    .from('felipe_sessions')
    .update({ status: 'expired' })
    .eq('user_id', user.id)
    .eq('status', 'active')

  // Descontar el total ANTES de crear la sesion (atomic)
  const deduct = await deductCredits(
    user.id,
    totalBet,
    'casino_bet',
    `Felipe ronda ${validatedBets.length} apuesta(s) total $${totalBet}`,
  )
  if (!deduct.success) return { error: deduct.error ?? 'Creditos insuficientes' }

  const { data: session, error } = await admin
    .from('felipe_sessions')
    .insert({
      user_id: user.id,
      bets: validatedBets,
      total_bet: totalBet,
      status: 'active',
    })
    .select('id')
    .single()

  if (error || !session) {
    // Rollback del deduct
    await addCredits(user.id, totalBet, 'refund', 'Rollback Felipe sesion fallida')
    return { error: 'Error al crear ronda' }
  }

  return {
    success: true,
    sessionId: session.id,
    totalBet,
    betCount: validatedBets.length,
  }
}

export async function revealFelipe(sessionId: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'No autenticado' }

  const admin = db()

  // Pick ganador server-side ANTES del UPDATE (RNG no manipulable)
  const winningRoom = pickWinningRoomServer()
  const winningRoomData = getRoomById(winningRoom)!

  // Cargar bets de la sesion para calcular payout
  const { data: session, error: loadError } = await admin
    .from('felipe_sessions')
    .select('id, bets, total_bet, status')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (loadError || !session) return { error: 'Sesion invalida o ya revelada' }

  const bets = session.bets as FelipeBetInput[]

  // Calcular payout: solo las apuestas a la sala ganadora pagan
  let payout = 0
  let winningBetAmount = 0
  for (const bet of bets) {
    if (bet.room_id === winningRoom) {
      const multiplier = getRoomMultiplier(winningRoomData.prob)
      payout += Math.round(bet.amount * multiplier * 100) / 100
      winningBetAmount = bet.amount
    }
  }

  // Cerrar sesion atomicamente (guard contra doble reveal)
  const { data: updated, error: updateError } = await admin
    .from('felipe_sessions')
    .update({
      status: 'revealed',
      winning_room: winningRoom,
      payout,
      revealed_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle()

  if (updateError || !updated) return { error: 'Sesion ya revelada' }

  // Pagar SOLO si gano algo y solo despues de cerrar la sesion
  if (payout > 0) {
    await addCredits(
      user.id,
      payout,
      'casino_win',
      `Felipe estaba en ${winningRoomData.name}, gano $${payout}`,
      sessionId,
    )
  }

  // Activity feed (publico, todos lo ven)
  await admin.from('activity_feed').insert({
    user_id: user.id,
    action_type: 'achievement',
    description: payout > 0
      ? `encontro a Felipe en ${winningRoomData.name} y gano $${payout}`
      : `aposto a Felipe pero estaba en ${winningRoomData.name}`,
    metadata: {
      game: 'felipe',
      winning_room: winningRoom,
      total_bet: session.total_bet,
      payout,
    },
  })

  revalidatePath('/casino')
  return {
    winningRoom,
    winningRoomName: winningRoomData.name,
    payout,
    winningBetAmount,
    totalBet: session.total_bet,
  }
}
