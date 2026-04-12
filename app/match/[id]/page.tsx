import { notFound, redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { createServerClient } from '@/lib/supabase/server'
import { getMatchById } from '@/features/matches/queries'
import { getUserPredictionForMatch } from '@/features/predictions/queries'
import { PredictionForm } from '@/features/predictions/components/PredictionForm'
import { OthersPredictions } from '@/features/predictions/components/OthersPredictions'
import { getMatchPredictions } from '@/features/predictions/queries'
import { MatchBetting } from '@/features/bets/components/MatchBetting'
import { formatDate, formatOdds } from '@/lib/utils/format'
import { getMatchStatusLabel, getMatchStatusVariant, isMatchLocked } from '@/features/matches/types'
import { PREDICTION_LOCK_HOURS, BET_LOCK_HOURS } from '@/lib/constants'

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const match = await getMatchById(id)
  if (!match) notFound()

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  let prediction = null
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data
    prediction = await getUserPredictionForMatch(user.id, id)
  }

  // Check if match has started (for showing others' predictions)
  const matchStarted = new Date(match.starts_at) <= new Date()
  let othersPredictions: Awaited<ReturnType<typeof getMatchPredictions>> = []
  if (matchStarted) {
    othersPredictions = await getMatchPredictions(id)
  }

  const predictionLocked = isMatchLocked(match, PREDICTION_LOCK_HOURS)
  const betLocked = isMatchLocked(match, BET_LOCK_HOURS)
  const statusVariant = getMatchStatusVariant(match.status)
  const statusLabel = getMatchStatusLabel(match.status)
  const isFinished = match.status === 'finished'

  return (
    <>
      <Header user={profile} />
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        {/* Match header */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {match.group_name ? `Grupo ${match.group_name}` : match.round} — {formatDate(match.starts_at)}
            </p>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>

          <div className="flex items-center justify-between py-4">
            <div className="flex flex-col items-center gap-2 flex-1">
              <span className="text-4xl">{match.home_team.flag}</span>
              <span className="text-sm font-medium text-white text-center">{match.home_team.name}</span>
            </div>

            {isFinished ? (
              <div className="text-center px-4">
                <span className="text-3xl font-bold text-white">
                  {match.home_score} - {match.away_score}
                </span>
              </div>
            ) : (
              <span className="text-lg text-slate-500 px-4">vs</span>
            )}

            <div className="flex flex-col items-center gap-2 flex-1">
              <span className="text-4xl">{match.away_team.flag}</span>
              <span className="text-sm font-medium text-white text-center">{match.away_team.name}</span>
            </div>
          </div>

          {/* Odds display */}
          {!isFinished && match.odds_home && (
            <div className="flex gap-2">
              <div className="flex-1 rounded-lg bg-slate-700/50 px-3 py-2 text-center">
                <span className="block text-xs text-slate-400">Local</span>
                <span className="block text-sm font-semibold text-emerald-400">{formatOdds(match.odds_home)}</span>
              </div>
              <div className="flex-1 rounded-lg bg-slate-700/50 px-3 py-2 text-center">
                <span className="block text-xs text-slate-400">Empate</span>
                <span className="block text-sm font-semibold text-emerald-400">{formatOdds(match.odds_draw)}</span>
              </div>
              <div className="flex-1 rounded-lg bg-slate-700/50 px-3 py-2 text-center">
                <span className="block text-xs text-slate-400">Visita</span>
                <span className="block text-sm font-semibold text-emerald-400">{formatOdds(match.odds_away)}</span>
              </div>
            </div>
          )}
        </Card>

        {/* Prediction section */}
        {user ? (
          <>
            <div>
              <h2 className="text-lg font-semibold text-white mb-3">Prediccion</h2>
              <PredictionForm match={match} existingPrediction={prediction} locked={predictionLocked} />
            </div>

            {/* Betting section */}
            {!isFinished && match.odds_home && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-3">Apostar</h2>
                <MatchBetting match={match} locked={betLocked} credits={profile?.credits ?? 0} />
              </div>
            )}
          </>
        ) : (
          <Card className="text-center py-6">
            <p className="text-slate-400">Inicia sesion para hacer predicciones y apuestas</p>
            <a href="/login" className="inline-block mt-3 rounded-lg bg-emerald-500 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-600">
              Iniciar sesion
            </a>
          </Card>
        )}

        {/* Others' predictions (visible after match starts) */}
        {matchStarted && othersPredictions.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">
              Predicciones de otros ({othersPredictions.length})
            </h2>
            <OthersPredictions
              predictions={othersPredictions as never}
              homeTeamName={match.home_team.name}
              awayTeamName={match.away_team.name}
              currentUserId={user?.id}
            />
          </div>
        )}
      </div>
    </>
  )
}
