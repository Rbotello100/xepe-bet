export interface BetInput {
  match_id: string
  market_type: string
  pick: string
  amount: number
  odds: number
}

export interface ParlayLegInput {
  match_id: string
  market_type: string
  pick: string
  odds: number
}

export interface ParlayInput {
  legs: ParlayLegInput[]
  amount: number
}
