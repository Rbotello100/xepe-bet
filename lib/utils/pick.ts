import type { BetPick } from '@/lib/constants'

export type Winner = 'home' | 'draw' | 'away'

/**
 * Devuelve true si el `pick` del usuario coincide con el `winner` del partido.
 * Acepta los 2 formatos de pick que usa la app:
 *  - "home" | "draw" | "away" (UI legacy / API discover)
 *  - "1" | "X" | "2" (UI casino-style / 1X2 estandar)
 *
 * Antes esta logica estaba duplicada en lib/sync/scores.ts y features/admin/
 * actions.ts con implementaciones distintas, lo que abria la puerta a un drift
 * sutil cuando agregamos mercados nuevos. Centralizado aca.
 */
export function pickMatchesWinner(pick: BetPick, winner: Winner): boolean {
  if (winner === 'home') return pick === 'home' || pick === '1'
  if (winner === 'away') return pick === 'away' || pick === '2'
  return pick === 'draw' || pick === 'X'
}
