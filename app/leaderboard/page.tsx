import { Header } from '@/components/layout/Header'
import { getOptionalAuth } from '@/lib/auth'
import { getLeaderboard } from '@/features/leaderboard/queries'
import { LeaderboardTable } from '@/features/leaderboard/components/LeaderboardTable'
import { Podium } from '@/features/leaderboard/components/Podium'

export default async function LeaderboardPage() {
  const auth = await getOptionalAuth()
  const entries = await getLeaderboard()

  return (
    <>
      <Header user={auth?.profile ?? null} />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-bold text-white mb-6">Ranking</h1>
        <Podium top3={entries.slice(0, 3)} />
        <LeaderboardTable entries={entries} currentUserId={auth?.userId} />
      </div>
    </>
  )
}
