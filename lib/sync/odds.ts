import { fetchOdds, fetchEventOdds } from '@/lib/odds-api/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMatchesNeedingOdds, getMatchesForOddsRefresh } from './scheduler'
import { logOddsApiUsage } from '@/lib/odds-api/usage'

const EXTRA_MARKETS = ['btts', 'double_chance', 'draw_no_bet', 'alternate_totals', 'alternate_spreads']
type ExtraTriggeredBy = 'cron' | 'admin_manual' | 'test'

/**
 * Para 1 match ya sincronizado con h2h, llama al endpoint individual
 * /events/{eventId}/odds para extraer odds de mercados Tier 2 y upsertear
 * en `match_market_odds`. Costo: 4 mercados x 1 region = 4 creditos por call.
 *
 * Mapeos de outcomes:
 *  - btts -> 'Yes'/'No' -> pick 'btts_yes'/'btts_no'
 *  - double_chance -> 'Home or Draw' -> '1X', 'Away or Draw' -> 'X2',
 *      'Home or Away' -> '12'
 *  - draw_no_bet -> outcome.name == home_team -> 'dnb_home', else 'dnb_away'
 *  - alternate_totals -> filtrar point in (1.5, 2.5, 3.5) -> market_type
 *      'totals_1.5'/'totals_2.5'/'totals_3.5', pick 'over_X.5'/'under_X.5'
 *
 * Sanity: odds en [1.01, 99] y point exacto. Si falla, skip silencioso.
 */
