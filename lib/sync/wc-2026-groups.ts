// Mapeo oficial de equipos a grupos del Mundial 2026.
// Sorteo realizado el 5 de diciembre 2025 en Washington DC.
//
// Usado por:
//   - lib/sync/discover.ts: al insertar un partido nuevo, asigna group_name
//     correctamente segun los equipos (en vez de hardcodear 'X' como antes).
//   - scripts cleanups manuales: reasignar grupos a partidos viejos mal cargados.
//
// Cobertura: todos los equipos clasificados al Mundial 2026 (48 equipos en 12
// grupos de 4). Incluye variantes de nombres que devuelven distintas APIs
// (Cote d'Ivoire / Ivory Coast, Turkiye / Turkey, Czechia / Czech Republic).

export const WC_2026_TEAM_TO_GROUP: Record<string, string> = {
  // Grupo A
  'Mexico': 'A', 'South Korea': 'A', 'South Africa': 'A',
  'Czechia': 'A', 'Czech Republic': 'A',
  // Grupo B
  'Canada': 'B', 'Switzerland': 'B', 'Qatar': 'B',
  'Bosnia-Herzegovina': 'B', 'Bosnia Herzegovina': 'B',
  'Bosnia and Herzegovina': 'B', 'Bosnia & Herzegovina': 'B',
  // Grupo C
  'Brazil': 'C', 'Haiti': 'C', 'Scotland': 'C', 'Morocco': 'C',
  // Grupo D
  'United States': 'D', 'USA': 'D', 'Paraguay': 'D', 'Australia': 'D',
  'Türkiye': 'D', 'Turkiye': 'D', 'Turkey': 'D',
  // Grupo E
  'Germany': 'E', 'Ivory Coast': 'E', "Cote d'Ivoire": 'E', "Côte d'Ivoire": 'E',
  'Ecuador': 'E', 'Curaçao': 'E', 'Curacao': 'E',
  // Grupo F
  'Netherlands': 'F', 'Sweden': 'F', 'Tunisia': 'F', 'Japan': 'F',
  // Grupo G
  'Belgium': 'G', 'Iran': 'G', 'New Zealand': 'G', 'Egypt': 'G',
  // Grupo H
  'Spain': 'H', 'Saudi Arabia': 'H', 'Uruguay': 'H',
  'Cape Verde': 'H', 'Cabo Verde': 'H',
  // Grupo I
  'France': 'I', 'Senegal': 'I', 'Iraq': 'I', 'Norway': 'I',
  // Grupo J
  'Argentina': 'J', 'Algeria': 'J', 'Austria': 'J', 'Jordan': 'J',
  // Grupo K
  'Portugal': 'K', 'DR Congo': 'K', 'Democratic Republic of the Congo': 'K',
  'Uzbekistan': 'K', 'Colombia': 'K',
  // Grupo L
  'England': 'L', 'Croatia': 'L', 'Ghana': 'L', 'Panama': 'L',
}

/**
 * Devuelve el grupo (A-L) si ambos equipos pertenecen al mismo grupo, o null
 * si no se puede determinar (eliminatoria, equipo desconocido, o conflict).
 */
export function getGroupForMatch(homeTeamName: string, awayTeamName: string): string | null {
  const gHome = WC_2026_TEAM_TO_GROUP[homeTeamName]
  const gAway = WC_2026_TEAM_TO_GROUP[awayTeamName]
  if (!gHome || !gAway) return null
  if (gHome !== gAway) return null
  return gHome
}

// Fechas oficiales Mundial 2026 (UTC). Sortea cada partido por commence_time.
const WC_2026_PHASES: Array<{ until: string; round: string }> = [
  { until: '2026-06-28T00:00:00Z', round: 'group' },  // 11-27 jun: fase de grupos
  { until: '2026-07-04T00:00:00Z', round: 'r32' },    // 28 jun - 3 jul: round of 32
  { until: '2026-07-08T00:00:00Z', round: 'r16' },    // 4-7 jul: octavos
  { until: '2026-07-12T00:00:00Z', round: 'qf' },     // 9-11 jul: cuartos
  { until: '2026-07-16T00:00:00Z', round: 'sf' },     // 14-15 jul: semis
  { until: '2026-07-19T00:00:00Z', round: '3p' },     // 18 jul: 3er puesto
  { until: '2026-07-20T00:00:00Z', round: 'final' },  // 19 jul: final
]

/**
 * Devuelve el round del Mundial segun la fecha del partido (UTC).
 * Para sports no-mundial devuelve 'league'.
 */
export function getRoundForMatch(sportKey: string, startsAt?: string): string {
  if (sportKey !== 'soccer_fifa_world_cup') return 'league'
  if (!startsAt) return 'group'
  for (const phase of WC_2026_PHASES) {
    if (startsAt < phase.until) return phase.round
  }
  return 'final'
}

export function isGroupStage(startsAt: string): boolean {
  return startsAt < '2026-06-28T00:00:00Z'
}
