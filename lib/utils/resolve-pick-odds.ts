import { calculateDerivedMarkets } from './derived-odds'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BetMarket, BetPick } from '@/lib/constants'

/**
 * Dado un match con sus odds 1X2 y un pick (home/away/draw/derivado), retorna
 * las odds que el server considera correctas para ese pick. Usar server-side
 * para validar que el cliente no envio odds infladas.
 *
 * Retorna null si las odds base faltan o el pick no es reconocible.
 */
export function resolveServerOdds(
  match: { odds_home: number | null; odds_draw: number | null; odds_away: number | null },
  pick: string,
): number | null {
  const { odds_home, odds_draw, odds_away } = match
  if (!odds_home || !odds_draw || !odds_away) return null

  // 1X2 directo
  if (pick === 'home' || pick === '1') return odds_home
  if (pick === 'draw' || pick === 'X') return odds_draw
  if (pick === 'away' || pick === '2') return odds_away

  // Derivados calculados
  const markets = calculateDerivedMarkets(odds_home, odds_draw, odds_away)
  for (const market of markets) {
    const option = market.options.find(o => o.pick === pick)
    if (option) return option.odds
  }

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
 * Esto reemplaza a la calculacion derivada del cliente (que se usaba como
 * proxy hasta que tuvimos el sync de mercados extra). Las odds derivadas
 * eran aproximadas; las de match_market_odds vienen DIRECTO de Pinnacle/
 * William Hill segun cual ofrezca el mercado.
 *
 * Retorna null si no encontramos odds — el caller debe rechazar la apuesta.
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

  // Mercados extra: lee de match_market_odds
  const admin = createAdminClient()
  const { data } = await admin
    .from('match_market_odds')
    .select('odds')
    .eq('match_id', matchId)
    .eq('market_type', market_type)
    .eq('pick', pick)
    .maybeSingle()

  if (data?.odds) return Number(data.odds)

  // Fallback: si por algun motivo no tenemos la row (cron no corrio aun),
  // intentamos derivar de los 1X2 si tenemos los datos del match. Es menos
  // preciso pero permite que el user pueda apostar igual.
  if (fallbackMatch && fallbackMatch.odds_home && fallbackMatch.odds_draw && fallbackMatch.odds_away) {
    const markets = calculateDerivedMarkets(fallbackMatch.odds_home, fallbackMatch.odds_draw, fallbackMatch.odds_away)
    for (const m of markets) {
      const opt = m.options.find(o => o.pick === pick)
      if (opt) return opt.odds
    }
  }

  return null
}
