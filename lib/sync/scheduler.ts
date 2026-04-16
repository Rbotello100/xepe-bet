import { ODDS_OPEN_HOURS_BEFORE, ODDS_MAX_SYNC_ATTEMPTS, SCORE_SYNC_DELAY_MIN, SCORE_MAX_SYNC_ATTEMPTS } from '@/lib/constants'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Devuelve los partidos que necesitan sync de odds:
 * - starts_at entre ahora y ahora+24h
 * - aún no se sincearon (odds_synced = false)
 * - status scheduled u open
 * - menos de 3 intentos previos
 */
export async function getMatchesNeedingOdds(): Promise<{ id: string; external_id: string | null }[]> {
  const supabase = createAdminClient()

  const windowStart = new Date()
  const windowEnd = new Date()
  windowEnd.setHours(windowEnd.getHours() + ODDS_OPEN_HOURS_BEFORE)

  const { data } = await supabase
    .from('matches')
    .select('id, external_id')
    .eq('odds_synced', false)
    .lt('odds_sync_attempts', ODDS_MAX_SYNC_ATTEMPTS)
    .gte('starts_at', windowStart.toISOString())
    .lte('starts_at', windowEnd.toISOString())
    .in('status', ['scheduled', 'open'])

  return data ?? []
}

/**
 * Devuelve los partidos que necesitan sync de score:
 * - starts_at + 130 min ya pasó (debería estar terminado)
 * - aún no se sincearon (score_synced = false)
 * - menos de 3 intentos previos
 */
export async function getMatchesNeedingScoreSync(): Promise<{ id: string; external_id: string | null }[]> {
  const supabase = createAdminClient()

  const cutoff = new Date()
  cutoff.setMinutes(cutoff.getMinutes() - SCORE_SYNC_DELAY_MIN)

  const { data } = await supabase
    .from('matches')
    .select('id, external_id')
    .eq('score_synced', false)
    .lt('score_sync_attempts', SCORE_MAX_SYNC_ATTEMPTS)
    .lte('starts_at', cutoff.toISOString())
    .neq('status', 'finished')

  return data ?? []
}
