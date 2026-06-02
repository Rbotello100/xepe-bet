'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// ==========================================================
// Stats entretenidos para alimentar al Relator (cron + hooks).
// Todas las funciones son read-only, fire-and-forget safe y devuelven null
// si no hay data suficiente (el caller no las inyecta al contexto de Claude).
// Schema: bets, parlays, casino_sessions, matches, teams, profiles.
// ==========================================================

function isoTodayStart(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

// ----------------------------------------------------------
// 1) Crack / quemado del día — calculados en una sola pasada
// ----------------------------------------------------------
export interface MovimientoUser {
  display_name: string
  delta: number   // neto de plata hoy (positivo = ganó, negativo = perdió)
  bets: number
}

async function getMovimientosHoy(): Promise<MovimientoUser[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('bets')
    .select('user_id, amount, potential_payout, status, profile:profiles!user_id(display_name)')
    .in('status', ['won', 'lost'])
    .gte('resolved_at', isoTodayStart())

  if (!data || data.length === 0) return []

  type Row = {
    user_id: string
    amount: number | string
    potential_payout: number | string
    status: 'won' | 'lost'
    profile: { display_name: string } | { display_name: string }[] | null
  }

  const agg = new Map<string, MovimientoUser>()
  for (const row of data as unknown as Row[]) {
    const prof = unwrap(row.profile)
    const name = prof?.display_name ?? 'Alguien'
    const cur = agg.get(row.user_id) ?? { display_name: name, delta: 0, bets: 0 }
    const stake = Number(row.amount)
    if (row.status === 'won') cur.delta += Number(row.potential_payout) - stake
    else cur.delta -= stake
    cur.bets++
    agg.set(row.user_id, cur)
  }

  return [...agg.values()].map(m => ({ ...m, delta: Math.round(m.delta) }))
}

export async function getCrackDelDia(): Promise<MovimientoUser | null> {
  const movs = await getMovimientosHoy()
  const winners = movs.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta)
  return winners[0] ?? null
}

export async function getQuemadoDelDia(): Promise<MovimientoUser | null> {
  const movs = await getMovimientosHoy()
  const losers = movs.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta)
  return losers[0] ?? null
}

// ----------------------------------------------------------
// 2) Rachas de bets (ganadora / perdedora) en últimos 7 días
// ----------------------------------------------------------
export interface RachaUser {
  user_id: string
  display_name: string
  streak: number  // bets consecutivos del mismo status, contando desde el más reciente
}

async function getRachaInterna(target: 'won' | 'lost', minStreak = 2): Promise<RachaUser | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('bets')
    .select('user_id, status, resolved_at, profile:profiles!user_id(display_name)')
    .in('status', ['won', 'lost'])
    .gte('resolved_at', isoHoursAgo(24 * 7))
    .order('resolved_at', { ascending: false })

  if (!data || data.length === 0) return null

  type Row = {
    user_id: string
    status: 'won' | 'lost'
    resolved_at: string
    profile: { display_name: string } | { display_name: string }[] | null
  }

  const byUser = new Map<string, { name: string; statuses: ('won' | 'lost')[] }>()
  for (const row of data as unknown as Row[]) {
    const prof = unwrap(row.profile)
    const name = prof?.display_name ?? 'Alguien'
    const cur = byUser.get(row.user_id) ?? { name, statuses: [] }
    cur.statuses.push(row.status)
    byUser.set(row.user_id, cur)
  }

  let best: RachaUser | null = null
  for (const [user_id, { name, statuses }] of byUser) {
    if (statuses[0] !== target) continue
    let streak = 0
    for (const s of statuses) {
      if (s === target) streak++
      else break
    }
    if (streak >= minStreak && (!best || streak > best.streak)) {
      best = { user_id, display_name: name, streak }
    }
  }
  return best
}

export async function getRachaGanadora(minStreak = 2): Promise<RachaUser | null> {
  return getRachaInterna('won', minStreak)
}

export async function getRachaPerdedora(minStreak = 2): Promise<RachaUser | null> {
  return getRachaInterna('lost', minStreak)
}

