import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const apiKey = process.env.API_FOOTBALL_KEY
    if (!apiKey) return NextResponse.json({ error: 'API_FOOTBALL_KEY not set' })

    const res = await fetch('https://v3.football.api-sports.io/status', {
      headers: { 'x-apisports-key': apiKey },
    })

    if (!res.ok) {
      return NextResponse.json({ error: `API responded with ${res.status}` })
    }

    const json = await res.json()
    const account = json.response?.account
    const subscription = json.response?.subscription
    const requests = json.response?.requests

    return NextResponse.json({
      plan: subscription?.plan ?? 'unknown',
      requestsToday: requests?.current ?? 0,
      requestsLimit: requests?.limit_day ?? 0,
      account: account?.email ?? 'N/A',
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message })
  }
}
