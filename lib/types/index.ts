// Domain types -- derived from DB schema
// When database.types.ts is generated, replace these with proper derived types

export interface Team {
  id: string
  name: string
  fifa_code: string
  flag: string
  group_name: string
}

export interface Match {
  id: string
  home_team_id: string
  away_team_id: string
  group_name: string | null
  round: string
  starts_at: string
  status: 'scheduled' | 'open' | 'live' | 'finished' | 'cancelled'
  home_score: number | null
  away_score: number | null
  odds_home: number | null
  odds_draw: number | null
  odds_away: number | null
  external_id: string | null
  odds_updated_at: string | null
}

export interface MatchWithTeams extends Match {
  home_team: Team
  away_team: Team
}

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  credits: number
  total_points: number
  is_admin: boolean
}

export interface Prediction {
  id: string
  user_id: string
  match_id: string
  predicted_winner: 'home' | 'draw' | 'away' | null
  predicted_home_score: number | null
  predicted_away_score: number | null
  points_earned: number
  is_correct: boolean | null
}

export interface PredictionWithMatch extends Prediction {
  match: MatchWithTeams
}

export interface Bet {
  id: string
  user_id: string
  match_id: string
  market_type: string
  pick: string
  amount: number
  odds_at_placement: number
  potential_payout: number
  status: 'pending' | 'won' | 'lost' | 'cancelled' | 'cashed_out'
  cash_out_amount: number | null
  cashed_out_at: string | null
  resolved_at: string | null
}

export interface BetWithMatch extends Bet {
  match: MatchWithTeams
}

export interface FeedEntry {
  id: string
  user_id: string
  action_type: 'prediction' | 'bet' | 'cash_out' | 'trivia' | 'parlay' | 'achievement'
  description: string
  metadata: Record<string, unknown> | null
  created_at: string
  profile?: Pick<Profile, 'display_name' | 'avatar_url'>
}

export interface ScoringConfig {
  correct_winner_points: number
  exact_score_points: number
  correct_goal_diff_points: number
  group_winner_points: number
  champion_points: number
}
