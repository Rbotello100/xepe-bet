import type { OddsAPIEvent, OddsScoreEvent } from './types'
import { SPORT_KEY } from '@/lib/constants'

const BASE_URL = 'https://api.the-odds-api.com/v4'

function getApiKey(): string {
  const key = process.env.THE_ODDS_API_KEY
  if (!key) throw new Error('THE_ODDS_API_KEY is not set')
  return key
}

export async function fetchOdds(
  markets = 'h2h',
  regions = 'eu'
): Promise<{ data: OddsAPIEvent[]; remaining: number }> {
  const url = `${BASE_URL}/sports/${SPORT_KEY}/odds?apiKey=${getApiKey()}&markets=${markets}&regions=${regions}&oddsFormat=decimal`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Odds API error: ${res.status}`)

  const remaining = parseInt(res.headers.get('x-requests-remaining') ?? '0', 10)
  const data: OddsAPIEvent[] = await res.json()
  return { data, remaining }
}

export async function fetchScores(
  daysFrom?: number
): Promise<{ data: OddsScoreEvent[]; remaining: number }> {
  let url = `${BASE_URL}/sports/${SPORT_KEY}/scores?apiKey=${getApiKey()}&dateFormat=iso`
  if (daysFrom) url += `&daysFrom=${daysFrom}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Scores API error: ${res.status}`)

  const remaining = parseInt(res.headers.get('x-requests-remaining') ?? '0', 10)
  const data: OddsScoreEvent[] = await res.json()
  return { data, remaining }
}

export async function fetchEvents(): Promise<OddsAPIEvent[]> {
  const url = `${BASE_URL}/sports/${SPORT_KEY}/events?apiKey=${getApiKey()}&dateFormat=iso`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Events API error: ${res.status}`)
  return res.json()
}
