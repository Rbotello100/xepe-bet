import { NextResponse } from 'next/server'
import { syncMatchOdds } from '@/lib/sync/odds'
import { hasMatchesInOddsWindow } from '@/lib/sync/scheduler'

export async function POST() {
  try {
    const shouldSync = await hasMatchesInOddsWindow()
    if (!shouldSync) {
      return NextResponse.json({ skipped: true, reason: 'No matches in odds window' })
    }

    const result = await syncMatchOdds()
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
