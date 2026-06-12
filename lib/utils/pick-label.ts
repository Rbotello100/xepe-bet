/**
 * Convierte (market_type, pick) en label legible para mostrar al user.
 *
 * Centralizado aqui para evitar drift entre BetCard, ParlayCard, BetCardMatch,
 * MarketsPanel, queries.ts (worstBet) y otros lugares que mapean lo mismo.
 *
 * Si no se pasa home/away, devuelve labels genericos ("Local" / "Visita").
 */
export function buildPickLabel(
  market_type: string | null | undefined,
  pick: string,
  homeName?: string,
  awayName?: string,
): string {
  const home = homeName ?? 'Local'
  const away = awayName ?? 'Visita'
  const market = market_type ?? '1x2'

  switch (market) {
    case '1x2':
      if (pick === 'home' || pick === '1') return `${home} gana`
      if (pick === 'away' || pick === '2') return `${away} gana`
      if (pick === 'draw' || pick === 'X') return 'Empate'
      return pick
    case 'double_chance':
      if (pick === '1X') return `${home} o Empate`
      if (pick === 'X2') return `Empate o ${away}`
      if (pick === '12') return `${home} o ${away}`
      return pick
    case 'btts':
      if (pick === 'btts_yes') return 'Ambos anotan'
      if (pick === 'btts_no') return 'No anotan ambos'
      return pick
    case 'draw_no_bet':
      if (pick === 'dnb_home') return `${home} (sin empate)`
      if (pick === 'dnb_away') return `${away} (sin empate)`
      return pick
    case 'totals_1.5':
    case 'totals_2.5':
    case 'totals_3.5': {
      const point = market.split('_')[1]
      if (pick.startsWith('over_')) return `Más de ${point} goles`
      if (pick.startsWith('under_')) return `Menos de ${point} goles`
      return pick
    }
    default:
      return pick
  }
}
