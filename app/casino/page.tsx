import { Header } from '@/components/layout/Header'
import { requireAuth } from '@/lib/auth'
import { CasinoTabs } from '@/features/casino/components/CasinoTabs'
import { canPlayToday } from '@/features/casino/actions'
import { getLatestCasinoActivity } from '@/features/casino/queries'
import { CasinoLiveFeed } from '@/features/casino/components/CasinoLiveFeed'

export default async function CasinoPage() {
  const { profile } = await requireAuth()
  // Pre-check del gratis del dia para cada juego — el UI lo muestra y evita
  // bloquear al user con balance 0 si todavia tiene el bonus. El server
  // tambien revalida en cada game start.
  const [slotsFree, minesFree, penaltyFree, scratchFree, liveActivity] = await Promise.all([
    canPlayToday(profile.id, 'slots'),
    canPlayToday(profile.id, 'minas'),
    canPlayToday(profile.id, 'penales'),
    canPlayToday(profile.id, 'rasca'),
    getLatestCasinoActivity(20),
  ])

  return (
    <>
      <Header user={profile} />
      <div className="min-h-screen bg-gradient-to-b from-[#0F1A2E] via-[var(--background)] to-[#0A1F1A]">
        <div className="mx-auto max-w-6xl px-4 py-6">
          {/* Mini banner casino (full width) */}
          <div className="relative overflow-hidden rounded-2xl mb-6 border border-[var(--card-border)] bg-gradient-to-br from-[#0F1A2E] to-[#0A1F1A]">
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-[var(--accent)]/15 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-[var(--casino-yellow)]/10 blur-3xl pointer-events-none" />
            <div className="relative px-5 py-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-[var(--casino-cyan)] uppercase tracking-[0.3em] font-semibold mb-1">
                  Casino · Mundial 26
                </p>
                <h1 className="text-3xl font-black text-white tracking-tight">
                  CASINO <span className="text-[var(--casino-yellow)]">FIFA</span>
                </h1>
                <p className="text-xs text-slate-400 mt-1">Juega y gana créditos gratis 1 vez al día</p>
              </div>
              <div className="text-5xl animate-[float_6s_ease-in-out_infinite]">🎰</div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/40 to-transparent" />
          </div>

          {/* Layout 2 columnas: juegos izquierda, live feed derecha.
              Mobile/tablet stackea. Feed sticky en desktop para que siga
              visible al hacer scroll de las jugadas. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0">
              <CasinoTabs
                credits={profile.credits}
                userId={profile.id}
                slotsFree={slotsFree}
                minesFree={minesFree}
                penaltyFree={penaltyFree}
                scratchFree={scratchFree}
              />
            </div>

            <aside className="lg:sticky lg:top-20 lg:self-start">
              <CasinoLiveFeed items={liveActivity} />
            </aside>
          </div>
        </div>
      </div>
    </>
  )
}
