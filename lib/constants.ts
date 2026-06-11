// --- Credits & Betting ---
export const INITIAL_CREDITS = 5000
// MIN_BET = 1 evita microbets de centavos. NO hay MAX_BET para bets/parlay
// de partidos — el cap natural es el balance del user (deductCredits falla
// con 'Creditos insuficientes'). El premio se limita por MAX_PARLAY_PAYOUT
// ($50k) en parlays y por el cap global de balance ($1M) en add_credits_atomic.
export const MIN_BET = 1
// Cap defensivo SOLO para Penales del casino: el multiplicador llega a x200,
// asi que sin tope una sesion de $5000 puede pagar $1M y chocar con el cap
// global. $500 con x200 = $100k max payout — limite holgado.
export const CASINO_MAX_BET = 500

// Whitelist de picks aceptados (Tier 1+2 — 19 picks).
// La RPC SQL tiene CHECK constraint paralelo (migration
// 20260610000001_pick_whitelist_extended.sql + atomic_bets_v3). El TS valida
// pre-RPC para mejor UX (mensaje claro en vez de error de Postgres).
export const VALID_PICKS = [
  // 1X2
  'home', 'draw', 'away', '1', 'X', '2',
  // Doble chance
  '1X', 'X2', '12',
  // Both Teams To Score
  'btts_yes', 'btts_no',
  // Draw No Bet
  'dnb_home', 'dnb_away',
  // Over/Under variados
  'over_1.5', 'under_1.5',
  'over_2.5', 'under_2.5',
  'over_3.5', 'under_3.5',
] as const
export type BetPick = typeof VALID_PICKS[number]
export function isValidPick(p: unknown): p is BetPick {
  return typeof p === 'string' && (VALID_PICKS as readonly string[]).includes(p)
}

// Whitelist de markets aceptados. Hoy bets.market_type aceptaba cualquier
// string — desde migration 20260610000001 hay CHECK constraint paralelo.
export const VALID_MARKETS = [
  '1x2',
  'double_chance',
  'btts',
  'draw_no_bet',
  'totals_1.5',
  'totals_2.5',
  'totals_3.5',
] as const
export type BetMarket = typeof VALID_MARKETS[number]
export function isValidMarket(m: unknown): m is BetMarket {
  return typeof m === 'string' && (VALID_MARKETS as readonly string[]).includes(m)
}

// Mapeo pick -> market_type esperado. Sirve como defense-in-depth en el server
// para detectar inconsistencias (ej. pick='btts_yes' con market='1x2' es un
// bug del client).
export const PICK_TO_MARKET: Record<BetPick, BetMarket> = {
  home: '1x2', draw: '1x2', away: '1x2',
  '1': '1x2', 'X': '1x2', '2': '1x2',
  '1X': 'double_chance', 'X2': 'double_chance', '12': 'double_chance',
  btts_yes: 'btts', btts_no: 'btts',
  dnb_home: 'draw_no_bet', dnb_away: 'draw_no_bet',
  'over_1.5': 'totals_1.5', 'under_1.5': 'totals_1.5',
  'over_2.5': 'totals_2.5', 'under_2.5': 'totals_2.5',
  'over_3.5': 'totals_3.5', 'under_3.5': 'totals_3.5',
}

// UUID v4 (relajado: acepta cualquier UUID con formato 8-4-4-4-12 hex).
// Pre-validar inputs antes de mandar a Supabase para dar errores claros
// en lugar de "registro no encontrado" cuando el formato es invalido.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUUID(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s)
}

// Parlay limits — defensa contra payouts astronomicos.
// La RPC SQL valida los mismos topes (place_parlay_atomic) como segunda capa.
export const MIN_PARLAY_LEGS = 2
export const MAX_PARLAY_LEGS = 10
export const MAX_PARLAY_ODDS = 1000      // multiplicador total maximo (10 legs x 2.0 = 1024, fuera)
export const MAX_PARLAY_PAYOUT = 50000   // tope al premio potencial en USD

