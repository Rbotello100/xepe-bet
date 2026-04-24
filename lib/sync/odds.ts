import { fetchOdds } from '@/lib/odds-api/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMatchesNeedingOdds } from './scheduler'
import { logOddsApiUsage } from '@/lib/odds-api/usage'

type TriggeredBy = 'cron' | 'admin_manual' | 'test'

/**
 * Sincroniza odds una sola vez por partido. Multi-sport.
 *
 * Flujo:
 * 1. Lee de la BD los matches que necesitan sync (agrupados por sport_key)
 * 2. Si no hay ninguno, retorna early sin tocar la API
 * 3. Por cada sport_key con pending, 1 request a The Odds API (1 crédito c/u)
 * 4. Loguea cada call a odds_api_usage
 *
 * Resultado: 1 API call por sport con pending; cada partido sólo necesita 1 sync exitoso en su vida.
 *
 * @param sportKey override: forzar un sport específico (útil para admin manual / imports)
 * @param triggeredBy quién disparó la sync (audit trail)
 */
export async function syncMatchOdds(
  sportKey?: string,
  triggeredBy: TriggeredBy = 'cron',
) {
  const supabase = createAdminClient()

  const pending = await getMatchesNeedingOdds()
  if (pending.length === 0) {
    return { skipped: true, reason: 'No matches pending odds sync', synced: 0, by_sport: [] as SyncBucket[] }
  }

  // Agrupar por sport_key (si vino override, forzamos ese único bucket)
  const bySport = new Map<string, typeof pending>()
  if (sportKey) {
    bySport.set(sportKey, pending)
  } else {
    for (const m of pending) {
      const key = m.sport_key
      const bucket = bySport.get(key) ?? []
      bucket.push(m)
      bySport.set(key, bucket)
    }
  }

  const results: SyncBucket[] = []
  let totalSynced = 0
  let totalNotFound = 0
  let totalNoBookmaker = 0
  let lastRemaining: number | null = null

  for (const [key, matches] of bySport.entries()) {
    let synced = 0
    let notFound = 0
    let noBookmaker = 0
    let remaining: number | null = null
    let errorMsg: string | null = null

    try {
      const response = await fetchOdds('h2h', 'eu', key)
      remaining = response.remaining
      lastRemaining = remaining
      const events = response.data

      for (const match of matches) {
        if (!match.external_id) {
          await supabase.from('matches').update({ odds_sync_attempts: 999 }).eq('id', match.id)
          continue
        }

        const event = events.find(e => e.id === match.external_id)

        if (!event) {
          await supabase
            .from('matches')
            .update({ odds_sync_attempts: await incAttempts(match.id, 'odds_sync_attempts') })
            .eq('id', match.id)
          notFound++
          continue
        }

        const bookmaker = event.bookmakers.find(b => b.key === 'pinnacle') ?? event.bookmakers[0]
        const h2h = bookmaker?.markets.find(m => m.key === 'h2h')

        if (!bookmaker || !h2h) {
          await supabase
            .from('matches')
            .update({ odds_sync_attempts: await incAttempts(match.id, 'odds_sync_attempts') })
            .eq('id', match.id)
          noBookmaker++
          continue
        }

        const homeOutcome = h2h.outcomes.find(o => o.name === event.home_team)
        const drawOutcome = h2h.outcomes.find(o => o.name === 'Draw')
        const awayOutcome = h2h.outcomes.find(o => o.name === event.away_team)

        const { error } = await supabase
          .from('matches')
          .update({
            odds_home: homeOutcome?.price ?? null,
            odds_draw: drawOutcome?.price ?? null,
            odds_away: awayOutcome?.price ?? null,
            odds_updated_at: new Date().toISOString(),
            odds_synced: true,
            status: 'open',
          })
          .eq('id', match.id)

        if (!error) synced++
      }
    } catch (err) {
      errorMsg = (err as Error).message
    }

    await logOddsApiUsage({
      endpoint: 'odds',
      sport_key: key,
      credits_used: 1,
      remaining,
      triggered_by: triggeredBy,
      result_summary: { pending: matches.length, synced, not_found: notFound, no_bookmaker: noBookmaker },
      error: errorMsg,
    })

    totalSynced += synced
    totalNotFound += notFound
    totalNoBookmaker += noBookmaker
    results.push({ sport_key: key, pending: matches.length, synced, not_found: notFound, no_bookmaker: noBookmaker, remaining, error: errorMsg })
  }

  return {
    pending: pending.length,
    synced: totalSynced,
    not_found: totalNotFound,
    no_bookmaker: totalNoBookmaker,
    api_remaining: lastRemaining,
    by_sport: results,
  }
}

async function incAttempts(matchId: string, column: string): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('matches').select(column).eq('id', matchId).single()
  // @ts-expect-error dynamic column access
  const current = (data?.[column] as number | null) ?? 0
  return current + 1
}

type SyncBucket = {
  sport_key: string
  pending: number
  synced: number
  not_found: number
  no_bookmaker: number
  remaining: number | null
  error: string | null
}
