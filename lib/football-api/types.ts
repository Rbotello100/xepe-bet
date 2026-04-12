export interface FootballFixture {
  fixture: {
    id: number
    date: string
    timestamp: number
    status: {
      long: string
      short: string // NS, 1H, HT, 2H, FT, etc.
      elapsed: number | null
    }
  }
  league: {
    id: number
    name: string
    round: string
  }
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null }
    away: { id: number; name: string; logo: string; winner: boolean | null }
  }
  goals: {
    home: number | null
    away: number | null
  }
  score: {
    halftime: { home: number | null; away: number | null }
    fulltime: { home: number | null; away: number | null }
  }
}

export interface FootballStanding {
  rank: number
  team: { id: number; name: string; logo: string }
  points: number
  goalsDiff: number
  group: string
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } }
}

export interface FootballAPIResponse<T> {
  get: string
  parameters: Record<string, string>
  errors: Record<string, string>
  results: number
  response: T[]
}
