import { createAdminClient } from '@/lib/supabase/admin'
import type { BetMarket, BetPick } from '@/lib/constants'

/**
 * Dado un match con sus odds 1X2 y un pick (home/away/draw), retorna las odds
 * que el server considera correctas para ese pick. Usar server-side para
 * validar que el cliente no envio odds infladas.
 *
 * Solo handlea picks 1X2. Mercados extra van por resolveServerOddsExtended
 * que lee de match_market_odds. Retorna null si las odds base faltan o el
 * pick no es 1X2.
 */
export function resolveServerOdds(
  match: { odds_home: number | null; odds_draw: number | null; odds_away: number | null },
  pick: string,
): number | null {
  const { odds_home, odds_draw, odds_away } = match
  if (!odds_home || !odds_draw || !odds_away) return null

  if (pick === 'home' || pick === '1') return odds_home
  if (pick === 'draw' || pick === 'X') return odds_draw
  if (pick === 'away' || pick === '2') return odds_away

  return null
}

/**
 * Tolerancia entre odds del cliente y odds del server. Industry standard
 * pre-match es 1-2% (Pinnacle estricto) y 3-5% in-play (FanDuel/DraftKings
 * mas laxos). Usamos 3% como compromiso: cubre drift legitimo entre render
 * y click sin permitir arbitrage de price-moves grandes.
 *
 * Antes era 10% — permitia "lockear" un precio caido sin perderse la
 * apuesta. Bajado a 3% en el audit P1.
 */
export const ODDS_TOLERANCE = 0.03
export function oddsWithinTolerance(clientOdds: number, serverOdds: number, tolerance = ODDS_TOLERANCE): boolean {
  if (!Number.isFinite(clientOdds) || clientOdds <= 0) return false
  if (!Number.isFinite(serverOdds) || serverOdds <= 0) return false
  return Math.abs(clientOdds - serverOdds) / serverOdds <= tolerance
}

/**
 * Server-side resolution de odds para mercados extra (Tier 1+2).
 *
 * Estrategia:
 *  - Si market_type='1x2' -> lee de matches.odds_home/draw/away (legacy directo).
 *  - Si market_type es otro -> consulta match_market_odds donde se guardo el
 *    valor real sincronizado por el cron.
 *
 * Si no encontramos la row (cron no corrio aun, partido recien descubierto,
 * etc.), retornamos null y el caller rechaza la apuesta con "Odds no
 * disponibles". Antes tenia un fallback a calculateDerivedMarkets pero esa
 * estimacion tenia gap 5-15% vs odds reales — riesgo de subvaluacion (pagar
 * mas) o falsos rechazos por oddsWithinTolerance. Mejor pedirle al user que
 * recargue cuando el sync siguiente complete.
 */
export async function resolveServerOddsExtended(
  matchId: string,
  market_type: BetMarket,
  pick: BetPick,
  fallbackMatch?: { odds_home: number | null; odds_draw: number | null; odds_away: number | null },
): Promise<number | null> {
  // 1X2: lee directo de matches (es el dato canonico, no hay riesgo de skew).
  if (market_type === '1x2' && fallbackMatch) {
    return resolveServerOdds(fallbackMatch, pick)
  }

  // Mercados extra: SOLO match_market_odds. No fallback derivado.
  const admin = createAdminClient()
  const { data } = await admin
    .from('match_market_odds')
    .select('odds')
    .eq('match_id', matchId)
    .eq('market_type', market_type)
    .eq('pick', pick)
    .maybeSingle()

  return data?.odds ? Number(data.odds) : null
}
