import { createServerClient } from '@/lib/supabase/server'
import { MatchCard } from './MatchCard'
import { MatchDateFilter, type DateFilter } from './MatchDateFilter'
import { getCrowdDistribution } from '@/features/bets/queries'
import type { MatchWithTeams } from '@/lib/types'

interface MatchListProps {
  filter?: DateFilter
}

/**
 * Devuelve la "key" de fecha (YYYY-MM-DD) en zona Santiago para un match.
 * Esto agrupa partidos por dia "local" del usuario chileno, evitando que un
 * partido a las 23:30 UTC aparezca en el dia siguiente cuando es de noche
 * en CL.
 */
function dayKeyChile(iso: string): string {
  const d = new Date(iso)
  // Formato es-CL con timeZone fuerza el dia local de Chile. Despues
  // reorganizamos a YYYY-MM-DD para sortear lexicograficamente.
  const parts = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const y = parts.find(p => p.type === 'year')?.value ?? ''
  const m = parts.find(p => p.type === 'month')?.value ?? ''
  const day = parts.find(p => p.type === 'day')?.value ?? ''
  return `${y}-${m}-${day}`
}

function formatDayHeader(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  // Construimos a mediodia para evitar drift de timezone.
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date).toUpperCase().replace(/\./g, '')
}

function bucketFor(filter: DateFilter, todayKey: string, tomorrowKey: string, weekEndKey: string): (key: string) => boolean {
  if (filter === 'hoy')    return (k: string) => k === todayKey
  if (filter === 'manana') return (k: string) => k === tomorrowKey
  if (filter === 'semana') return (k: string) => k >= todayKey && k <= weekEndKey
  return () => true
}

export async function MatchList({ filter = 'hoy' }: MatchListProps) {
  const supabase = await createServerClient()

  // Odds de mercados extra: paginamos en chunks de 1000 porque PostgREST
  // (Supabase) tiene un cap server-side de 1000 rows que ignora el
  // `.limit()` del cliente. Con 72 grupos + eliminatoria × 15-21 mercados
  // por partido, pasamos 1500 rows fácil. Sin paginar, los mercados de
  // los partidos "tarde en el orden" (SF/Final) caian silenciosamente
  // fuera del primer chunk y no se renderizaban.
  async function fetchAllMarketOdds() {
    const all: Array<{ match_id: string; market_type: string; pick: string; odds: number; point: number | null }> = []
    let from = 0
    const chunkSize = 1000
    while (true) {
      const { data } = await supabase
        .from('match_market_odds')
        .select('match_id, market_type, pick, odds, point')
        .range(from, from + chunkSize - 1)
      if (!data?.length) break
      all.push(...data)
      if (data.length < chunkSize) break
      from += chunkSize
    }
    return all
  }

  const [{ data, error }, crowd, marketOddsRows] = await Promise.all([
    supabase
      .from('matches')
      .select('*, home_team:teams!home_team_id(*), away_team:teams!away_team_id(*)')
      .order('starts_at'),
    getCrowdDistribution(),
    fetchAllMarketOdds(),
  ])

  if (error) {
    return (
      <div className="py-12 text-center text-red-400">
        <p>Error al cargar partidos</p>
        <p className="text-xs text-slate-500 mt-1">{error.message}</p>
      </div>
    )
  }

  const matches = (data ?? []) as unknown as MatchWithTeams[]

  if (matches.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500">
        <p className="text-lg">No hay partidos disponibles</p>
        <p className="text-sm mt-1">Los partidos apareceran cuando se sincronicen los datos</p>
      </div>
    )
  }

  // Agrupar odds extras por match_id para lookup O(1) en el render.
  type MarketOddsRow = { match_id: string; market_type: string; pick: string; odds: number; point: number | null }
  const oddsByMatch = new Map<string, Array<Omit<MarketOddsRow, 'match_id'>>>()
  for (const r of (marketOddsRows ?? []) as MarketOddsRow[]) {
    const arr = oddsByMatch.get(r.match_id) ?? []
    arr.push({ market_type: r.market_type, pick: r.pick, odds: Number(r.odds), point: r.point })
    oddsByMatch.set(r.match_id, arr)
  }

  // Pre-calculamos keys de hoy/manana/finsemana (zona Chile) UNA sola vez,
  // para reusarlos en el count de tabs y en el filtro.
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const weekEnd = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000)
  const todayKey = dayKeyChile(now.toISOString())
  const tomorrowKey = dayKeyChile(tomorrow.toISOString())
  const weekEndKey = dayKeyChile(weekEnd.toISOString())

  // Anotamos cada match con su dayKey y filtramos los que ya finalizaron
  // (no tiene sentido mostrar finished en "hoy" o "esta semana"). El cron
  // de scores marca como finished cuando termina el partido real.
  const annotated = matches
    .filter(m => m.status !== 'finished' && m.status !== 'cancelled')
    .map(m => ({ ...m, dayKey: dayKeyChile(m.starts_at) }))

  // Counts por tab para mostrar en los pills.
  const counts = {
    hoy:    annotated.filter(m => m.dayKey === todayKey).length,
    manana: annotated.filter(m => m.dayKey === tomorrowKey).length,
    semana: annotated.filter(m => m.dayKey >= todayKey && m.dayKey <= weekEndKey).length,
    todos:  annotated.length,
  }

  const fits = bucketFor(filter, todayKey, tomorrowKey, weekEndKey)
  const filtered = annotated.filter(m => fits(m.dayKey))

  // Agrupamos por dayKey ordenado cronologicamente.
  const byDay = new Map<string, typeof filtered>()
  for (const m of filtered) {
    const arr = byDay.get(m.dayKey) ?? []
    arr.push(m)
    byDay.set(m.dayKey, arr)
  }
  const days = [...byDay.keys()].sort()

  return (
    <div className="space-y-4">
      <MatchDateFilter counts={counts} active={filter} />

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-card py-10 text-center">
          <p className="text-sm font-semibold text-strong">
            {filter === 'hoy'    && 'No hay partidos hoy.'}
            {filter === 'manana' && 'No hay partidos mañana.'}
            {filter === 'semana' && 'No hay partidos esta semana.'}
            {filter === 'todos'  && 'No hay partidos próximos.'}
          </p>
          <p className="mt-1 text-xs text-subtle">
            {filter !== 'todos' && 'Probá con otro filtro o mirá todos los partidos.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {days.map(day => {
            const dayMatches = byDay.get(day)!
            return (
              <div key={day}>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-accent-deep">
                  {formatDayHeader(day)}
                  <span className="ml-2 font-mono text-[10px] font-semibold text-subtle">
                    ({dayMatches.length} {dayMatches.length === 1 ? 'partido' : 'partidos'})
                  </span>
                </h2>
                <div className="space-y-2">
                  {dayMatches.map(match => {
                    const c = crowd.get(match.id)
                    const dist = c && c.total > 0
                      ? ([
                          Math.round((c.home / c.total) * 100),
                          Math.round((c.draw / c.total) * 100),
                          Math.round((c.away / c.total) * 100),
                        ] as [number, number, number])
                      : undefined
                    const stakes = c && c.total > 0
                      ? ({
                          home: c.homeStake,
                          draw: c.drawStake,
                          away: c.awayStake,
                          total: c.totalStake,
                        })
                      : undefined
                    return (
                      <MatchCard
                        key={match.id}
                        match={match}
                        marketRows={oddsByMatch.get(match.id) ?? []}
                        dist={dist}
                        pool={c?.total}
                        stakes={stakes}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
