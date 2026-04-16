import { fetchOdds } from '@/lib/odds-api/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMatchesNeedingOdds } from './scheduler'

/**
 * Sincroniza odds una sola vez por partido.
 *
 * Flujo:
 * 1. Lee de la BD los matches que necesitan sync (ventana 24h, no syncados, < 3 intentos)
 * 2. Si no hay ninguno, retorna early sin tocar la API
 * 3. Si hay, hace 1 request a The Odds API que devuelve TODOS los events del sport
 * 4. Para cada match pendiente:
 *    - Si encuentra el event en la respuesta → actualiza odds + marca odds_synced=true
 *    - Si NO lo encuentra → solo incrementa odds_sync_attempts (3 fallidos = se rinde)
 *
 * Resultado: 1 API call por cron run; cada partido sólo necesita 1 sync exitoso en su vida.
 */
export async function syncMatchOdds() {
  const supabase = createAdminClient()

  // 1. ¿Hay partidos que necesitan sync?
  const pending = await getMatchesNeedingOdds()
  if (pending.length === 0) {
    return { skipped: true, reason: 'No matches pending odds sync', synced: 0 }
  }

  // 2. 1 API call que trae todos los events
  const { data: events, remaining } = await fetchOdds('h2h', 'eu')

  let synced = 0
  let notFound = 0
  let noBookmaker = 0

  // 3. Procesar cada partido pendiente
  for (const match of pending) {
    if (!match.external_id) {
      // Sin external_id no podemos matchear con The Odds API
      await supabase
        .from('matches')
        .update({ odds_sync_attempts: 999 }) // marca como no sincable
        .eq('id', match.id)
      continue
    }

    const event = events.find(e => e.id === match.external_id)

    if (!event) {
      // El partido no está en la respuesta — incrementar attempts, no marcar synced
      await supabase
        .from('matches')
        .update({ odds_sync_attempts: (await incAttempts(match.id, 'odds_sync_attempts')) })
        .eq('id', match.id)
      notFound++
      continue
    }

    const bookmaker = event.bookmakers.find(b => b.key === 'pinnacle') ?? event.bookmakers[0]
    if (!bookmaker) {
      await supabase
        .from('matches')
        .update({ odds_sync_attempts: (await incAttempts(match.id, 'odds_sync_attempts')) })
        .eq('id', match.id)
      noBookmaker++
      continue
    }

    const h2h = bookmaker.markets.find(m => m.key === 'h2h')
    if (!h2h) {
      await supabase
        .from('matches')
        .update({ odds_sync_attempts: (await incAttempts(match.id, 'odds_sync_attempts')) })
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

  return {
    pending: pending.length,
    synced,
    not_found: notFound,
    no_bookmaker: noBookmaker,
    api_remaining: remaining,
  }
}

async function incAttempts(matchId: string, column: string): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('matches').select(column).eq('id', matchId).single()
  // @ts-expect-error dynamic column access
  const current = (data?.[column] as number | null) ?? 0
  return current + 1
}
