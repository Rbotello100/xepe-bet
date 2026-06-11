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
  regions = 'eu',
  sportKey: string = SPORT_KEY,
): Promise<{ data: OddsAPIEvent[]; remaining: number }> {
  const url = `${BASE_URL}/sports/${sportKey}/odds?apiKey=${getApiKey()}&markets=${markets}&regions=${regions}&oddsFormat=decimal`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Odds API error: ${res.status}`)

  const remaining = parseInt(res.headers.get('x-requests-remaining') ?? '0', 10)
  const data: OddsAPIEvent[] = await res.json()
  return { data, remaining }
}

export async function fetchScores(
  daysFrom?: number,
  sportKey: string = SPORT_KEY,
): Promise<{ data: OddsScoreEvent[]; remaining: number }> {
  let url = `${BASE_URL}/sports/${sportKey}/scores?apiKey=${getApiKey()}&dateFormat=iso`
  if (daysFrom) url += `&daysFrom=${daysFrom}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Scores API error: ${res.status}`)

  const remaining = parseInt(res.headers.get('x-requests-remaining') ?? '0', 10)
  const data: OddsScoreEvent[] = await res.json()
  return { data, remaining }
}

export async function fetchEvents(sportKey: string = SPORT_KEY): Promise<OddsAPIEvent[]> {
  const url = `${BASE_URL}/sports/${sportKey}/events?apiKey=${getApiKey()}&dateFormat=iso`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Events API error: ${res.status}`)
  return res.json()
}

/**
 * Endpoint individual /events/{id}/odds — soporta mercados extra que el
 * endpoint principal /odds no expone (btts, double_chance, draw_no_bet,
 * alternate_totals, etc).
 *
 * Costo: `markets.length * regions.length` creditos por call. Para nuestro
 * caso (4 markets x 1 region) = 4 creditos por evento.
 *
 * Devuelve un objeto unico (no array) con bookmakers[]. La estructura interna
 * de bookmakers[].markets[].outcomes[] es identica al endpoint /odds.
 */
export async function fetchEventOdds(
  eventId: string,
  markets: string[],
  regions = 'eu',
  sportKey: string = SPORT_KEY,
): Promise<{ data: OddsAPIEvent | null; remaining: number; error?: string }> {
  const url = `${BASE_URL}/sports/${sportKey}/events/${eventId}/odds?apiKey=${getApiKey()}&markets=${markets.join(',')}&regions=${regions}&oddsFormat=decimal`
  const res = await fetch(url)
  const remaining = parseInt(res.headers.get('x-requests-remaining') ?? '0', 10)
  if (!res.ok) {
    const body = await res.text()
    return { data: null, remaining, error: `event-odds ${res.status}: ${body.slice(0, 200)}` }
  }
  const data = await res.json() as OddsAPIEvent
  return { data, remaining }
}
