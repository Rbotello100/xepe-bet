// --- Credits & Betting ---
export const INITIAL_CREDITS = 1000
export const MIN_BET = 10
export const MAX_BET = 500

// --- Time Locks ---
export const BET_LOCK_HOURS = 1        // bets close 1h before kickoff
export const PREDICTION_LOCK_HOURS = 24 // predictions lock 24h before kickoff

// --- API Sport Keys ---
// Production (default): FIFA World Cup 2026
// To run against Premier League for dev/testing, override via env:
//   NEXT_PUBLIC_SPORT_KEY=soccer_epl
//   NEXT_PUBLIC_FOOTBALL_LEAGUE_ID=39
//   NEXT_PUBLIC_FOOTBALL_SEASON=2025
export const SPORT_KEY = process.env.NEXT_PUBLIC_SPORT_KEY ?? 'soccer_fifa_world_cup'
export const FOOTBALL_LEAGUE_ID = parseInt(process.env.NEXT_PUBLIC_FOOTBALL_LEAGUE_ID ?? '1', 10) // 1=World Cup, 39=EPL
export const FOOTBALL_SEASON = parseInt(process.env.NEXT_PUBLIC_FOOTBALL_SEASON ?? '2026', 10)

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
// Odds: 1 sola request por partido cuando faltan 24h. Quedan congeladas hasta el cierre (1h antes).
export const ODDS_OPEN_HOURS_BEFORE = 24
export const ODDS_MAX_SYNC_ATTEMPTS = 3

// Scores: 1 sola request 130 min después del kickoff (cubre 90' + descuento + alargue + penales).
export const SCORE_SYNC_DELAY_MIN = 130
export const SCORE_MAX_SYNC_ATTEMPTS = 3