// Versión específica para un user concreto (usada por hooks on-event)
export async function getRachaUsuario(userId: string): Promise<{ won: number; lost: number }> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('bets')
    .select('status, resolved_at')
    .eq('user_id', userId)
    .in('status', ['won', 'lost'])
    .gte('resolved_at', isoHoursAgo(24 * 7))
    .order('resolved_at', { ascending: false })

  let won = 0, lost = 0
  for (const row of data ?? []) {
    if (row.status === 'won') {
      if (lost > 0) break
      won++
    } else if (row.status === 'lost') {
      if (won > 0) break
      lost++
    }
  }
  return { won, lost }
}

// ----------------------------------------------------------
// 3) Parlay arriesgado (mayor total_odds pending)
// ----------------------------------------------------------
export interface ParlayArriesgado {
  display_name: string
  amount: number
  total_odds: number
  potential_payout: number
  legs: number
}

export async function getParlayArriesgado(): Promise<ParlayArriesgado | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('parlays')
    .select('amount, total_odds, potential_payout, profile:profiles!user_id(display_name), legs:parlay_legs(id)')
    .eq('status', 'pending')
    .order('total_odds', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  const prof = unwrap(data.profile as unknown as { display_name: string } | { display_name: string }[] | null)
  const legArr = data.legs as unknown as Array<{ id: string }> | null
  return {
    display_name: prof?.display_name ?? 'Alguien',
    amount: Number(data.amount),
    total_odds: Number(data.total_odds),
    potential_payout: Number(data.potential_payout),
    legs: legArr?.length ?? 0,
  }
}

// ----------------------------------------------------------
// 4) Cash out épico (mayor cash_out_amount en últimas 24h)
// ----------------------------------------------------------
export interface CashOutEpico {
  display_name: string
  stake: number
  cash_out: number
  ganancia: number
  partido: string | null
}

export async function getCashOutEpico(): Promise<CashOutEpico | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('bets')
    .select(`
      amount, cash_out_amount,
      profile:profiles!user_id(display_name),
      match:matches!match_id(home_team:teams!home_team_id(name), away_team:teams!away_team_id(name))
    `)
    .eq('status', 'cashed_out')
    .gte('cashed_out_at', isoHoursAgo(24))
    .order('cash_out_amount', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data || data.cash_out_amount == null) return null

  type ProfileRef = { display_name: string }
  type TeamRef = { name: string }
  type MatchRef = {
    home_team: TeamRef | TeamRef[] | null
    away_team: TeamRef | TeamRef[] | null
  }
  const prof = unwrap(data.profile as unknown as ProfileRef | ProfileRef[] | null)
  const match = unwrap(data.match as unknown as MatchRef | MatchRef[] | null)
  const home = unwrap(match?.home_team ?? null)
  const away = unwrap(match?.away_team ?? null)
  const partido = home && away ? `${home.name} vs ${away.name}` : null
  const stake = Number(data.amount)
  const cashOut = Number(data.cash_out_amount)

  return {
    display_name: prof?.display_name ?? 'Alguien',
    stake,
    cash_out: Math.round(cashOut),
    ganancia: Math.round(cashOut - stake),
    partido,
  }
}

// ----------------------------------------------------------
// 5) Partido caliente (más bets pending)
// ----------------------------------------------------------
export interface PartidoCaliente {
  partido: string
  total_apuestas: number
  reparto: { home: number; draw: number; away: number }
}

