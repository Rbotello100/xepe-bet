// --- Credits & Betting ---
export const INITIAL_CREDITS = 1000
export const MIN_BET = 10
export const MAX_BET = 500

// Parlay limits — defensa contra payouts astronomicos.
// La RPC SQL valida los mismos topes (place_parlay_atomic) como segunda capa.
export const MIN_PARLAY_LEGS = 2
export const MAX_PARLAY_LEGS = 10
export const MAX_PARLAY_ODDS = 1000      // multiplicador total maximo (10 legs x 2.0 = 1024, fuera)
export const MAX_PARLAY_PAYOUT = 50000   // tope al premio potencial en USD

// --- Time Locks ---
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
// Odds: 1 sola request por partido cuando faltan hasta 5 dias del kickoff.
// Quedan congeladas hasta el cierre (BET_LOCK_HOURS = 1h antes).
export const ODDS_OPEN_HOURS_BEFORE = 120 // 5 dias
// Max 10 intentos (= 10 dias de crons diarios) para cubrir casos donde el match
// entra en ventana pero la API aun no publico odds (a veces hasta 2 dias antes del kickoff).
// Con 3 era muy bajo y los matches abandonaban antes de que la API los tuviera.
export const ODDS_MAX_SYNC_ATTEMPTS = 10

// Scores: Vercel Hobby permite cron 1x/dia. /scores solo devuelve hasta 3 dias atras,
// asi que un match tiene ~3 oportunidades de ser capturado automaticamente antes de
// salir de ventana. 5 intentos deja margen si algun run falla por transient errors.
// Para correr mas frecuente habria que upgrade a Vercel Pro + mas creditos Odds API.
export const SCORE_SYNC_DELAY_MIN = 130
export const SCORE_MAX_SYNC_ATTEMPTS = 5
export const SCORE_SYNC_WINDOW_DAYS = 3
