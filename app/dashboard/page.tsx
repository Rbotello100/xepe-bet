import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { requireAuth } from '@/lib/auth'
import { getRecentActivity } from '@/features/feed/queries'
import { ActivityFeed } from '@/features/feed/components/ActivityFeed'
import { getUserRank } from '@/features/leaderboard/queries'

export default async function DashboardPage() {
  const { userId, profile } = await requireAuth()
  const rank = await getUserRank(userId)
  const activity = await getRecentActivity()

  return (
    <>
      <Header user={profile} />
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-white">Mi Perfil</h1>
        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center">
            <p className="text-xs text-slate-400">Puntos</p>
            <p className="text-2xl font-bold text-emerald-400">{profile.total_points}</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs text-slate-400">Creditos</p>
            <p className="text-2xl font-bold text-white">${profile.credits}</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs text-slate-400">Ranking</p>
            <p className="text-2xl font-bold text-amber-400">#{rank || '-'}</p>
          </Card>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Actividad reciente</h2>
          <ActivityFeed initialEntries={activity} />
        </div>
      </div>
    </>
  )
}
