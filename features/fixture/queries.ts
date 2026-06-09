import { createServerClient } from '@/lib/supabase/server'
import type { MatchWithTeams, Team } from '@/lib/types'

export interface StandingRow {
  team: Team
  pj: number      // partidos jugados
  g: number       // ganados
  e: number       // empates
  p: number       // perdidos
  gf: number      // goles a favor
  gc: number      // goles en contra
  dg: number      // diferencia de gol
  pts: number     // puntos
}

export interface FixtureData {
  groups: Map<string, { matches: MatchWithTeams[]; standings: StandingRow[] }>
  knockout: {
    r32: MatchWithTeams[]
    r16: MatchWithTeams[]
    qf:  MatchWithTeams[]
    sf:  MatchWithTeams[]
    third: MatchWithTeams[]
    final: MatchWithTeams[]
  }
}

/**
 * Calcula la tabla de posiciones de un grupo a partir de los matches
 * terminados. Tiebreakers (simples): Pts → Diferencia de gol → Goles a favor.
 * No incluye head-to-head ni fair play — los oficiales FIFA son mas complejos
 * pero para visualizacion casual este orden alcanza.
 */
function buildStandings(matches: MatchWithTeams[]): StandingRow[] {
  const byTeam = new Map<string, StandingRow>()

  const ensure = (team: Team): StandingRow => {
    const existing = byTeam.get(team.id)
    if (existing) return existing
    const row: StandingRow = { team, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0 }
    byTeam.set(team.id, row)
    return row
  }

  // Aseguramos los 4 equipos del grupo aunque aun no hayan jugado — asi la
  // tabla muestra a todos los participantes desde el dia 1.
  for (const m of matches) {
    ensure(m.home_team)
    ensure(m.away_team)
  }

  // Acumulamos solo de matches finished y con scores presentes.
  for (const m of matches) {
    if (m.status !== 'finished' || m.home_score == null || m.away_score == null) continue
    const home = ensure(m.home_team)
    const away = ensure(m.away_team)
    home.pj++; away.pj++
    home.gf += m.home_score; home.gc += m.away_score
    away.gf += m.away_score; away.gc += m.home_score
    if (m.home_score > m.away_score)      { home.g++; home.pts += 3; away.p++ }
    else if (m.home_score < m.away_score) { away.g++; away.pts += 3; home.p++ }
    else                                  { home.e++; away.e++; home.pts++; away.pts++ }
  }

  // dg final + sort
  const rows = [...byTeam.values()]
  for (const r of rows) r.dg = r.gf - r.gc
  rows.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    if (b.dg !== a.dg) return b.dg - a.dg
    return b.gf - a.gf
  })
  return rows
}

/**
 * Trae todos los matches con sus teams y arma los datos del cuadro completo:
 *  - 12 grupos con matches + standings
 *  - 6 fases de eliminatorias (r32, r16, qf, sf, 3p, final)
 */
export async function getFixtureData(): Promise<FixtureData> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('matches')
    .select('*, home_team:teams!home_team_id(*), away_team:teams!away_team_id(*)')
    .order('starts_at')

  if (error) throw error
  const matches = (data ?? []) as unknown as MatchWithTeams[]

  const groups = new Map<string, { matches: MatchWithTeams[]; standings: StandingRow[] }>()
  const groupOrder = ['A','B','C','D','E','F','G','H','I','J','K','L']
  for (const letter of groupOrder) {
    const gMatches = matches.filter(m => m.group_name === letter && m.round === 'group')
    if (gMatches.length > 0) {
      groups.set(letter, { matches: gMatches, standings: buildStandings(gMatches) })
    }
  }

  const knockout = {
    r32:   matches.filter(m => m.round === 'r32'),
    r16:   matches.filter(m => m.round === 'r16'),
    qf:    matches.filter(m => m.round === 'qf'),
    sf:    matches.filter(m => m.round === 'sf'),
    third: matches.filter(m => m.round === '3p'),
    final: matches.filter(m => m.round === 'final'),
  }

  return { groups, knockout }
}
