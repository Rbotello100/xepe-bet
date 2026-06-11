import type { BetMarket, BetPick } from '@/lib/constants'

export type Winner = 'home' | 'draw' | 'away'

/**
 * Resultado de evaluar un pick contra el score final del partido.
 *  - 'won':  la apuesta ganó → addCredits con potential_payout
 *  - 'lost': la apuesta perdió → ya está descontado el stake, fin
 *  - 'void': la apuesta se anula (ej Draw No Bet con empate) → refund del stake
 */
export type EvalResult = 'won' | 'lost' | 'void'

/**
 * Devuelve true si el pick 1X2 coincide con el winner. Mantenido por compat
 * con codigo legacy que solo trabaja con 1X2 (ej. predicciones). Para bets
 * y parlay_legs usar evaluatePick que ramifica por market_type.
 */
export function pickMatchesWinner(pick: BetPick, winner: Winner): boolean {
  if (winner === 'home') return pick === 'home' || pick === '1'
  if (winner === 'away') return pick === 'away' || pick === '2'
  return pick === 'draw' || pick === 'X'
}

/**
 * Evaluador central de TODOS los mercados soportados. Recibe market_type +
 * pick + scores y decide won/lost/void. Single source of truth para
 * settlement — usado en lib/sync/scores.ts (autoResolveMatch) y en
 * features/admin/actions.ts (resolveMatch manual).
 *
 * Reglas (industria estandar, alineadas con FanDuel/DraftKings/Pinnacle):
 *  - 1X2: gana home / draw / away segun score final 90 min + injury time.
 *  - Doble chance (1X/X2/12): cubre 2 de los 3 resultados de 1X2.
 *  - BTTS: ambos equipos anotan al menos 1 gol.
 *  - Draw No Bet (DNB): si hay empate -> void (refund). Si gana home/away,
 *    se evalua como 1X2 normal contra el pick.
 *  - Over/Under X.5: total > X.5 (over) o < X.5 (under). Como X siempre es
 *    decimal terminado en .5, no hay caso de empate (push).
 */
export function evaluatePick(
  market_type: BetMarket,
  pick: BetPick,
  home_score: number,
  away_score: number,
): EvalResult {
  const total = home_score + away_score
  const homeWon = home_score > away_score
  const awayWon = away_score > home_score
  const draw = home_score === away_score

  switch (market_type) {
    case '1x2': {
      if (pick === 'home' || pick === '1') return homeWon ? 'won' : 'lost'
      if (pick === 'away' || pick === '2') return awayWon ? 'won' : 'lost'
      if (pick === 'draw' || pick === 'X') return draw ? 'won' : 'lost'
      return 'lost'
    }

    case 'double_chance': {
      // 1X = no pierde local | X2 = no pierde visita | 12 = no hay empate
      if (pick === '1X') return (homeWon || draw) ? 'won' : 'lost'
      if (pick === 'X2') return (awayWon || draw) ? 'won' : 'lost'
      if (pick === '12') return !draw ? 'won' : 'lost'
      return 'lost'
    }

    case 'btts': {
      const bothScored = home_score > 0 && away_score > 0
      if (pick === 'btts_yes') return bothScored ? 'won' : 'lost'
      if (pick === 'btts_no')  return !bothScored ? 'won' : 'lost'
      return 'lost'
    }

    case 'draw_no_bet': {
      // Empate -> void (refund stake). Sin empate, gana el equipo del pick.
      if (draw) return 'void'
      if (pick === 'dnb_home') return homeWon ? 'won' : 'lost'
      if (pick === 'dnb_away') return awayWon ? 'won' : 'lost'
      return 'lost'
    }

    case 'totals_1.5':
    case 'totals_2.5':
    case 'totals_3.5': {
      // Extraer threshold del market_type. "totals_2.5" -> 2.5
      const threshold = Number(market_type.split('_')[1])
      const overWon = total > threshold
      if (pick === 'over_1.5' || pick === 'over_2.5' || pick === 'over_3.5') {
        // Validar coherencia: pick debe matchear el threshold del market
        const pickThreshold = Number(pick.split('_')[1])
        if (pickThreshold !== threshold) return 'lost'
        return overWon ? 'won' : 'lost'
      }
      if (pick === 'under_1.5' || pick === 'under_2.5' || pick === 'under_3.5') {
        const pickThreshold = Number(pick.split('_')[1])
        if (pickThreshold !== threshold) return 'lost'
        return !overWon ? 'won' : 'lost'
      }
      return 'lost'
    }
  }
}
