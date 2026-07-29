/**
 * Overrides visuales del bracket para partidos que fueron a prorroga o penales.
 *
 * Contexto: home_score/away_score en la DB refleja el score al minuto 90
 * (usado para settlement segun convencion bookmaker). El bracket, en cambio,
 * debe mostrar el score REAL del partido (incluye prorroga; con penales
 * muestra el score del final de ET + indicador de penales) y resaltar
 * quien avanzo.
 *
 * Cuando un partido termina en empate al 90' y va a penales, la API no
 * distingue el resultado — ambos equipos quedan con mismo score. Para el
 * bracket seteamos manualmente el equipo que avanzo.
 *
 * Formato: `<home_team>|<away_team>` (nombres exactos como en DB).
 */

export interface MatchDisplayOverride {
  home_score: number
  away_score: number
  /** Equipo que avanzo. Cuando el partido va a penales el score se queda
   * en el empate pero el highlight refleja quien paso. */
  winner: 'home' | 'away'
  /** Marca que se decidio por penales (para mostrar chip "P" en el UI). */
  via_penalties?: boolean
}

export const MATCH_DISPLAY_OVERRIDES: Record<string, MatchDisplayOverride> = {
  // R32 con settlement al 90' — el bracket muestra el score real final
  'Argentina|Cape Verde': { home_score: 3, away_score: 2, winner: 'home' },
  // R32 con penales (score en DB = score al 90 = empate)
  'Germany|Paraguay':    { home_score: 1, away_score: 1, winner: 'away', via_penalties: true },
  'Netherlands|Morocco': { home_score: 1, away_score: 1, winner: 'away', via_penalties: true },
  'Australia|Egypt':     { home_score: 1, away_score: 1, winner: 'away', via_penalties: true },
  // R16 con penales
  'Switzerland|Colombia': { home_score: 0, away_score: 0, winner: 'home', via_penalties: true },
  // QF con settlement al 90' — el bracket muestra el score real final
  'Norway|England': { home_score: 1, away_score: 2, winner: 'away' },
  'Argentina|Switzerland': { home_score: 3, away_score: 1, winner: 'home' },
  // FINAL: 0-0 al 90', Spain gano 1-0 en ET (Torres 112')
  'Spain|Argentina': { home_score: 1, away_score: 0, winner: 'home' },
}

export function getMatchDisplayOverride(homeName: string, awayName: string): MatchDisplayOverride | undefined {
  return MATCH_DISPLAY_OVERRIDES[`${homeName}|${awayName}`]
}
