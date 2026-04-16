import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { requireAuth } from '@/lib/auth'
import { getUserBets, getUserParlays } from '@/features/bets/queries'
import { BetCard } from '@/features/bets/components/BetCard'
import { ParlayCard } from '@/features/bets/components/ParlayCard'
import { Button } from '@/components/ui/Button'
import { createServerClient } from '@/lib/supabase/server'
import { BET_LOCK_HOURS } from '@/lib/constants'

export default async function BetsPage() {
  const { userId, profile } = await requireAuth()
  const [bets, parlays] = await Promise.all([
    getUserBets(userId),
    getUserParlays(userId),
  ])

  // Fetch current odds for pending bets so cash out button can show
  const supabase = await createServerClient()
  const pendingMatchIds = [...new Set(
    bets.filter(b => b.status === 'pending' && b.match_id).map(b => b.match_id!)
  )]

  const oddsMap = new Map<string, { home: number | null; draw: number | null; away: number | null }>()
  if (pendingMatchIds.length > 0) {
    const lockCutoff = new Date()
    lockCutoff.setHours(lockCutoff.getHours() + BET_LOCK_HOURS)

    const { data: matches } = await supabase
      .from('matches')
      .select('id, odds_home, odds_draw, odds_away, starts_at')
      .in('id', pendingMatchIds)

    for (const m of matches ?? []) {
      const isLocked = new Date(m.starts_at) <= lockCutoff
      if (!isLocked) {
        oddsMap.set(m.id, { home: m.odds_home, draw: m.odds_draw, away: m.odds_away })
      }
    }
  }

  const isEmpty = bets.length === 0 && parlays.length === 0

  return (
    <>
      <Header user={profile} />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-bold text-white mb-6">Mis Apuestas</h1>

        {isEmpty ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-slate-500">Aun no has hecho apuestas</p>
            <Link href="/">
              <Button variant="secondary">Ir a partidos</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {parlays.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wider">Parlays</h2>
                <div className="space-y-3">
                  {parlays.map(p => <ParlayCard key={p.id} parlay={p} />)}
                </div>
              </div>
            )}

            {bets.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wider">Apuestas simples</h2>
                <div className="space-y-3">
                  {bets.map(bet => (
                    <BetCard
                      key={bet.id}
                      bet={bet}
                      currentOdds={oddsMap.get(bet.match_id ?? '') ?? undefined}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
