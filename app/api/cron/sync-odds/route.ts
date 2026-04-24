import { NextResponse } from 'next/server'
import { syncMatchOdds } from '@/lib/sync/odds'
import { discoverAllSports } from '@/lib/sync/discover'
import { verifyCronAuth } from '@/lib/auth/cron'
import { ACTIVE_SPORT_KEYS } from '@/lib/constants'

/**
 * Cron diario (12:00 UTC segun vercel.json).
 *
 * Flujo en dos pasos:
 *  1. Discover: llama /events (gratis) por cada sport activo. Linka seeds existentes
 *     con external_id o inserta matches nuevos. Asi aparecen automaticamente partidos
 *     de Mundial/EPL a medida que The Odds API los publica.
 *  2. Sync odds: pega 1 credito por sport con matches pendientes y guarda odds reales.
 */
async function handler(request: Request) {
  const unauthorized = verifyCronAuth(request)
  if (unauthorized) return unauthorized

  try {
    const discover = await discoverAllSports([...ACTIVE_SPORT_KEYS], 'cron')
    const sync = await syncMatchOdds(undefined, 'cron')
    return NextResponse.json({ discover, sync })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const GET = handler
export const POST = handler
