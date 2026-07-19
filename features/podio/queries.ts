import { createAdminClient } from '@/lib/supabase/admin'
import { EXCLUDED_LEADERBOARD_USER_IDS } from '@/features/leaderboard/queries'

export interface Champion {
  team_name: string
  team_flag: string | null
  home_team: string
  away_team: string
  home_score: number
  away_score: number
  winner: 'home' | 'away'
}

export interface PodioUser {
  display_name: string
  avatar_url: string | null
  credits: number
  total_points: number
}

/**
 * Devuelve el campeón del Mundial si la final está terminada. Retorna null
 * si aún no se jugó la final (o está en curso). Usa el score al 90' de la
 * DB — para partidos que fueron a ET/penales, el bracket display override
 * ya ajusta cual equipo avanzó, pero acá determinamos ganador del que tiene
 * más goles al 90' (si empataron al 90 → asumimos ganador por penales que
 * está en MATCH_DISPLAY_OVERRIDES si existe).
 */
export async function getChampion(): Promise<Champion | null> {
  const admin = createAdminClient()
  const { data: match } = await admin
    .from('matches')
    .select('home_score, away_score, home_team:teams!home_team_id(name, flag), away_team:teams!away_team_id(name, flag)')
    .eq('round', 'final')
    .eq('status', 'finished')
    .maybeSingle()

  if (!match || match.home_score == null || match.away_score == null) return null
  const homeTeam = Array.isArray(match.home_team) ? match.home_team[0] : match.home_team
  const awayTeam = Array.isArray(match.away_team) ? match.away_team[0] : match.away_team

  // Si empatan al 90', chequear override del display (caso penales)
  let winner: 'home' | 'away'
  if (match.home_score > match.away_score) winner = 'home'
  else if (match.away_score > match.home_score) winner = 'away'
  else {
    // Import dinámico para evitar coupling en tiempo de compilación
    const { getMatchDisplayOverride } = await import('@/features/fixture/lib/match-display')
    const override = getMatchDisplayOverride(homeTeam.name, awayTeam.name)
    winner = override?.winner ?? 'home'
  }

  const winTeam = winner === 'home' ? homeTeam : awayTeam
  return {
    team_name: winTeam.name,
    team_flag: winTeam.flag ?? null,
    home_team: homeTeam.name,
    away_team: awayTeam.name,
    home_score: match.home_score,
    away_score: match.away_score,
    winner,
  }
}

/**
 * Top 3 users de Xepe Bet por credits (respetando EXCLUDED_LEADERBOARD_USER_IDS).
 */
export async function getPodioTop3(): Promise<PodioUser[]> {
  const admin = createAdminClient()
  let query = admin
    .from('profiles')
    .select('display_name, avatar_url, credits, total_points')
    .order('credits', { ascending: false })
    .limit(3 + EXCLUDED_LEADERBOARD_USER_IDS.length)
  if (EXCLUDED_LEADERBOARD_USER_IDS.length > 0) {
    query = query.not('id', 'in', `(${EXCLUDED_LEADERBOARD_USER_IDS.join(',')})`)
  }
  const { data } = await query
  return ((data ?? []) as PodioUser[]).slice(0, 3).map(u => ({
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    credits: Number(u.credits),
    total_points: Number(u.total_points),
  }))
}
