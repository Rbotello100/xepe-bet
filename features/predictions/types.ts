export interface PredictionInput {
  match_id: string
  predicted_winner: 'home' | 'draw' | 'away'
  predicted_home_score: number | null
  predicted_away_score: number | null
}
