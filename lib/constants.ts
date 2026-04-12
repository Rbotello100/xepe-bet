// --- Credits & Betting ---
export const INITIAL_CREDITS = 1000
export const MIN_BET = 10
export const MAX_BET = 500

// --- Time Locks ---
export const BET_LOCK_HOURS = 1        // bets close 1h before kickoff
export const PREDICTION_LOCK_HOURS = 24 // predictions lock 24h before kickoff

// --- API Sport Keys (swap for production) ---
// Dev/testing: Premier League
// Production: soccer_fifa_world_cup / league=1
export const SPORT_KEY = process.env.NEXT_PUBLIC_SPORT_KEY ?? 'soccer_epl'
export const FOOTBALL_LEAGUE_ID = parseInt(process.env.NEXT_PUBLIC_FOOTBALL_LEAGUE_ID ?? '39', 10) // 39=EPL, 1=World Cup
export const FOOTBALL_SEASON = parseInt(process.env.NEXT_PUBLIC_FOOTBALL_SEASON ?? '2025', 10) // 2026 for World Cup

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
export const ODDS_OPEN_HOURS_BEFORE = 3 // open odds 3h before match
export const ODDS_SYNC_INTERVAL_MIN = 60 // sync every 60 min during window
