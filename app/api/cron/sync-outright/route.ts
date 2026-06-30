import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { syncChampionOutright } from '@/lib/sync/outright'

// Sincroniza odds del Campeón Mundial + auto-detect settlement post-final.
// Costo: 1-2 creditos por run (1 odds + 1 scores).
// Cron schedule: 2x/dia → ~60 creditos/mes.
export const maxDuration = 30

async function handler(request: Request) {
  const unauthorized = verifyCronAuth(request)
  if (unauthorized) return unauthorized

  const result = await syncChampionOutright('cron')
  if (!result.success) return NextResponse.json(result, { status: 500 })
  return NextResponse.json(result)
}

export const GET = handler
export const POST = handler
