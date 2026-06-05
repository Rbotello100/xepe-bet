'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { deductCredits, addCredits } from '@/lib/credits'
import { logError } from '@/lib/log/error'
import { MIN_BET, MAX_BET } from '@/lib/constants'
import { generateRelatorMessage } from '@/lib/relator/generate-message'
import { getCasinoRachaMalaUsuario } from '@/features/relator/stats'

// "Venía perdiendo X seguidas" si aplica — para cashouts/wins que cortan una racha mala.
async function rachaCasinoQuiebreSnippet(userId: string): Promise<string> {
  try {
    // Llamar ANTES del recordCasinoSession del win actual: cuenta sesiones previas.
    // Si el user venia con 3+ derrotas y este win las corta, el dato es jugoso.
    const streak = await getCasinoRachaMalaUsuario(userId)
    if (streak >= 3) return ` Venía perdiendo ${streak} seguidas, le cortó la mala.`
    return ''
  } catch {
    return ''
  }
}

// Umbrales para que el Relator narre eventos del casino.
// Bajos en testing — subir cuando la plataforma tenga mas users.
const RELATOR_PENALTY_MIN_PAYOUT = 30   // cashout penales con payout >= $30
const RELATOR_MINES_MIN_MULTIPLIER = 1.5 // multiplier x1.5+
const RELATOR_SLOTS_MIN_PAYOUT = 50      // slots con premio >= $50
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

// Rate limit casino: 1s entre acciones (mismo gap que las bets). Comparte
// la tabla bet_throttle del fix P1 — no necesita migration nueva. Aplica
// a cualquier endpoint de casino que modifique creditos/sesiones.
async function throttleCasino(userId: string): Promise<boolean> {
  const admin = db()
  const { data } = await admin.rpc('check_bet_throttle', {
    p_user_id: userId,
    p_min_gap_ms: 1000,
  })
  return data === true
}

// Cooldown in-memory por user para los hooks del Relator. Previene que un
// user spammeando ganancias de slots dispare N llamadas a Anthropic por
// minuto (cada call cuesta $0.005-0.01). Vive en la instancia de Vercel
// function — se resetea con cold starts, pero cubre el caso de spam directo.
const RELATOR_HOOK_COOLDOWN_MS = 60_000  // 1 minuto entre mensajes por user
const relatorLastHook = new Map<string, number>()
function canFireRelatorHook(userId: string): boolean {
  const now = Date.now()
  const last = relatorLastHook.get(userId) ?? 0
  if (now - last < RELATOR_HOOK_COOLDOWN_MS) return false
  relatorLastHook.set(userId, now)
  return true
}

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
 * Cierra cualquier sesion 'active' del user en la tabla dada (penalty_sessions
 * o mines_sessions) marcandola como 'abandoned' y devuelve el bet al user.
 *
 * Por que: si el user double-clickea start, navega afuera y vuelve, o reinicia
 * la pagina con sesion activa, antes la sesion previa quedaba 'busted' (perdida)
 * y se le cobraban DOS bets en lugar de uno. Bug claro: si no decidio bustear
 * ni cashear, no debe perder el stake.
 *
 * Idempotente: usa .eq('status', 'active') en el UPDATE, si la sesion ya estaba
 * cerrada no hace nada. Refund usa addCredits con reference_id=session.id, asi
 * que aun si dos requests concurrentes la cierran, addCredits solo paga una vez
 * (idempotency check + UNIQUE index — fix P0 audit).
 *
 * Las sesiones was_free no descontaron nada del balance, asi que no requieren
 * refund (skip addCredits).
 */
