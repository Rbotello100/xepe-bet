/**
 * Calculate derived market odds from 1X2 odds.
 * These are mathematical approximations used when specific market odds aren't available from the API.
 */

export interface DerivedMarket {
  key: string
  label: string
  options: { pick: string; label: string; odds: number }[]
}

export function calculateDerivedMarkets(
  oddsHome: number,
  oddsDraw: number,
  oddsAway: number
): DerivedMarket[] {
  const markets: DerivedMarket[] = []

  // 1. Double Chance (Doble Oportunidad)
  // 1X = 1/(1/home + 1/draw), X2 = 1/(1/draw + 1/away), 12 = 1/(1/home + 1/away)
  const dc1X = round(1 / (1/oddsHome + 1/oddsDraw))
  const dcX2 = round(1 / (1/oddsDraw + 1/oddsAway))
  const dc12 = round(1 / (1/oddsHome + 1/oddsAway))

  markets.push({
    key: 'double_chance',
    label: 'Doble Oportunidad',
    options: [
      { pick: '1X', label: 'Local o Empate', odds: dc1X },
      { pick: 'X2', label: 'Empate o Visita', odds: dcX2 },
      { pick: '12', label: 'Local o Visita', odds: dc12 },
    ],
  })

  // 2. BTTS (Both Teams To Score)
  // Approximation: BTTS Yes ~ 1.8-2.0, BTTS No ~ 1.8-2.0
  // Better approximation based on implied probabilities
  const totalImplied = 1/oddsHome + 1/oddsDraw + 1/oddsAway
  const drawProb = (1/oddsDraw) / totalImplied
  const bttsYesOdds = round(Math.max(1.5, 1 / (drawProb * 1.3 + 0.15)))
  const bttsNoOdds = round(1 / (1 - 1/bttsYesOdds + 0.05))

  markets.push({
    key: 'btts',
    label: 'Ambos Marcan',
    options: [
      { pick: 'btts_yes', label: 'Si', odds: bttsYesOdds },
      { pick: 'btts_no', label: 'No', odds: bttsNoOdds },
    ],
  })

  // 3. Over/Under 2.5 Goals
  // Approximation based on draw probability (higher draw prob = lower scoring = more likely under)
  const overProb = 0.55 - drawProb * 0.3
  const over25 = round(1 / overProb)
  const under25 = round(1 / (1 - overProb + 0.05))

  markets.push({
    key: 'totals',
    label: 'Goles',
    options: [
      { pick: 'over_2.5', label: 'Mas de 2.5', odds: over25 },
      { pick: 'under_2.5', label: 'Menos de 2.5', odds: under25 },
      { pick: 'over_1.5', label: 'Mas de 1.5', odds: round(over25 * 0.55) },
      { pick: 'under_1.5', label: 'Menos de 1.5', odds: round(under25 * 1.8) },
      { pick: 'over_3.5', label: 'Mas de 3.5', odds: round(over25 * 1.7) },
      { pick: 'under_3.5', label: 'Menos de 3.5', odds: round(under25 * 0.6) },
    ],
  })

  // 4. Correct Score (most likely results)
  const homeProb = (1/oddsHome) / totalImplied
  const awayProb = (1/oddsAway) / totalImplied

  const scores = [
    { score: '1-0', prob: homeProb * 0.22 },
    { score: '2-0', prob: homeProb * 0.12 },
    { score: '2-1', prob: homeProb * 0.15 },
    { score: '0-0', prob: drawProb * 0.35 },
    { score: '1-1', prob: drawProb * 0.40 },
    { score: '2-2', prob: drawProb * 0.15 },
    { score: '0-1', prob: awayProb * 0.22 },
    { score: '0-2', prob: awayProb * 0.12 },
    { score: '1-2', prob: awayProb * 0.15 },
    { score: '3-0', prob: homeProb * 0.06 },
    { score: '3-1', prob: homeProb * 0.08 },
    { score: '0-3', prob: awayProb * 0.06 },
  ]

  markets.push({
    key: 'correct_score',
    label: 'Marcador Exacto',
    options: scores.map(s => ({
      pick: `score_${s.score}`,
      label: s.score,
      odds: round(Math.max(3, 1 / s.prob)),
    })).sort((a, b) => a.odds - b.odds),
  })

  // 5. Draw No Bet
  const dnbHome = round(1 / (homeProb / (homeProb + awayProb)))
  const dnbAway = round(1 / (awayProb / (homeProb + awayProb)))

  markets.push({
    key: 'draw_no_bet',
    label: 'Sin Empate',
    options: [
      { pick: 'dnb_home', label: 'Local', odds: dnbHome },
      { pick: 'dnb_away', label: 'Visita', odds: dnbAway },
    ],
  })

  return markets
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
