import { unstable_cache } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Bet, BetWithMatch } from '@/lib/types'

// Default limit 50 + opcional offset para paginacion. Antes era unbounded:
// si un user activo del Mundial llegaba a 1000+ bets, /bets cargaba todos
// en una sola query. Ahora caps con sensible defaults; el caller que necesite
// mas paginate via offset.
export async function getUserBets(userId: string, limit = 50, offset = 0): Promise<BetWithMatch[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('bets')
    .select(`
      *,
      match:matches!match_id(
        *,
        home_team:teams!home_team_id(*),
        away_team:teams!away_team_id(*)
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)
  // Supabase devuelve relaciones como objeto/array según cardinalidad — normalizamos.
  return (data ?? []).map((row: Record<string, unknown>) => {
    const m = row.match as unknown
    const match = Array.isArray(m) ? m[0] : m
    if (match) {
      if (Array.isArray((match as { home_team?: unknown }).home_team)) {
        (match as { home_team: unknown }).home_team = (match as { home_team: unknown[] }).home_team[0]
      }
      if (Array.isArray((match as { away_team?: unknown }).away_team)) {
        (match as { away_team: unknown }).away_team = (match as { away_team: unknown[] }).away_team[0]
      }
    }
    return { ...row, match } as BetWithMatch
  })
}

export async function getPendingBets(userId: string, limit = 50): Promise<Bet[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('bets')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []) as Bet[]
}

export interface ParlayWithLegs {
  id: string
  user_id: string
  amount: number
  total_odds: number
  potential_payout: number
  status: string
  created_at: string
  legs: {
    id: string
    match_id: string
    market_type: string
    pick: string
    odds: number
    status: string
    match?: {
      home_team?: { name: string }
      away_team?: { name: string }
    }
  }[]
}

export async function getUserParlays(userId: string, limit = 50, offset = 0): Promise<ParlayWithLegs[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('parlays')
    .select('*, legs:parlay_legs(*, match:matches!match_id(home_team:teams!home_team_id(name), away_team:teams!away_team_id(name)))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ParlayWithLegs[]
}

// ==========================================================
// Stats globales de la plataforma — widget "Pulso del Mundial" en el hero
// de la home. Total acumulado + del día (24h).
// ==========================================================
export interface PulseStats {
  pozoTotal: number       // Stakes históricos (bets + parlays) — todo lo apostado siempre
  pozoEnJuego: number     // Stakes pending — plata corriendo riesgo ahora
  pagadoHoy: number       // Wins acreditados a winners en últimas 24h
  perdidoHoy: number      // Stakes de bets perdidas en últimas 24h
}

export async function getPulseStats(): Promise<PulseStats> {
  const admin = createAdminClient()
  // RPC SQL hace los 4 SUM en una sola query, atómico y sin riesgo de
  // truncamiento del SDK (1000 rows default).
  const { data } = await admin.rpc('pulse_stats').single()
  type Row = { pozo_total: number; pozo_en_juego: number; pagado_hoy: number; perdido_hoy: number }
  const d = data as Row | null
  return {
    pozoTotal: Math.round(Number(d?.pozo_total ?? 0)),
    pozoEnJuego: Math.round(Number(d?.pozo_en_juego ?? 0)),
    pagadoHoy: Math.round(Number(d?.pagado_hoy ?? 0)),
    perdidoHoy: Math.round(Number(d?.perdido_hoy ?? 0)),
  }
}

// ==========================================================
// Best Bet of the day — used in the left sidebar widget.
// Returns null if no pending bet was placed today (no mock fallback).
// ==========================================================
export interface BestBetData {
  user: string
  avatar: string | null
  label: string
  stake: number
  odds: number
  payout: number
  backers: number
  // Extra para modal de detalle
  bet_id: string
  match_id: string
  home_team: string
  away_team: string
  home_flag: string | null
  away_flag: string | null
  starts_at: string | null
  market_type: string
  pick: string
  created_at: string
  match_status: string
}

export async function getBestBetOfTheDay(): Promise<BestBetData | null> {
  const admin = createAdminClient()
  // Ventana ULTIMAS 24h en vez de "hoy en UTC". Antes con `today UTC` los
  // partidos jugados de tarde en Chile (UTC-4) que cruzan medianoche UTC
  // quedaban "ayer" y el widget desaparecia.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: bet } = await admin
    .from('bets')
    .select(`
      id, amount, odds_at_placement, potential_payout, pick, market_type, match_id, created_at,
      user:profiles!user_id(display_name, avatar_url),
      match:matches!match_id(status, starts_at, home_team:teams!home_team_id(name, flag), away_team:teams!away_team_id(name, flag))
    `)
    .eq('status', 'pending')
    .gte('created_at', cutoff)
    .order('potential_payout', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!bet) return null

  // Backers: cuantos users mas tienen el mismo pick en el mismo match
  const { count: backers } = await admin
    .from('bets')
    .select('id', { count: 'exact', head: true })
    .eq('match_id', bet.match_id)
    .eq('pick', bet.pick)

  type MatchedBet = {
    id: string
    amount: number
    odds_at_placement: number
    potential_payout: number
    pick: string
    market_type: string
    match_id: string
    created_at: string
    user: { display_name: string; avatar_url: string | null } | { display_name: string; avatar_url: string | null }[]
    match: {
      status: string
      starts_at: string
      home_team: { name: string; flag: string | null } | { name: string; flag: string | null }[]
      away_team: { name: string; flag: string | null } | { name: string; flag: string | null }[]
    } | null
  }
  const b = bet as unknown as MatchedBet
  const userObj = Array.isArray(b.user) ? b.user[0] : b.user
  const matchObj = b.match
  const homeObj = matchObj ? (Array.isArray(matchObj.home_team) ? matchObj.home_team[0] : matchObj.home_team) : null
  const awayObj = matchObj ? (Array.isArray(matchObj.away_team) ? matchObj.away_team[0] : matchObj.away_team) : null

  const label = b.pick === 'home' || b.pick === '1'
    ? `${homeObj?.name ?? 'Local'} gana`
    : b.pick === 'away' || b.pick === '2'
    ? `${awayObj?.name ?? 'Visita'} gana`
    : 'Empate'

  return {
    user: userObj?.display_name ?? 'Anonimo',
    avatar: userObj?.avatar_url ?? null,
    label,
    stake: Number(b.amount),
    odds: Number(b.odds_at_placement),
    payout: Number(b.potential_payout),
    backers: backers ?? 1,
    bet_id: b.id,
    match_id: b.match_id,
    home_team: homeObj?.name ?? 'Local',
    away_team: awayObj?.name ?? 'Visita',
    home_flag: homeObj?.flag ?? null,
    away_flag: awayObj?.flag ?? null,
    starts_at: matchObj?.starts_at ?? null,
    market_type: b.market_type ?? '1x2',
    pick: b.pick,
    created_at: b.created_at,
    match_status: matchObj?.status ?? 'open',
  }
}

// ==========================================================
// Best Parlay of the day — parlay pending con mayor potential_payout hoy.
// Similar al BestBet pero para parlays multi-leg.
// ==========================================================
export interface BestParlayLeg {
  home_team: string
  away_team: string
  home_flag: string | null
  away_flag: string | null
  market_type: string
  pick: string
  odds: number
}
export interface BestParlayData {
  user: string
  avatar: string | null
  stake: number
  total_odds: number
  payout: number
  parlay_id: string
  created_at: string
  legs: BestParlayLeg[]
}

export async function getBestParlayOfTheDay(): Promise<BestParlayData | null> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: parlay } = await admin
    .from('parlays')
    .select(`
      id, amount, total_odds, potential_payout, created_at,
      user:profiles!user_id(display_name, avatar_url)
    `)
    .eq('status', 'pending')
    .gte('created_at', cutoff)
    .order('potential_payout', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!parlay) return null

  const { data: legs } = await admin
    .from('parlay_legs')
    .select('market_type, pick, odds, match:matches!match_id(home_team:teams!home_team_id(name, flag), away_team:teams!away_team_id(name, flag))')
    .eq('parlay_id', parlay.id)

  type L = {
    market_type: string
    pick: string
    odds: number
    match: {
      home_team: { name: string; flag: string | null } | { name: string; flag: string | null }[]
      away_team: { name: string; flag: string | null } | { name: string; flag: string | null }[]
    } | null
  }
  const parsedLegs: BestParlayLeg[] = ((legs ?? []) as unknown as L[]).map(l => {
    const home = l.match ? (Array.isArray(l.match.home_team) ? l.match.home_team[0] : l.match.home_team) : null
    const away = l.match ? (Array.isArray(l.match.away_team) ? l.match.away_team[0] : l.match.away_team) : null
    return {
      home_team: home?.name ?? 'Local',
      away_team: away?.name ?? 'Visita',
      home_flag: home?.flag ?? null,
      away_flag: away?.flag ?? null,
      market_type: l.market_type ?? '1x2',
      pick: l.pick,
      odds: Number(l.odds),
    }
  })

  const userObj = Array.isArray(parlay.user) ? parlay.user[0] : parlay.user
  return {
    user: userObj?.display_name ?? 'Anonimo',
    avatar: userObj?.avatar_url ?? null,
    stake: Number(parlay.amount),
    total_odds: Number(parlay.total_odds),
    payout: Number(parlay.potential_payout),
    parlay_id: parlay.id,
    created_at: parlay.created_at,
    legs: parsedLegs,
  }
}

// ==========================================================
// "Peor pifia del día" — la bet LOST con mayor stake en el día.
// Contrapunto al BestBet: muestra a quien perdió más plata hoy.
// ==========================================================
export interface WorstBetData {
  user: string
  avatar: string | null
  label: string
  stake: number
  odds: number
  perdio: number
  matchLabel: string
  // Extra para modal de detalle
  bet_id: string
  match_id: string
  home_team: string
  away_team: string
  home_flag: string | null
  away_flag: string | null
  home_score: number | null
  away_score: number | null
  market_type: string
  pick: string
  created_at: string
  resolved_at: string
}

export async function getWorstBetOfTheDay(): Promise<WorstBetData | null> {
  const admin = createAdminClient()
  // Ventana ultimas 24h (mismo que BestBet) — evita el bug de TZ donde un
  // partido jugado tarde en Chile cae en "ayer UTC" y desaparece del widget.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: bet } = await admin
    .from('bets')
    .select(`
      id, amount, odds_at_placement, pick, market_type, resolved_at, created_at, match_id,
      user:profiles!user_id(display_name, avatar_url),
      match:matches!match_id(home_score, away_score, home_team:teams!home_team_id(name, flag), away_team:teams!away_team_id(name, flag))
    `)
    .eq('status', 'lost')
    .gte('resolved_at', cutoff)
    .order('amount', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!bet) return null

  type MatchedBet = {
    id: string
    amount: number
    odds_at_placement: number
    pick: string
    market_type: string | null
    resolved_at: string
    created_at: string
    match_id: string
    user: { display_name: string; avatar_url: string | null } | { display_name: string; avatar_url: string | null }[]
    match: {
      home_score: number | null
      away_score: number | null
      home_team: { name: string; flag: string | null } | { name: string; flag: string | null }[]
      away_team: { name: string; flag: string | null } | { name: string; flag: string | null }[]
    } | null
  }
  const b = bet as unknown as MatchedBet
  const userObj = Array.isArray(b.user) ? b.user[0] : b.user
  const matchObj = b.match
  const homeObj = matchObj ? (Array.isArray(matchObj.home_team) ? matchObj.home_team[0] : matchObj.home_team) : null
  const awayObj = matchObj ? (Array.isArray(matchObj.away_team) ? matchObj.away_team[0] : matchObj.away_team) : null
  const homeName = homeObj?.name ?? 'Local'
  const awayName = awayObj?.name ?? 'Visita'

  function pickLabel(market: string | null, pick: string): string {
    if (!market || market === '1x2') {
      if (pick === 'home' || pick === '1') return `${homeName} ganaba`
      if (pick === 'away' || pick === '2') return `${awayName} ganaba`
      return 'Empate'
    }
    if (market === 'double_chance') {
      if (pick === '1X') return `${homeName} o Empate`
      if (pick === 'X2') return `Empate o ${awayName}`
      if (pick === '12') return `${homeName} o ${awayName}`
    }
    if (market === 'btts') return pick === 'btts_yes' ? 'Ambos anotaban' : 'Ninguno anotaba'
    if (market === 'draw_no_bet') return pick === 'dnb_home' ? `${homeName} (sin empate)` : `${awayName} (sin empate)`
    if (market.startsWith('totals_')) {
      const pt = market.split('_')[1]
      if (pick.startsWith('over_')) return `Más de ${pt} goles`
      if (pick.startsWith('under_')) return `Menos de ${pt} goles`
    }
    return pick
  }

  return {
    user: userObj?.display_name ?? 'Anonimo',
    avatar: userObj?.avatar_url ?? null,
    label: pickLabel(b.market_type, b.pick),
    stake: Number(b.amount),
    odds: Number(b.odds_at_placement),
    perdio: Number(b.amount),
    matchLabel: `${homeName} vs ${awayName}`,
    bet_id: b.id,
    match_id: b.match_id,
    home_team: homeName,
    away_team: awayName,
    home_flag: homeObj?.flag ?? null,
    away_flag: awayObj?.flag ?? null,
    home_score: matchObj?.home_score ?? null,
    away_score: matchObj?.away_score ?? null,
    market_type: b.market_type ?? '1x2',
    pick: b.pick,
    created_at: b.created_at,
    resolved_at: b.resolved_at,
  }
}

// ==========================================================
// Crowd distribution per match (for MatchCard pickbar).
// Returns map of matchId -> conteos y stakes por bucket 1X2.
//
// IMPORTANTE: solo cuenta bets de market_type='1x2'. Las bets de mercados
// extra (BTTS, DNB, totals, doble chance) NO entran en la distribucion —
// la barrita es exclusivamente del mercado 1X2. Antes este filtro NO
// existia y cada BTTS/DNB/total caia al bucket "draw" (default del else),
// distorsionando la barra.
//
// Tambien acumulamos amount por bucket para mostrar al user no solo cuanta
// gente apuesta sino cuanta plata movio cada opcion.
// ==========================================================
export interface MatchCrowd {
  home: number
  draw: number
  away: number
  total: number
  homeStake: number
  drawStake: number
  awayStake: number
  totalStake: number
}

// La distribucion no necesita ser real-time — cambia gradualmente. Cachear
// 30s reduce drásticamente la carga del seq scan de bets pending en cada
// page load. Como devuelve un Map (no serializable), envolvemos el computo
// en una funcion que devuelve un Array y reconstruimos el Map al final.
const _crowdDistArr = unstable_cache(
  async () => {
    const admin = createAdminClient()
    const { data } = await admin.from('bets')
      .select('match_id, pick, amount')
      .eq('status', 'pending')
      .eq('market_type', '1x2')
    const map = new Map<string, MatchCrowd>()
    for (const row of (data ?? []) as { match_id: string; pick: string; amount: number }[]) {
      if (!row.match_id) continue
      const cur = map.get(row.match_id) ?? {
        home: 0, draw: 0, away: 0, total: 0,
        homeStake: 0, drawStake: 0, awayStake: 0, totalStake: 0,
      }
      const stake = Number(row.amount) || 0
      if (row.pick === 'home' || row.pick === '1') {
        cur.home++; cur.homeStake += stake
      } else if (row.pick === 'away' || row.pick === '2') {
        cur.away++; cur.awayStake += stake
      } else if (row.pick === 'draw' || row.pick === 'X') {
        cur.draw++; cur.drawStake += stake
      } else {
        // No deberia pasar (el filtro market_type='1x2' garantiza picks 1X2)
        // pero por defensa NO lo metemos al draw bucket — lo ignoramos para
        // no contaminar la distribucion.
        continue
      }
      cur.total++; cur.totalStake += stake
      map.set(row.match_id, cur)
    }
    return [...map.entries()] as [string, MatchCrowd][]
  },
  ['crowd-distribution'],
  { revalidate: 30, tags: ['crowd-distribution'] },
)

export async function getCrowdDistribution(): Promise<Map<string, MatchCrowd>> {
  const arr = await _crowdDistArr()
  return new Map(arr)
}