async function syncExtraMarketsForMatch(
  matchId: string,
  externalId: string,
  homeTeam: string,
  awayTeam: string,
  sportKey: string,
  triggeredBy: ExtraTriggeredBy,
): Promise<{ success: boolean; remaining: number | null; rowsUpserted: number; error?: string }> {
  const supabase = createAdminClient()
  const res = await fetchEventOdds(externalId, EXTRA_MARKETS, 'eu', sportKey)

  if (res.error || !res.data) {
    await logOddsApiUsage({
      endpoint: 'event_odds',
      sport_key: sportKey,
      credits_used: EXTRA_MARKETS.length,
      remaining: res.remaining,
      triggered_by: triggeredBy,
      result_summary: { match_id: matchId, markets: EXTRA_MARKETS },
      error: res.error ?? 'no_data',
    })
    return { success: false, remaining: res.remaining, rowsUpserted: 0, error: res.error }
  }

  const event = res.data
  if (!event.bookmakers?.length) {
    return { success: false, remaining: res.remaining, rowsUpserted: 0, error: 'no_bookmaker' }
  }

  // No todos los bookmakers soportan todos los mercados (ej Pinnacle no
  // expone double_chance para el Mundial — solo William Hill). Iteramos
  // por mercado y tomamos el primer bookmaker que lo ofrezca, priorizando
  // pinnacle si esta disponible (mejores odds, menor margen).
  const collectMarket = (key: string) => {
    const prioritized = [
      event.bookmakers.find(b => b.key === 'pinnacle'),
      ...event.bookmakers.filter(b => b.key !== 'pinnacle'),
    ].filter((b): b is NonNullable<typeof b> => Boolean(b))
    for (const b of prioritized) {
      const m = b.markets.find(mk => mk.key === key)
      if (m) return m
    }
    return null
  }
  const marketsToProcess = (['btts', 'double_chance', 'draw_no_bet', 'alternate_totals', 'totals', 'alternate_spreads', 'spreads'] as const)
    .map(k => collectMarket(k))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))

  const rows: Array<{ match_id: string; market_type: string; pick: string; odds: number; point: number | null }> = []
  const sanity = (p: number | null | undefined): number | null => {
    if (p == null || !Number.isFinite(p)) return null
    if (p < 1.01 || p > 99) return null
    return Math.round(p * 100) / 100
  }
  const allowedTotalsPoints = new Set([1.5, 2.5, 3.5])

  for (const m of marketsToProcess) {
    if (m.key === 'btts') {
      for (const o of m.outcomes) {
        const price = sanity(o.price)
        if (price == null) continue
        if (o.name === 'Yes') rows.push({ match_id: matchId, market_type: 'btts', pick: 'btts_yes', odds: price, point: null })
        else if (o.name === 'No') rows.push({ match_id: matchId, market_type: 'btts', pick: 'btts_no', odds: price, point: null })
      }
    } else if (m.key === 'double_chance') {
      // Las APIs varian en el nombre: "Home or Draw" / "Draw or Home" — toleramos ambos
      const matchName = (label: string, a: string, b: string) => {
        const norm = label.toLowerCase()
        return norm.includes(a.toLowerCase()) && norm.includes(b.toLowerCase())
      }
      for (const o of m.outcomes) {
        const price = sanity(o.price)
        if (price == null) continue
        const n = o.name
        if (matchName(n, homeTeam, 'draw') || matchName(n, 'home', 'draw')) {
          rows.push({ match_id: matchId, market_type: 'double_chance', pick: '1X', odds: price, point: null })
        } else if (matchName(n, awayTeam, 'draw') || matchName(n, 'away', 'draw')) {
          rows.push({ match_id: matchId, market_type: 'double_chance', pick: 'X2', odds: price, point: null })
        } else if (matchName(n, homeTeam, awayTeam) || matchName(n, 'home', 'away')) {
          rows.push({ match_id: matchId, market_type: 'double_chance', pick: '12', odds: price, point: null })
        }
      }
    } else if (m.key === 'draw_no_bet') {
      for (const o of m.outcomes) {
        const price = sanity(o.price)
        if (price == null) continue
        if (o.name === homeTeam) rows.push({ match_id: matchId, market_type: 'draw_no_bet', pick: 'dnb_home', odds: price, point: null })
        else if (o.name === awayTeam) rows.push({ match_id: matchId, market_type: 'draw_no_bet', pick: 'dnb_away', odds: price, point: null })
      }
    } else if (m.key === 'alternate_totals' || m.key === 'totals') {
      // alternate_totals trae varios puntos; el principal `totals` solo 2.5 (en MUNDIAL 2.25)
      for (const o of m.outcomes) {
        const point = o.point
        if (point == null || !allowedTotalsPoints.has(point)) continue
        const price = sanity(o.price)
        if (price == null) continue
        const pStr = String(point) // "1.5" / "2.5" / "3.5"
        const market_type = 'totals_' + pStr
        if (o.name === 'Over') rows.push({ match_id: matchId, market_type, pick: `over_${pStr}`, odds: price, point })
        else if (o.name === 'Under') rows.push({ match_id: matchId, market_type, pick: `under_${pStr}`, odds: price, point })
      }
    } else if (m.key === 'alternate_spreads' || m.key === 'spreads') {
      // Spreads: outcomes vienen como {name: <team name>, point: ±X.5, price: <odd>}.
      // Filtramos a thresholds ±1.5, ±2.5, ±3.5 (medios goles → no hay push).
      // Mapeamos team name → 'home' / 'away'. El pick lleva el signo encoded:
      //   {name: 'Brazil', point: -1.5, price: 1.85}  → pick='home_-1.5' (si Brazil es home)
      // El evaluatePick deriva la regla del pick sin necesitar otra columna.
      const allowedSpreadAbs = new Set([1.5, 2.5, 3.5])
      for (const o of m.outcomes) {
        const point = o.point
        if (point == null) continue
        const abs = Math.abs(point)
        if (!allowedSpreadAbs.has(abs)) continue
        const price = sanity(o.price)
        if (price == null) continue
        const side = o.name === homeTeam ? 'home' : o.name === awayTeam ? 'away' : null
        if (!side) continue
        const sign = point < 0 ? '-' : '+'
        const absStr = String(abs)
        rows.push({
          match_id: matchId,
          market_type: `spreads_${absStr}`,
          pick: `${side}_${sign}${absStr}`,
          odds: price,
          point,
        })
      }
    }
  }

  let rowsUpserted = 0
  if (rows.length > 0) {
    const { error } = await supabase.from('match_market_odds').upsert(rows, {
      onConflict: 'match_id,market_type,pick',
    })
    if (!error) rowsUpserted = rows.length
  }

  await logOddsApiUsage({
    endpoint: 'event_odds',
    sport_key: sportKey,
    credits_used: EXTRA_MARKETS.length,
    remaining: res.remaining,
    triggered_by: triggeredBy,
    result_summary: { match_id: matchId, markets_returned: marketsToProcess.map(m => m.key), rows_upserted: rowsUpserted },
    error: null,
  })

  return { success: true, remaining: res.remaining, rowsUpserted }
}

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
type SyncMode = 'initial' | 'refresh'