async function refundAbandonedSessions(
  userId: string,
  table: 'penalty_sessions' | 'mines_sessions',
): Promise<{ refunded: number; failed: number }> {
  const admin = db()
  const { data: actives } = await admin
    .from(table)
    .select('id, bet_amount, was_free')
    .eq('user_id', userId)
    .eq('status', 'active')

  let refunded = 0
  let failed = 0

  for (const session of actives ?? []) {
    const { data: closed } = await admin
      .from(table)
      .update({ status: 'abandoned', ended_at: new Date().toISOString() })
      .eq('id', session.id)
      .eq('status', 'active')
      .select('id')
      .maybeSingle()

    if (!closed) continue
    const stake = Number(session.bet_amount)
    if (session.was_free || stake <= 0) {
      refunded++
      continue
    }
    try {
      const paid = await addCredits(userId, stake, 'refund', `Refund ${table === 'mines_sessions' ? 'mines' : 'penales'} abandonado`, session.id)
      if (paid.success) {
        refunded++
      } else {
        failed++
        // addCredits ya logueo el error. Agregamos contexto para que el admin
        // sepa que sesion quedo sin refundar. Continuamos con la siguiente
        // (no bloqueamos el flujo del juego nuevo del user).
        await logError('casino.refundAbandoned.creditFail', paid.error ?? 'unknown', {
          sessionId: session.id, table, userId, stake,
        }, 'error')
      }
    } catch (err) {
      failed++
      await logError('casino.refundAbandoned.threw', err, {
        sessionId: session.id, table, userId, stake,
      }, 'error')
    }
  }

  return { refunded, failed }
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
  if (!(await throttleCasino(user.id))) return { error: 'Esperá un segundo entre giros' }

  const free = await canPlayToday(user.id, 'slots')
  const cost = free ? 0 : SLOTS_COST

  if (cost > 0) {
    const result = await deductCredits(user.id, cost, 'casino_bet', `Slots giro $${cost}`)
    if (!result.success) return { error: result.error ?? 'Creditos insuficientes' }
  }

  const grid = Array.from({ length: 9 }, () => spinCell())
  const win = checkWinLines(grid)
  const payout = win?.payout ?? 0
  // Slots no tiene tabla de sesion persistente. Generamos un id opaco para
  // que addCredits pueda hacer idempotency check (evita doble pago si la
  // action se reintenta por timeout). Mismo id va al metadata de casino_sessions.
  const spinId = crypto.randomUUID()

  if (payout > 0) {
    const paid = await addCredits(user.id, payout, 'casino_win', `Slots gano $${payout}`, spinId)
    if (!paid.success) {
      // addCredits ya loguea el error a error_log. Slots no tiene tabla de
      // sesion para "rollback", asi que refundamos el cost del spin para que
      // el user pueda reintentar sin perder la apuesta. Usamos un reference_id
      // distinto al win original (suffix -refund) para no chocar con el UNIQUE.
      if (cost > 0) {
        await addCredits(user.id, cost, 'refund', 'Slots: refund por fallo en pago', spinId + '-refund')
      }
      return { error: 'No se pudo procesar el pago, reintentá en unos segundos' }
    }
  }

  // Relator: slots con payout grande (s3 o mejor). Le adjunta el quiebre de
  // racha mala si venia perdiendo 3+ partidas. Llamado ANTES de recordCasinoSession
  // — la query cuenta solo sesiones previas.
  // canFireRelatorHook: 1 mensaje/user/minuto para evitar spam de Anthropic.
  if (payout >= RELATOR_SLOTS_MIN_PAYOUT && canFireRelatorHook(user.id)) {
    void (async () => {
      const racha = await rachaCasinoQuiebreSnippet(user.id)
      await generateRelatorMessage({
        kind: 'flash',
        userId: user.id,
        context: `{user} pegó la línea en Slots y se llevó $${payout}.${racha}`,
      })
    })()
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

  revalidatePath('/', 'layout')
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
  if (!(await throttleCasino(user.id))) return { error: 'Esperá un segundo entre acciones' }

  // Validacion de monto: finite, positivo, dentro del rango permitido.
  // Evita bet negativo (deductCredits suma en vez de restar) o NaN.
  if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
    return { error: `Apuesta debe estar entre $${MIN_BET} y $${MAX_BET}` }
  }

  const admin = db()

  // Refund de sesion activa previa (abandono por double-click, navegacion, etc).
  // Si el user no llego a bustear ni cashear, no es justo que pierda el stake.
  // Sesiones was_free no descontaron nada → no requieren refund.
  await refundAbandonedSessions(user.id, 'penalty_sessions')

  // Free play: NO descontamos del balance, pero registramos el bet real
  // (bet_amount > 0, was_free=true) para que el cashout pague proporcional
  // al multiplier. La jugada gratis es bonus, no demo.
  const free = await canPlayToday(user.id, 'penales')

  if (!free) {
    const result = await deductCredits(user.id, bet, 'casino_bet', `Penales apuesta $${bet}`)
    if (!result.success) return { error: result.error ?? 'Creditos insuficientes' }
  }

  const { data: session, error } = await admin
    .from('penalty_sessions')
    .insert({
      user_id: user.id,
      bet_amount: bet,
      goals_scored: 0,
      status: 'active',
      was_free: free,
    })
    .select('id')
    .single()

  if (error || !session) return { error: 'Error al crear sesion' }

  // Revalidate para que el Header muestre el balance post-deduct.
  revalidatePath('/', 'layout')
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

  // Guard: con 6 goles ya alcanzaste el multiplier maximo (x200). Server-side
  // bloqueamos kicks adicionales para impedir que un cliente alterado siga
  // tirando y arriesgue todo. La UI ya muestra nextProb=0 y bloquea el boton,
  // pero esta validacion server es la fuente de verdad.
  if (goalsScored >= PENALTY_MULTIPLIERS.length) {
    return { error: 'Maximo de goles alcanzado, cobra para cerrar la sesion' }
  }

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
    const isFree = session.was_free === true
    return { isGoal: true, coveredZones, kickedZone, multiplier, nextProb, sessionId, goalsScored: newGoals, isFree }
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

  revalidatePath('/', 'layout')
  const isFreeMiss = session.was_free === true
  return { isGoal: false, coveredZones, kickedZone, multiplier: 0, nextProb: 0, sessionId, isFree: isFreeMiss }
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

  const paid = await addCredits(user.id, payout, 'casino_win', `Penales retiro con ${session.goals_scored} gol(es), gano $${payout}`, sessionId)
  if (!paid.success) {
    // El UPDATE de status='cashed_out' ya hizo el guard. Rollback: volver a
    // 'active' para que el user pueda reintentar el cashout sin perder los goles.
    await admin.from('penalty_sessions').update({ status: 'active', ended_at: null }).eq('id', sessionId)
    return { error: 'No se pudo procesar el pago, reintentá en unos segundos' }
  }

  // Relator: cashout grande de penales (+ snippet de racha mala quebrada)
  if (payout >= RELATOR_PENALTY_MIN_PAYOUT && canFireRelatorHook(user.id)) {
    void (async () => {
      const racha = await rachaCasinoQuiebreSnippet(user.id)
      await generateRelatorMessage({
        kind: 'flash',
        userId: user.id,
        context: `{user} clavó ${session.goals_scored} penal${session.goals_scored > 1 ? 'es' : ''} seguidos y se retiró con $${payout} (×${multiplier}).${racha}`,
      })
    })()
  }

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

  revalidatePath('/', 'layout')
  const isFree = session.was_free === true
  return { payout, multiplier, goalsScored: session.goals_scored, isFree }
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
  if (!(await throttleCasino(user.id))) return { error: 'Esperá un segundo entre tarjetas' }

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

  // Revalidate por el deduct inicial (si no fue free).
  revalidatePath('/', 'layout')
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
    const paid = await addCredits(user.id, payout, 'casino_win', `Rasca y gana $${payout}`, sessionId)
    if (!paid.success) {
      await admin.from('scratch_sessions').update({ status: 'active', claimed_at: null }).eq('id', sessionId)
      return { error: 'No se pudo procesar el pago, reintentá en unos segundos' }
    }
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

  revalidatePath('/', 'layout')
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
  if (!(await throttleCasino(user.id))) return { error: 'Esperá un segundo entre partidas' }

  if (!MINES_LEVELS.includes(mineCount)) return { error: 'Cantidad de minas invalida' }

  const admin = db()

  // Refund de sesion activa previa (abandono por double-click, navegacion, etc).
  // Mismo patron que startPenaltyGame — ver refundAbandonedSessions.
  await refundAbandonedSessions(user.id, 'mines_sessions')

  // Free play: NO descontamos del balance pero bet_amount=MINES_COST igual,
  // para que el cashout pague proporcional al multiplier. was_free=true marca
  // la sesion como bonus (la UI lo muestra distinto).
  const free = await canPlayToday(user.id, 'minas')

  if (!free) {
    const result = await deductCredits(user.id, MINES_COST, 'casino_bet', `Cancha Minada $${MINES_COST}`)
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
      bet_amount: MINES_COST,
      mine_count: mineCount,
      mine_positions: minePositions,
      safe_revealed: [],
      status: 'active',
      current_multiplier: 1.0,
      was_free: free,
    })
    .select('id')
    .single()

  if (error || !session) return { error: 'Error al crear sesion' }

  // Revalidate /casino para que el balance del Header se actualice. Si el user
  // pierde sin cashear, esto sigue manteniendo la UI consistente con el debit.
  revalidatePath('/', 'layout')
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

    // Revalidate para que el balance del Header refleje que la apuesta se perdio.
    // Sin esto, el balance UI quedaba con el valor previo al start hasta otra accion.
    revalidatePath('/', 'layout')

    const isFreeBust = session.was_free === true
    return {
      isMine: true,
      cellIndex,
      minePositions, // revelar todas las minas al perder
      safeRevealed,
      multiplier: 0,
      isFree: isFreeBust,
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

  const isFree = session.was_free === true
  return {
    isMine: false,
    cellIndex,
    safeRevealed: newSafeRevealed,
    multiplier: newMultiplier,
    nextMultiplier: calcMinesMultiplier(session.mine_count, newSafeRevealed.length + 1),
    isFree,
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
    const paid = await addCredits(user.id, payout, 'casino_win', `Cancha Minada x${multiplier}, gano $${payout}`, sessionId)
    if (!paid.success) {
      await admin.from('mines_sessions').update({ status: 'active', ended_at: null }).eq('id', sessionId)
      return { error: 'No se pudo procesar el pago, reintentá en unos segundos' }
    }
  }

  // Relator: cashout con multiplier alto en mines (+ snippet de racha mala quebrada)
  if (multiplier >= RELATOR_MINES_MIN_MULTIPLIER && payout > 0 && canFireRelatorHook(user.id)) {
    void (async () => {
      const racha = await rachaCasinoQuiebreSnippet(user.id)
      await generateRelatorMessage({
        kind: 'flash',
        userId: user.id,
        context: `{user} esquivó ${safeRevealed.length} celdas en Cancha Minada (×${multiplier.toFixed(2)}) y se llevó $${payout}.${racha}`,
      })
    })()
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

  revalidatePath('/', 'layout')

  const isFree = session.was_free === true
  return {
    isMine: false,
    cashout: true,
    payout,
    multiplier,
    safeRevealed,
    minePositions: session.mine_positions,
    isFree,
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
  if (!(await throttleCasino(user.id))) return { error: 'Esperá un segundo entre rondas' }

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
    const paid = await addCredits(
      user.id,
      payout,
      'casino_win',
      `Felipe estaba en ${winningRoomData.name}, gano $${payout}`,
      sessionId,
    )
    if (!paid.success) {
      // Felipe ya esta revealed (resultado determinado server-side). No podemos
      // hacer rollback a 'active' porque eso permitiria re-revelar con OTRO
      // resultado random (cheating window). addCredits ya logueo el fallo en
      // error_log con el sessionId — el admin lo va a ver en /observability y
      // puede ejecutar add_credits_atomic manualmente con el mismo sessionId
      // (idempotente: si funciona la 2da vez, no duplica el pago).
      return { error: 'No se pudo procesar el pago. El equipo lo va a regularizar en breve.' }
    }
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

  revalidatePath('/', 'layout')
  return {
    winningRoom,
    winningRoomName: winningRoomData.name,
    payout,
    winningBetAmount,
    totalBet: session.total_bet,
  }
}
