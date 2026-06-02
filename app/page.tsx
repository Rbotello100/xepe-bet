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
import { getBestBetOfTheDay } from '@/features/bets/queries'
import { createServerClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const auth = await getOptionalAuth()
  const supabase = await createServerClient()

  const [feedPosts, leaderboard, bestBet, matchCount, liveCount] = await Promise.all([
    getActiveFeedPosts(10),
    getLeaderboard(7),
    getBestBetOfTheDay(),
    supabase.from('matches').select('id', { count: 'exact', head: true }).then(r => r.count ?? 0),
    supabase.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'live').then(r => r.count ?? 0),
  ])

  return (
    <>
      <Header user={auth?.profile ?? null} active="/" />
      <AppShell
        left={<LeftSidebar bestBet={bestBet} messages={feedPosts} />}
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
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
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
        </section>

        {/* Section head */}
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-strong">
            <span className="inline-block h-5 w-1 rounded-full bg-accent" />
            Proximos partidos
          </h2>
        </div>

        <Suspense fallback={<MatchListSkeleton />}>
          <MatchList />
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
