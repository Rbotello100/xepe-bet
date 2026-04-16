import { Header } from '@/components/layout/Header'
import { requireAuth } from '@/lib/auth'
import { CasinoTabs } from '@/features/casino/components/CasinoTabs'

export default async function CasinoPage() {
  const { profile } = await requireAuth()

  return (
    <>
      <Header user={profile} />
      <div className="min-h-screen bg-gradient-to-b from-[#0F1A2E] via-[var(--background)] to-[#0A1F1A]">
        <div className="mx-auto max-w-2xl px-4 py-6">
          {/* Mini banner casino */}
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

          <CasinoTabs credits={profile.credits} userId={profile.id} />
        </div>
      </div>
    </>
  )
}