export async function syncMatchOdds(
  sportKey?: string,
  triggeredBy: TriggeredBy = 'cron',
  mode: SyncMode = 'initial',
) {
  const supabase = createAdminClient()

  // initial = primer sync de partidos sin odds (odds_synced=false).
  // refresh = re-sync de partidos proximos al kickoff (<=48h) ya sincronizados.
  const pending = mode === 'refresh'
    ? await getMatchesForOddsRefresh()
    : await getMatchesNeedingOdds()
  if (pending.length === 0) {
    return {
      skipped: true,
      reason: mode === 'refresh' ? 'No matches en ventana de refresh' : 'No matches pending odds sync',
      synced: 0, by_sport: [] as SyncBucket[],
    }
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
          // En modo refresh el match SI tiene external_id (lo verifica getMatchesForOddsRefresh).
          // En initial, si no tiene, lo descartamos definitivo.
          if (mode === 'initial') {
            await supabase.from('matches').update({ odds_sync_attempts: 999 }).eq('id', match.id)
          }
          continue
        }

        const event = events.find(e => e.id === match.external_id)

        if (!event) {
          // En refresh, si la API no devuelve el match esta vez, no es problema —
          // las odds existentes quedan. NO incrementamos attempts.
          if (mode === 'initial') {
            await supabase
              .from('matches')
              .update({ odds_sync_attempts: await incAttempts(match.id, 'odds_sync_attempts') })
              .eq('id', match.id)
          }
          notFound++
          continue
        }

        const bookmaker = event.bookmakers.find(b => b.key === 'pinnacle') ?? event.bookmakers[0]
        const h2h = bookmaker?.markets.find(m => m.key === 'h2h')

        if (!bookmaker || !h2h) {
          if (mode === 'initial') {
            await supabase
              .from('matches')
              .update({ odds_sync_attempts: await incAttempts(match.id, 'odds_sync_attempts') })
              .eq('id', match.id)
          }
          noBookmaker++
          continue
        }

        const homeOutcome = h2h.outcomes.find(o => o.name === event.home_team)
        const drawOutcome = h2h.outcomes.find(o => o.name === 'Draw')
        const awayOutcome = h2h.outcomes.find(o => o.name === event.away_team)

        // Sanity check: cuotas validas estan en [1.01, 99]. Fuera de ese rango
        // significa bug del provider (e.g. 0.5 → cashout calculado a 2x). Mejor
        // descartar y reintentar que persistir y exponer al user.
        const sanityCheck = (price: number | null | undefined): number | null => {
          if (price === null || price === undefined) return null
          if (!Number.isFinite(price)) return null
          if (price < 1.01 || price > 99) return null
          return price
        }
        const homePrice = sanityCheck(homeOutcome?.price)
        const drawPrice = sanityCheck(drawOutcome?.price)
        const awayPrice = sanityCheck(awayOutcome?.price)

        // Si NO hay al menos una cuota razonable, no marcamos odds_synced=true
        // (asi el cron reintenta) y aumentamos attempts. En refresh, simplemente
        // mantenemos las odds anteriores sin actualizar.
        const hasUsableOdd = homePrice !== null || drawPrice !== null || awayPrice !== null
        if (!hasUsableOdd) {
          if (mode === 'initial') {
            await supabase
              .from('matches')
              .update({ odds_sync_attempts: await incAttempts(match.id, 'odds_sync_attempts') })
              .eq('id', match.id)
          }
          noBookmaker++
          continue
        }

        const { error } = await supabase
          .from('matches')
          .update({
            odds_home: homePrice,
            odds_draw: drawPrice,
            odds_away: awayPrice,
            odds_updated_at: new Date().toISOString(),
            odds_synced: true,
            status: 'open',
          })
          .eq('id', match.id)

        if (!error) {
          synced++
          // Pegamos al endpoint individual para mercados Tier 2 (4 creditos).
          // No bloquea si falla — el 1X2 ya quedo guardado y el user puede
          // apostar. Los extras se reintentan en el proximo sync.
          if (match.external_id) {
            try {
              await syncExtraMarketsForMatch(
                match.id,
                match.external_id,
                event.home_team,
                event.away_team,
                key,
                triggeredBy,
              )
            } catch { /* ignore — ya logueado dentro */ }
          }
        }
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
      result_summary: { mode, pending: matches.length, synced, not_found: notFound, no_bookmaker: noBookmaker },
      error: errorMsg,
    })

    totalSynced += synced
    totalNotFound += notFound
    totalNoBookmaker += noBookmaker
    results.push({ sport_key: key, pending: matches.length, synced, not_found: notFound, no_bookmaker: noBookmaker, remaining, error: errorMsg })
  }

  return {
    mode,
    pending: pending.length,
    synced: totalSynced,
    not_found: totalNotFound,
    no_bookmaker: totalNoBookmaker,
    api_remaining: lastRemaining,
    by_sport: results,
  }
}

/**
 * Re-sincroniza odds de partidos en ventana ODDS_REFRESH_WINDOW_HOURS (48h)
 * para reflejar movimiento del mercado (lesiones, suspensiones, etc).
 *
 * Costo: ~5 creditos por partido (1 h2h + 4 mercados extra). Para el
 * Mundial, ~6-8 partidos por dia en ventana = 30-40 creditos/dia.
 *
 * No incrementa attempts si la API no devuelve un match — las odds existentes
 * quedan validas. Sale silencioso si no hay matches en ventana.
 */
export async function refreshMatchOdds(
  sportKey?: string,
  triggeredBy: TriggeredBy = 'cron',
) {
  return syncMatchOdds(sportKey, triggeredBy, 'refresh')
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
