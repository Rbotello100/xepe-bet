import { NextResponse } from 'next/server'
import { generateDailyFeed } from '@/features/ai-feed/actions'
import { verifyCronAuth } from '@/lib/auth/cron'

// El endpoint puede tardar ~5-10s (llamada a Claude + DB). Pedimos timeout alto.
export const maxDuration = 60

async function handler(request: Request) {
  const unauthorized = verifyCronAuth(request)
  if (unauthorized) return unauthorized

  const result = await generateDailyFeed()
  if (result.error) {
    return NextResponse.json(result, { status: 500 })
  }
  return NextResponse.json(result)
}

// Vercel Cron llega por GET; manual/curl puede usar POST
export const GET = handler
export const POST = handler
