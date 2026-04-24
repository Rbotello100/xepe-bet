// --- Credits & Betting ---
export const INITIAL_CREDITS = 1000
export const MIN_BET = 10
export const MAX_BET = 500

// --- Time Locks ---
export const BET_LOCK_HOURS = 1        // bets close 1h before kickoff
export const PREDICTION_LOCK_HOURS = 24 // predictions lock 24h before kickoff

// --- API Sport Keys ---
// Default sport_key used when a match has no explicit value (e.g. seeded Mundial matches).
// import-league route stores the real sport_key per match so the score sync can query
// /scores per-sport automatically.
export const SPORT_KEY = process.env.NEXT_PUBLIC_SPORT_KEY ?? 'soccer_fifa_world_cup'

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
export const ODDS_MAX_SYNC_ATTEMPTS = 3

// Scores: Vercel Hobby permite cron 1x/dia. /scores solo devuelve hasta 3 dias atras,
// asi que un match tiene ~3 oportunidades de ser capturado automaticamente antes de
// salir de ventana. 5 intentos deja margen si algun run falla por transient errors.
// Para correr mas frecuente habria que upgrade a Vercel Pro + mas creditos Odds API.
export const SCORE_SYNC_DELAY_MIN = 130
export const SCORE_MAX_SYNC_ATTEMPTS = 5
export const SCORE_SYNC_WINDOW_DAYS = 3
