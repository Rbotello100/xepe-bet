import { Header } from '@/components/layout/Header'
import { requireAuth } from '@/lib/auth'
import { getChampionMarket, getRecentChampionBets, getUserOutrightBets } from '@/features/outright/queries'
import { ChampionPicker } from '@/features/outright/components/ChampionPicker'
import { ChampionFeed } from '@/features/outright/components/ChampionFeed'

export const dynamic = 'force-dynamic'

export default async function ChampionPage() {
  const { profile } = await requireAuth()
  const [{ market, outcomes }, recentBets, myBets] = await Promise.all([
    getChampionMarket(),
    getRecentChampionBets(50),
    getUserOutrightBets(profile.id),
  ])

  return (
    <>
      <Header user={profile} active="/champion" />
      <div className="mx-auto max-w-6xl px-4 py-5">
        {/* Heading compacto */}
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-strong">
              <span>🏆</span> Campeón Mundial 2026
            </h1>
            <p className="text-xs text-muted">Apostá al que levanta la copa el 19 de julio</p>
          </div>
        </div>

        {/* Layout 2 columnas: picker (2/3) + feed sticky (1/3) */}
        <div className="grid gap-4 lg:grid-cols-3">
          <main className="lg:col-span-2 space-y-4">
            {market ? (
              <ChampionPicker market={market} outcomes={outcomes} userCredits={Number(profile.credits)} />
            ) : (
              <div className="rounded-xl border border-card-border bg-card p-5 text-center">
                <p className="text-xs text-muted">Mercado todavía no disponible</p>
              </div>
            )}

            {myBets.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">Tus apuestas</h2>
                <div className="space-y-1.5">
                  {myBets.map(b => {
                    const won = b.status === 'won'
                    const lost = b.status === 'lost'
                    return (
                      <div key={b.id} className="flex items-center justify-between rounded-md border border-card-border bg-card px-3 py-2">
                        <div>
                          <p className="text-sm font-semibold text-strong">{b.team_name}</p>
                          <p className="text-[11px] text-muted">
                            ${b.amount.toLocaleString('es-CL')} × {b.odds_at_placement.toFixed(2)}
                          </p>
                        </div>
                        <div className="text-right">
                          {b.status === 'pending' && (
                            <>
                              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-deep">Pendiente</span>
                              <p className="mt-0.5 font-mono text-xs font-bold text-strong">${b.potential_payout.toLocaleString('es-CL')}</p>
                            </>
                          )}
                          {won && (
                            <span className="rounded-full bg-win/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-win">
                              Ganada +${b.potential_payout.toLocaleString('es-CL')}
                            </span>
                          )}
                          {lost && (
                            <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger">Perdida</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </main>

          {/* Sidebar social — sticky en desktop */}
          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-4">
              <ChampionFeed bets={recentBets} />
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}