// --- Time Locks ---
// IMPORTANTE: BET_LOCK_HOURS se duplica en SQL como `interval '1 hour'` en la RPC
// `place_bet_atomic` (migration 20260601061926_atomic_bets_v2.sql). Si cambias este
// valor, crea una migration que actualice la RPC en paralelo, sino la UX y la
// validacion server-side quedan desincronizadas.
export const BET_LOCK_HOURS = 1        // bets close 1h before kickoff
export const PREDICTION_LOCK_HOURS = 24 // predictions lock 24h before kickoff

// --- API Sport Keys ---
// Default sport_key used when a match has no explicit value (e.g. seeded Mundial matches).
// import-league route stores the real sport_key per match so the score sync can query
// /scores per-sport automatically.
export const SPORT_KEY = process.env.NEXT_PUBLIC_SPORT_KEY ?? 'soccer_fifa_world_cup'

// Sports activos: el cron diario corre discover() para cada uno de estos.
// Agregar un sport = agregar aca. No requiere crons nuevos (Vercel Hobby permite solo 1x/dia).
export const ACTIVE_SPORT_KEYS = [
  'soccer_fifa_world_cup',
  'soccer_epl',
] as const

// --- Scoring Defaults ---
export const DEFAULT_SCORING = {
  correctWinner: 3,
  exactScore: 5,
  correctGoalDiff: 2,
  groupWinner: 10,
  champion: 20,
} as const

// --- Match Rounds ---
export const MATCH_ROUNDS = [
  'group', 'r32', 'r16', 'quarter', 'semi', 'third', 'final',
] as const

export type MatchRound = typeof MATCH_ROUNDS[number]

// --- Trivia ---
export const TRIVIA_REWARDS = {
  5: 50,   // 5/5 = 50 credits
  7: 75,   // 7/7 = 75 credits
  10: 150, // 10/10 = 150 credits
} as const

// --- Sync Schedule ---
// Odds: sincronizamos hasta 35 dias antes del kickoff. Suficiente para
// cubrir fase de grupos completa + octavos del Mundial 2026. Para partidos
// mas lejanos (cuartos/semis/final), las casas suelen no abrir hasta que
// el bracket esta definido — el cron diario los captura cuando publiquen.
// Verificacion empirica 2026-06-04: la API devuelve partidos hasta +23d.
// Quedan congeladas hasta el cierre (BET_LOCK_HOURS = 1h antes).
export const ODDS_OPEN_HOURS_BEFORE = 840 // 35 dias
// Max 10 intentos (= 10 dias de crons diarios) para cubrir casos donde el match
// entra en ventana pero la API aun no publico odds (a veces hasta 2 dias antes del kickoff).
// Con 3 era muy bajo y los matches abandonaban antes de que la API los tuviera.
export const ODDS_MAX_SYNC_ATTEMPTS = 10

// Refresh diario: para partidos a <= ODDS_REFRESH_WINDOW_HOURS del kickoff,
// el cron de las 9 AM Chile re-pide odds aunque ya tengan odds_synced=true.
// 48h = 2 dias cubre lo que la mayoria de la gente apuesta (vispera y dia del
// partido). Partidos mas lejanos quedan con las odds del sync inicial — si
// el mercado se movio >3%, oddsWithinTolerance los rechaza y el cliente
// recarga al dia siguiente con las odds actualizadas.
export const ODDS_REFRESH_WINDOW_HOURS = 48

// Scores: Vercel Hobby permite cron 1x/dia. /scores solo devuelve hasta 3 dias atras,
// asi que un match tiene ~3 oportunidades de ser capturado automaticamente antes de
// salir de ventana. 5 intentos deja margen si algun run falla por transient errors.
// Para correr mas frecuente habria que upgrade a Vercel Pro + mas creditos Odds API.
export const SCORE_SYNC_DELAY_MIN = 130
export const SCORE_MAX_SYNC_ATTEMPTS = 5
export const SCORE_SYNC_WINDOW_DAYS = 3
