import { fetchEvents } from '@/lib/odds-api/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { logOddsApiUsage, type UsageTrigger } from '@/lib/odds-api/usage'
import { getRoundForMatch, getGroupForMatch } from './wc-2026-groups'

/**
 * Descubre events nuevos en The Odds API y los reconcilia con la tabla matches.
 *
 * Para cada event en /events?sport=<sportKey>:
 *   1. Si ya existe match con ese external_id → skip (idempotente).
 *   2. Si no, buscar seed match por (home_team.name, away_team.name, starts_at ±2h).
 *   3. Si encuentra seed → UPDATE external_id + sport_key. Preserva predictions/bets ya hechas.
 *   4. Si no → INSERT nuevo match (upsert teams si hace falta).
 *
 * El endpoint /events es gratuito según docs — se loguea con credits_used=0.
 */
const TIME_TOLERANCE_MS = 2 * 60 * 60 * 1000 // ±2 horas

export interface DiscoverResult {
  sport_key: string
  events_fetched: number
  linked: number
  inserted: number
  skipped: number
  errors: string[]
}

export async function discoverMatches(
  sportKey: string,
  triggeredBy: UsageTrigger = 'cron',
): Promise<DiscoverResult> {
  const admin = createAdminClient()
  const errors: string[] = []
  let events: Awaited<ReturnType<typeof fetchEvents>> = []

  try {
    events = await fetchEvents(sportKey)
  } catch (err) {
    const msg = (err as Error).message
    errors.push(`fetchEvents: ${msg}`)
    await logOddsApiUsage({
      endpoint: 'events',
      sport_key: sportKey,
      credits_used: 0,
      remaining: null,
      triggered_by: triggeredBy,
      result_summary: { events_fetched: 0, linked: 0, inserted: 0, skipped: 0 },
      error: msg,
    })
    return { sport_key: sportKey, events_fetched: 0, linked: 0, inserted: 0, skipped: 0, errors }
  }

  let linked = 0
  let inserted = 0
  let skipped = 0

  for (const event of events) {
    try {
      const { data: existing } = await admin
        .from('matches')
        .select('id')
        .eq('external_id', event.id)
        .maybeSingle()

      if (existing) {
        skipped++
        continue
      }

      const homeTeamId = await resolveOrCreateTeam(event.home_team, sportKey)
      const awayTeamId = await resolveOrCreateTeam(event.away_team, sportKey)

      if (!homeTeamId || !awayTeamId) {
        errors.push(`team resolution failed for ${event.home_team} vs ${event.away_team}`)
        continue
      }

      const commenceMs = new Date(event.commence_time).getTime()
      const windowStart = new Date(commenceMs - TIME_TOLERANCE_MS).toISOString()
      const windowEnd = new Date(commenceMs + TIME_TOLERANCE_MS).toISOString()

      const { data: seed } = await admin
        .from('matches')
        .select('id')
        .eq('home_team_id', homeTeamId)
        .eq('away_team_id', awayTeamId)
        .is('external_id', null)
        .gte('starts_at', windowStart)
        .lte('starts_at', windowEnd)
        .maybeSingle()

      if (seed) {
        const { error } = await admin
          .from('matches')
          .update({
            external_id: event.id,
            sport_key: sportKey,
            starts_at: event.commence_time,
            updated_at: new Date().toISOString(),
          })
          .eq('id', seed.id)
        if (error) errors.push(`link ${seed.id}: ${error.message}`)
        else linked++
      } else {
        const { error } = await admin.from('matches').insert({
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          starts_at: event.commence_time,
          status: 'scheduled',
          external_id: event.id,
          sport_key: sportKey,
          round: getRoundForMatch(sportKey, event.commence_time),
          group_name: getGroupForMatch(event.home_team, event.away_team),
        })
        if (error) errors.push(`insert ${event.id}: ${error.message}`)
        else inserted++
      }
    } catch (err) {
      errors.push(`event ${event.id}: ${(err as Error).message}`)
    }
  }

  await logOddsApiUsage({
    endpoint: 'events',
    sport_key: sportKey,
    credits_used: 0,
    remaining: null,
    triggered_by: triggeredBy,
    result_summary: { events_fetched: events.length, linked, inserted, skipped },
    error: errors.length > 0 ? errors.join(' | ').slice(0, 500) : null,
  })

  return { sport_key: sportKey, events_fetched: events.length, linked, inserted, skipped, errors }
}

