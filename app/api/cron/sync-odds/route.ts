import { NextResponse } from 'next/server'
import { syncMatchOdds } from '@/lib/sync/odds'
import { verifyCronAuth } from '@/lib/auth/cron'

async function handler(request: Request) {
  const unauthorized = verifyCronAuth(request)
  if (unauthorized) return unauthorized

  try {
    const result = await syncMatchOdds()
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Vercel Cron llega por GET; manual/curl puede usar POST
export const GET = handler
export const POST = handler
