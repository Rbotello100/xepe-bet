import { NextResponse } from 'next/server'
import { SPORT_KEY } from '@/lib/constants'

export async function GET() {
  try {
    const apiKey = process.env.THE_ODDS_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'THE_ODDS_API_KEY not set' })

    // Use /events endpoint (FREE, no quota cost)
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/events?apiKey=${apiKey}&dateFormat=iso`
    )

    if (!res.ok) {
      return NextResponse.json({
        error: `API responded with ${res.status}`,
        sport: SPORT_KEY,
      })
    }

    const data = await res.json()
    const remaining = res.headers.get('x-requests-remaining')

    return NextResponse.json({
      sport: SPORT_KEY,
      count: Array.isArray(data) ? data.length : 0,
      remaining,
      sample: Array.isArray(data) ? data.slice(0, 3) : data,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message })
  }
}
