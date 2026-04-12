export interface OddsAPIEvent {
  id: string
  sport_key: string
  sport_title: string
  commence_time: string
  home_team: string
  away_team: string
  bookmakers: OddsBookmaker[]
}

export interface OddsBookmaker {
  key: string
  title: string
  last_update: string
  markets: OddsMarket[]
}

export interface OddsMarket {
  key: string
  last_update: string
  outcomes: OddsOutcome[]
}

export interface OddsOutcome {
  name: string
  price: number
  point?: number
}

export interface OddsScoreEvent {
  id: string
  sport_key: string
  commence_time: string
  home_team: string
  away_team: string
  completed: boolean
  scores: { name: string; score: string }[] | null
  last_update: string | null
}
