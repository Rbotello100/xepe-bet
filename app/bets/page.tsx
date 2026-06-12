import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { requireAuth } from '@/lib/auth'
import { getUserBets, getUserParlays } from '@/features/bets/queries'
import { BetCard } from '@/features/bets/components/BetCard'
import { ParlayCard } from '@/features/bets/components/ParlayCard'
import { Button } from '@/components/ui/Button'

export default async function BetsPage() {
  const { userId, profile } = await requireAuth()
  const [bets, parlays] = await Promise.all([
    getUserBets(userId),
    getUserParlays(userId),
  ])

  const isEmpty = bets.length === 0 && parlays.length === 0

  // Separar por estado: pendientes vs cerrados (won/lost/void/cashed_out/cancelled).
  // Una bet/parlay con status='pending' va a "Activas". Cualquier otro estado va a "Cerradas".
  const pendingBets = bets.filter(b => b.status === 'pending')
  const closedBets  = bets.filter(b => b.status !== 'pending')
  const pendingParlays = parlays.filter(p => p.status === 'pending')
  const closedParlays  = parlays.filter(p => p.status !== 'pending')

  const pendingCount = pendingBets.length + pendingParlays.length
  const closedCount  = closedBets.length + closedParlays.length

  return (
    <>
      <Header user={profile} />
      <div className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-2xl font-bold text-white mb-6">Mis Apuestas</h1>

        {isEmpty ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-slate-500">Aun no has hecho apuestas</p>
            <Link href="/">
              <Button variant="secondary">Ir a partidos</Button>
            </Link>
          </div>
        ) : (
          // 2 columnas en desktop (lg+), stack en mobile/tablet.
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* IZQUIERDA: ACTIVAS (pending) */}
            <section className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--casino-yellow)]">
                Activas {pendingCount > 0 && <span className="text-slate-500 ml-1">({pendingCount})</span>}
              </h2>
              {pendingCount === 0 ? (
                <p className="text-sm text-slate-500 italic">No tenés apuestas pendientes.</p>
              ) : (
                <div className="space-y-3">
                  {pendingParlays.map(p => <ParlayCard key={p.id} parlay={p} />)}
                  {pendingBets.map(bet => <BetCard key={bet.id} bet={bet} />)}
                </div>
              )}
            </section>

            {/* DERECHA: CERRADAS (won/lost/cashed_out/void/cancelled) */}
            <section className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Cerradas {closedCount > 0 && <span className="text-slate-500 ml-1">({closedCount})</span>}
              </h2>
              {closedCount === 0 ? (
                <p className="text-sm text-slate-500 italic">Todavía no hay apuestas cerradas.</p>
              ) : (
                <div className="space-y-3">
                  {closedParlays.map(p => <ParlayCard key={p.id} parlay={p} />)}
                  {closedBets.map(bet => <BetCard key={bet.id} bet={bet} />)}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  )
}
