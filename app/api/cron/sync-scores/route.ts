import { NextResponse } from 'next/server'
import { syncLiveScores } from '@/lib/sync/scores'
import { hasLiveMatches } from '@/lib/sync/scheduler'

export async function POST() {
  try {
    const live = await hasLiveMatches()
    if (!live) {
      return NextResponse.json({ skipped: true, reason: 'No live matches' })
    }

    const result = await syncLiveScores()
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