/**
 * Corre discover para varios sports (ej. Mundial + EPL) en paralelo.
 */
export async function discoverAllSports(
  sportKeys: string[],
  triggeredBy: UsageTrigger = 'cron',
): Promise<DiscoverResult[]> {
  return Promise.all(sportKeys.map(key => discoverMatches(key, triggeredBy)))
}

/**
 * Normaliza un nombre de equipo para comparación fuzzy:
 * - lowercase
 * - strip de acentos (Unicode NFD)
 * - remueve todo lo que no sea alfanumérico (espacios, &, guiones, apóstrofes, etc.)
 *
 * Permite matchear "Bosnia & Herzegovina" ↔ "Bosnia Herzegovina" ↔ "bosniaherzegovina".
 */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

async function resolveOrCreateTeam(name: string, sportKey: string): Promise<string | null> {
  const admin = createAdminClient()

  // 1. Match exacto case-insensitive
  const { data: exact } = await admin.from('teams').select('id').ilike('name', name).maybeSingle()
  if (exact) return exact.id

  // 2. Match fuzzy: normaliza ambos lados y compara.
  //    Cubre "Bosnia & Herzegovina" vs "Bosnia Herzegovina", acentos, espacios, etc.
  const needle = normalizeTeamName(name)
  const { data: allTeams } = await admin.from('teams').select('id, name, fifa_code')
  const fuzzyHit = (allTeams ?? []).find(t => normalizeTeamName(t.name) === needle)
  if (fuzzyHit) return fuzzyHit.id

  // 3. No hay team que matchee — crear uno nuevo con fifa_code garantizado único.
  //    IMPORTANTE: NO usamos upsert con onConflict='fifa_code' porque dos teams
  //    distintos ("New Zealand" y "Newcastle United") pueden derivar al mismo
  //    fifa_code truncado, y el upsert terminaría pisando el name del existente.
  const usedCodes = new Set((allTeams ?? []).map(t => t.fifa_code))
  const fifaCode = allocateUniqueFifaCode(name, usedCodes)

  const { data: inserted, error } = await admin
    .from('teams')
    .insert({ name, fifa_code: fifaCode, flag: '⚽', group_name: sportKey === 'soccer_fifa_world_cup' ? 'X' : 'T' })
    .select('id')
    .single()

  if (error || !inserted) {
    console.warn(`[discover] failed to insert team ${name}:`, error?.message)
    return null
  }
  return inserted.id
}

/**
 * Genera un fifa_code único: primero intenta los 3 primeros chars del name,
 * y si está tomado, agrega un sufijo numérico (NEW → NE2 → NE3 ...).
 */
function allocateUniqueFifaCode(name: string, usedCodes: Set<string>): string {
  const base = sanitizeFifaCode(name)
  if (!usedCodes.has(base)) return base

  const prefix = base.substring(0, 2)
  for (let i = 2; i < 100; i++) {
    const candidate = `${prefix}${i}`
    if (!usedCodes.has(candidate)) return candidate
  }
  return `X${Math.floor(Math.random() * 99).toString().padStart(2, '0')}`
}

function sanitizeFifaCode(name: string): string {
  return name.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase() || 'XXX'
}

// Las funciones de round/group ahora viven en lib/sync/wc-2026-groups.ts —
// vienen como import en el header. Eso permite reusarlas en scripts de
// cleanup y mantenerlas sincronizadas con el mapeo oficial de equipos.
