/**
 * Calculate the cash out value for a bet.
 *
 * Formula: cash_out = (odds_original / odds_current) * amount
 *
 * - If odds dropped (team doing well): cash out > amount (profit)
 * - If odds rose (team doing poorly): cash out < amount (cut losses)
 * - If odds unchanged: cash out = amount (break even)
 */
export function calculateCashOut(
  oddsAtPlacement: number,
  currentOdds: number,
  amount: number
): number {
  if (currentOdds <= 0) return 0
  return (oddsAtPlacement / currentOdds) * amount
}

/**
 * Calculate cash out for a parlay.
 * Uses total multiplier ratio instead of individual odds.
 */
export function calculateParlayCashOut(
  originalTotalOdds: number,
  currentTotalOdds: number,
  amount: number
): number {
  if (currentTotalOdds <= 0) return 0
  return (originalTotalOdds / currentTotalOdds) * amount
}
