import { calculateDerivedMarkets } from './derived-odds'

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
