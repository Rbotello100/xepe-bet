import { Header } from '@/components/layout/Header'
import { createServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { getUserPredictions } from '@/features/predictions/queries'
import { PredictionCard } from '@/features/predictions/components/PredictionCard'
import type { MatchWithTeams } from '@/lib/types'

export default async function PredictionsPage() {
  const { userId, profile } = await requireAuth()
  const predictions = await getUserPredictions(userId)

  const supabase = await createServerClient()
  const matchIds = [...new Set(predictions.map(p => p.match_id))]
  const { data: matches } = await supabase
    .from('matches')
    .select('*, home_team:teams!home_team_id(*), away_team:teams!away_team_id(*)')
    .in('id', matchIds.length > 0 ? matchIds : ['none'])

  const matchMap = new Map((matches ?? []).map(m => [m.id, m]))

  return (
    <>
      <Header user={profile} />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-bold text-white mb-6">Mis Predicciones</h1>
        {predictions.length === 0 ? (
          <p className="text-center text-slate-500 py-12">Aun no has hecho predicciones</p>
        ) : (
          <div className="space-y-3">
            {predictions.map(pred => {
              const match = matchMap.get(pred.match_id)
              if (!match) return null
              return <PredictionCard key={pred.id} prediction={pred} match={match as unknown as MatchWithTeams} />
            })}
          </div>
        )}
      </div>
    </>
  )
}
