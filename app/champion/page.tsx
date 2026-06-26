import { Header } from '@/components/layout/Header'
import { requireAuth } from '@/lib/auth'
import { getChampionMarket, getUserOutrightBets } from '@/features/outright/queries'
import { ChampionPicker } from '@/features/outright/components/ChampionPicker'

export const dynamic = 'force-dynamic'

export default async function ChampionPage() {
  const { profile } = await requireAuth()
  const { market, outcomes } = await getChampionMarket()
  const myBets = await getUserOutrightBets(profile.id)

  return (
    <>
      <Header user={profile} active="/champion" />
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-strong">🏆 Campeón del Mundial 2026</h1>
          <p className="mt-1 text-sm text-muted">
            Apostá al que crees que va a levantar la copa el 19 de julio. Cierra cuando arrancan los octavos.
          </p>
        </div>

        {market ? (
          <ChampionPicker market={market} outcomes={outcomes} userCredits={Number(profile.credits)} />
        ) : (
          <div className="rounded-xl border border-card-border bg-card p-8 text-center">
            <p className="text-sm text-muted">Mercado todavía no disponible. Volvé en un rato.</p>
          </div>
        )}

        {myBets.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-subtle">Tus apuestas al campeón</h2>
            <div className="space-y-2">
              {myBets.map(b => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-card-border bg-card px-4 py-3">
                  <div>
                    <p className="font-semibold text-strong">{b.team_name}</p>
                    <p className="text-xs text-muted">
                      ${b.amount.toLocaleString('es-CL')} × {b.odds_at_placement.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    {b.status === 'pending' && (
                      <>
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-deep">
                          Pendiente
                        </span>
                        <p className="mt-1 font-mono text-sm font-bold text-strong">${b.potential_payout.toLocaleString('es-CL')}</p>
                      </>
                    )}
                    {b.status === 'won' && (
                      <span className="rounded-full bg-win/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-win">
                        Ganada · +${b.potential_payout.toLocaleString('es-CL')}
                      </span>
                    )}
                    {b.status === 'lost' && (
                      <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger">
                        Perdida
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
