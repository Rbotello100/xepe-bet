import { Suspense } from 'react'
import { Header } from '@/components/layout/Header'
import { AppShell } from '@/components/layout/AppShell'
import { LeftSidebar } from '@/components/layout/LeftSidebar'
import { MiniLeaderboard } from '@/components/layout/MiniLeaderboard'
import { BetslipSidebar } from '@/components/layout/BetslipSidebar'
import { MatchList } from '@/features/matches/components/MatchList'
import { MatchCardSkeleton } from '@/components/ui/Skeleton'
import { getOptionalAuth } from '@/lib/auth'
import { getActiveFeedPosts } from '@/features/ai-feed/queries'
import { getLeaderboard } from '@/features/leaderboard/queries'
import { getBestBetOfTheDay, getWorstBetOfTheDay, getPulseStats } from '@/features/bets/queries'
import { createServerClient } from '@/lib/supabase/server'

interface HomePageProps {
  searchParams: Promise<{ date?: string }>
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const auth = await getOptionalAuth()
  const supabase = await createServerClient()
  const sp = await searchParams
  // Valida la opcion contra el whitelist — evita que un valor invalido (ej
  // ?date=foo) reviente el filtro o pase como prop libre. Default: 'hoy'.
  const dateRaw = sp.date
  const dateFilter: 'hoy' | 'manana' | 'semana' | 'todos' =
    dateRaw === 'manana' || dateRaw === 'semana' || dateRaw === 'todos' ? dateRaw : 'hoy'

  const [feedPosts, leaderboard, bestBet, worstBet, pulse, matchCount, liveCount] = await Promise.all([
    // 50 mensajes alcanza para ~3min de rotacion a 4s c/u; bajado de 150 por
    // performance del SSR (cada mensaje tiene metadata jsonb).
    getActiveFeedPosts(50),
    getLeaderboard(7),
    getBestBetOfTheDay(),
    getWorstBetOfTheDay(),
    getPulseStats(),
    supabase.from('matches').select('id', { count: 'exact', head: true }).then(r => r.count ?? 0),
    supabase.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'live').then(r => r.count ?? 0),
  ])

  return (
    <>
      <Header user={auth?.profile ?? null} active="/" />
      <AppShell
        left={<LeftSidebar bestBet={bestBet} worstBet={worstBet} messages={feedPosts} />}
        right={
          <>
            <BetslipSidebar />
            <MiniLeaderboard entries={leaderboard} currentUserId={auth?.userId} />
          </>
        }
      >
        {/* Hero */}
        <section className="relative overflow-hidden rounded-xl border border-card-border bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-accent)_18%,var(--color-card)),var(--color-card)_60%)] p-7">
          {/* Cancha decorativa */}
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                'linear-gradient(90deg, transparent 49.5%, rgba(255,255,255,0.25) 49.5%, rgba(255,255,255,0.25) 50.5%, transparent 50.5%), radial-gradient(circle at center, transparent 38px, rgba(255,255,255,0.18) 38px, rgba(255,255,255,0.18) 40px, transparent 40px)',
            }}
          />
          <div className="relative space-y-5">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="mb-2 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan">
                  <span className="h-1.5 w-1.5 rounded-full bg-win" style={{ animation: 'live-pulse 1.8s infinite' }} />
                  FIFA WORLD CUP
                </p>
                <h1 className="text-[40px] font-extrabold leading-[1.05] tracking-tight text-strong">
                  Mundial <span className="text-gold">2026</span>
                </h1>
                <p className="mt-1 text-sm text-muted">Predice. Apuesta. Gana.</p>
              </div>
              <div className="flex gap-5 sm:gap-7">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-subtle">Partidos</p>
                  <p className="font-mono text-2xl font-bold text-strong">{matchCount}</p>
                </div>
                {liveCount > 0 && (
                  <div className="border-l border-card-border pl-5">
                    <p className="text-[10px] uppercase tracking-wider text-subtle">En vivo</p>
                    <p className="font-mono text-2xl font-bold text-win">{liveCount}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Pulse stats — la plata moviendose en la plataforma. Grid 2x2 en
                mobile, 4 en linea en sm+. Separados del header con border-top. */}
            <div className="grid grid-cols-2 gap-3 border-t border-card-border/60 pt-4 sm:grid-cols-4 sm:gap-5">
              <PulseStat
                label="Pozo total"
                amount={pulse.pozoTotal}
                hint="apostado histórico"
                tone="strong"
              />
              <PulseStat
                label="En juego"
                amount={pulse.pozoEnJuego}
                hint="bets pending"
                tone="accent"
                pulse
              />
              <PulseStat
                label="Pagado hoy"
                amount={pulse.pagadoHoy}
                hint="a winners 24h"
                tone="win"
              />
              <PulseStat
                label="Perdido hoy"
                amount={pulse.perdidoHoy}
                hint="bets perdidas 24h"
                tone="danger"
              />
            </div>
          </div>
        </section>

        {/* Section head */}
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-strong">
            <span className="inline-block h-5 w-1 rounded-full bg-accent" />
            Proximos partidos
          </h2>
        </div>

        <Suspense fallback={<MatchListSkeleton />} key={dateFilter}>
          <MatchList filter={dateFilter} />
        </Suspense>
      </AppShell>
    </>
  )
}

function MatchListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <MatchCardSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Stat compacto del hero. Color y opcional pulso según tone.
 * tone: 'strong' = neutro / 'accent' = morado / 'win' = verde / 'danger' = rojo
 */
function PulseStat({
  label,
  amount,
  hint,
  tone,
  pulse,
}: {
  label: string
  amount: number
  hint: string
  tone: 'strong' | 'accent' | 'win' | 'danger'
  pulse?: boolean
}) {
  const toneClass = {
    strong: 'text-strong',
    accent: 'text-accent-deep',
    win: 'text-win',
    danger: 'text-danger',
  }[tone]

  return (
    <div className="flex flex-col">
      <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-subtle">
        {pulse && (
          <span className="h-1.5 w-1.5 rounded-full bg-accent" style={{ animation: 'live-pulse 1.8s infinite' }} />
        )}
        {label}
      </p>
      <p className={`font-mono text-xl font-bold sm:text-2xl ${toneClass}`}>
        ${amount.toLocaleString('es-CL')}
      </p>
      <p className="mt-0.5 text-[10px] text-subtle">{hint}</p>
    </div>
  )
}
