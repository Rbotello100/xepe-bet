import { NextResponse } from 'next/server'
import { syncFinishedScores } from '@/lib/sync/scores'
import { verifyCronAuth } from '@/lib/auth/cron'

// 60s para cubrir multiples sports + N matches pending + autoResolveMatch en
// paralelo (settlement + addCredits). Default de Vercel es 10s y se queda corto.
export const maxDuration = 60

async function handler(request: Request) {
  const unauthorized = verifyCronAuth(request)
  if (unauthorized) return unauthorized

  try {
    const result = await syncFinishedScores()
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Vercel Cron llega por GET; manual/curl puede usar POST
export const GET = handler
export const POST = handler
