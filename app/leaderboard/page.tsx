import { Header } from '@/components/layout/Header'
import { getOptionalAuth } from '@/lib/auth'
import {
  getLeaderboard,
  getBiggestWinners,
  getBiggestSingleWins,
  getCasinoHitRate,
} from '@/features/leaderboard/queries'
import { LeaderboardTable } from '@/features/leaderboard/components/LeaderboardTable'
import { Podium } from '@/features/leaderboard/components/Podium'
import { CasinoStatsSection } from '@/features/leaderboard/components/CasinoStatsSection'

export default async function LeaderboardPage() {
  const auth = await getOptionalAuth()

  const [entries, biggestWinners, biggestSingleWins, hitRate] = await Promise.all([
    getLeaderboard(),
    getBiggestWinners(),
    getBiggestSingleWins(),
    getCasinoHitRate(),
  ])

  return (
    <>
      <Header user={auth?.profile ?? null} />
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-8">
        {/* Ranking principal — por créditos */}
        <section>
          <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <span className="inline-block w-1 h-6 bg-[var(--accent)] rounded-full" />
            Ranking
          </h1>
          <p className="text-xs text-slate-500 mb-4 uppercase tracking-wider">
            El que tiene más plata manda
          </p>
          <Podium top3={entries.slice(0, 3)} />
          <LeaderboardTable entries={entries} currentUserId={auth?.userId} />
        </section>

        {/* Casino stats */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🎰</span>
            <span className="bg-gradient-to-r from-[var(--casino-yellow)] to-[var(--accent)] bg-clip-text text-transparent">
              Casino Stats
            </span>
          </h2>

          <CasinoStatsSection
            title="Biggest Winners"
            icon="💰"
            rows={biggestWinners}
            formatValue={(n) =>
              n >= 0
                ? `+$${n.toLocaleString('es-CL')}`
                : `-$${Math.abs(n).toLocaleString('es-CL')}`
            }
            emptyMessage="Nadie ha jugado casino todavía"
          />

          <CasinoStatsSection
            title="Biggest Single Win"
            icon="⚡"
            rows={biggestSingleWins}
            formatValue={(n) => `$${n.toLocaleString('es-CL')}`}
            emptyMessage="Aún no hay ganancias registradas"
          />

          <CasinoStatsSection
            title="Hit Rate"
            icon="🎯"
            rows={hitRate}
            formatValue={(n) => `${n.toFixed(1)}%`}
            emptyMessage="Mínimo 20 partidas para entrar"
          />
        </section>
      </div>
    </>
  )
}