export async function getPartidoCaliente(): Promise<PartidoCaliente | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('bets')
    .select('match_id, pick')
    .eq('status', 'pending')
    .not('match_id', 'is', null)

  if (!data || data.length === 0) return null

  const tally = new Map<string, { home: number; draw: number; away: number; total: number }>()
  for (const row of data as { match_id: string; pick: string }[]) {
    const cur = tally.get(row.match_id) ?? { home: 0, draw: 0, away: 0, total: 0 }
    if (row.pick === 'home' || row.pick === '1') cur.home++
    else if (row.pick === 'away' || row.pick === '2') cur.away++
    else cur.draw++
    cur.total++
    tally.set(row.match_id, cur)
  }
  let topId: string | null = null
  let topCount = 0
  for (const [id, v] of tally) {
    if (v.total > topCount) {
      topCount = v.total
      topId = id
    }
  }
  if (!topId || topCount < 2) return null

  const { data: match } = await admin
    .from('matches')
    .select('home_team:teams!home_team_id(name), away_team:teams!away_team_id(name)')
    .eq('id', topId)
    .maybeSingle()
  if (!match) return null

  type TeamRef = { name: string }
  const home = unwrap(match.home_team as unknown as TeamRef | TeamRef[] | null)
  const away = unwrap(match.away_team as unknown as TeamRef | TeamRef[] | null)
  if (!home || !away) return null

  const dist = tally.get(topId)!
  return {
    partido: `${home.name} vs ${away.name}`,
    total_apuestas: dist.total,
    reparto: { home: dist.home, draw: dist.draw, away: dist.away },
  }
}

// ----------------------------------------------------------
// 6) Apostador más activo en últimas 24h
// ----------------------------------------------------------
export interface ApostadorActivo {
  display_name: string
  bets: number
  total_apostado: number
}

export async function getApostadorMasActivo24h(minBets = 3): Promise<ApostadorActivo | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('bets')
    .select('user_id, amount, profile:profiles!user_id(display_name)')
    .gte('created_at', isoHoursAgo(24))

  if (!data || data.length === 0) return null

  type Row = {
    user_id: string
    amount: number | string
    profile: { display_name: string } | { display_name: string }[] | null
  }
  const agg = new Map<string, { display_name: string; bets: number; total_apostado: number }>()
  for (const row of data as unknown as Row[]) {
    const prof = unwrap(row.profile)
    const name = prof?.display_name ?? 'Alguien'
    const cur = agg.get(row.user_id) ?? { display_name: name, bets: 0, total_apostado: 0 }
    cur.bets++
    cur.total_apostado += Number(row.amount)
    agg.set(row.user_id, cur)
  }
  let best: ApostadorActivo | null = null
  for (const v of agg.values()) {
    if (v.bets >= minBets && (!best || v.bets > best.bets)) {
      best = { ...v, total_apostado: Math.round(v.total_apostado) }
    }
  }
  return best
}

// ----------------------------------------------------------
// 7) Racha mala en casino (últimas 24h, mismo user perdiendo seguido)
// ----------------------------------------------------------
export interface CasinoRachaMala {
  user_id: string
  display_name: string
  streak: number  // perdidas consecutivas
  total_perdido: number
}

export async function getCasinoRachaMala(minStreak = 3): Promise<CasinoRachaMala | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('casino_sessions')
    .select('user_id, net_amount, created_at, profile:profiles!user_id(display_name)')
    .gte('created_at', isoHoursAgo(24))
    .order('created_at', { ascending: false })

  if (!data || data.length === 0) return null

  type Row = {
    user_id: string
    net_amount: number | string
    profile: { display_name: string } | { display_name: string }[] | null
  }
  const byUser = new Map<string, { name: string; nets: number[] }>()
  for (const row of data as unknown as Row[]) {
    const prof = unwrap(row.profile)
    const name = prof?.display_name ?? 'Alguien'
    const cur = byUser.get(row.user_id) ?? { name, nets: [] }
    cur.nets.push(Number(row.net_amount))
    byUser.set(row.user_id, cur)
  }
  let best: CasinoRachaMala | null = null
  for (const [user_id, { name, nets }] of byUser) {
    let streak = 0
    let perdido = 0
    for (const n of nets) {
      if (n < 0) {
        streak++
        perdido += -n
      } else break
    }
    if (streak >= minStreak && (!best || streak > best.streak)) {
      best = {
        user_id,
        display_name: name,
        streak,
        total_perdido: Math.round(perdido),
      }
    }
  }
  return best
}

// Versión por user (usada por hooks on-event)
export async function getCasinoRachaMalaUsuario(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('casino_sessions')
    .select('net_amount, created_at')
    .eq('user_id', userId)
    .gte('created_at', isoHoursAgo(24))
    .order('created_at', { ascending: false })

  let streak = 0
  for (const row of data ?? []) {
    if (Number(row.net_amount) < 0) streak++
    else break
  }
  return streak
}
