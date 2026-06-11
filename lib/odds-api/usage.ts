import { createAdminClient } from '@/lib/supabase/admin'

export type UsageEndpoint = 'odds' | 'scores' | 'events' | 'event_odds'
export type UsageTrigger = 'cron' | 'admin_manual' | 'import' | 'test'

export interface UsageLog {
  endpoint: UsageEndpoint
  sport_key: string
  credits_used: number
  remaining: number | null
  triggered_by: UsageTrigger
  result_summary?: Record<string, unknown>
  error?: string | null
}

/**
 * Persiste un registro de uso de The Odds API.
 * Nunca tira — si falla el insert, solo loguea a console.
 */
export async function logOddsApiUsage(log: UsageLog): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('odds_api_usage').insert({
      endpoint: log.endpoint,
      sport_key: log.sport_key,
      credits_used: log.credits_used,
      remaining: log.remaining,
      triggered_by: log.triggered_by,
      result_summary: log.result_summary ?? null,
      error: log.error ?? null,
    })
  } catch (e) {
    console.warn('[odds-api/usage] failed to log usage', e)
  }
}
