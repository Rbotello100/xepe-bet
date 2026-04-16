import type { FootballAPIResponse, FootballFixture, FootballStanding } from './types'
import { FOOTBALL_LEAGUE_ID, FOOTBALL_SEASON } from '@/lib/constants'

const BASE_URL = 'https://v3.football.api-sports.io'

function getHeaders(): HeadersInit {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) throw new Error('API_FOOTBALL_KEY is not set')
  return { 'x-apisports-key': key }
}

export async function fetchFixtures(
  leagueId = FOOTBALL_LEAGUE_ID,
  season = FOOTBALL_SEASON
): Promise<FootballFixture[]> {
  const res = await fetch(
    `${BASE_URL}/fixtures?league=${leagueId}&season=${season}`,
    { headers: getHeaders() }
  )
  if (!res.ok) throw new Error(`API-Football error: ${res.status}`)
  const json: FootballAPIResponse<FootballFixture> = await res.json()
  return json.response
}

export async function fetchLiveScores(): Promise<FootballFixture[]> {
  const res = await fetch(
    `${BASE_URL}/fixtures?live=all`,
    { headers: getHeaders() }
  )
  if (!res.ok) throw new Error(`API-Football live error: ${res.status}`)
  const json: FootballAPIResponse<FootballFixture> = await res.json()
  return json.response
}

/**
 * Trae el detalle de un fixture específico por su ID externo.
 * Usado por el sync de scores 130 min después del kickoff (1 request por partido).
 */
export async function fetchFixtureById(externalId: string): Promise<FootballFixture | null> {
  const res = await fetch(
    `${BASE_URL}/fixtures?id=${externalId}`,
    { headers: getHeaders() }
  )
  if (!res.ok) throw new Error(`API-Football fixture error: ${res.status}`)
  const json: FootballAPIResponse<FootballFixture> = await res.json()
  return json.response[0] ?? null
}

export async function fetchStandings(
  leagueId = FOOTBALL_LEAGUE_ID,
  season = FOOTBALL_SEASON
): Promise<FootballStanding[][]> {
  const res = await fetch(
    `${BASE_URL}/standings?league=${leagueId}&season=${season}`,
    { headers: getHeaders() }
  )
  if (!res.ok) throw new Error(`API-Football standings error: ${res.status}`)
  const json = await res.json()
  // standings come nested: response[0].league.standings is array of groups
  return json.response?.[0]?.league?.standings ?? []
}
