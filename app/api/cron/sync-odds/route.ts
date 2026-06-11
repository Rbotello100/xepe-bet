import { NextResponse } from 'next/server'
import { syncMatchOdds, refreshMatchOdds } from '@/lib/sync/odds'
import { discoverAllSports } from '@/lib/sync/discover'
import { verifyCronAuth } from '@/lib/auth/cron'
import { ACTIVE_SPORT_KEYS } from '@/lib/constants'

/**
 * Cron diario (13:00 UTC = 09:00 AM Chile segun vercel.json).
 *
 * Flujo en tres pasos:
 *  1. Discover: llama /events (gratis) por cada sport activo. Linka seeds
 *     existentes con external_id o inserta matches nuevos. Asi aparecen
 *     automaticamente partidos de Mundial/EPL a medida que The Odds API
 *     los publica (incluyendo eliminatorias cuando se definen).
 *  2. Sync odds initial: para los partidos sin odds_synced=true, pega a
 *     /odds y /events/{id}/odds. ~5 creditos por partido nuevo.
 *  3. Refresh odds: para los partidos a <= 48h del kickoff que ya tienen
 *     odds, re-pide cuotas para reflejar movimiento de mercado. ~30-40
 *     creditos/dia durante el Mundial.
 */
async function handler(request: Request) {
  const unauthorized = verifyCronAuth(request)
  if (unauthorized) return unauthorized

  try {
    const discover = await discoverAllSports([...ACTIVE_SPORT_KEYS], 'cron')
    const sync = await syncMatchOdds(undefined, 'cron', 'initial')
    const refresh = await refreshMatchOdds(undefined, 'cron')
    return NextResponse.json({ discover, sync, refresh })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const GET = handler
export const POST = handler
