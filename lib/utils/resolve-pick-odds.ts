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
 * Tolerancia del 10% entre odds del cliente y odds del server. Cubre drift
 * legitimo entre que se renderizo la vista y se clickeo. Si excede, rechazar.
 */
export function oddsWithinTolerance(clientOdds: number, serverOdds: number, tolerance = 0.10): boolean {
  if (!Number.isFinite(clientOdds) || clientOdds <= 0) return false
  if (!Number.isFinite(serverOdds) || serverOdds <= 0) return false
  return Math.abs(clientOdds - serverOdds) / serverOdds <= tolerance
}
