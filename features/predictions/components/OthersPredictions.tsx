import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

interface PredictionWithProfile {
  id: string
  predicted_winner: string | null
  predicted_home_score: number | null
  predicted_away_score: number | null
  points_earned: number
  is_correct: boolean | null
  profile: { display_name: string; avatar_url: string | null }
}

interface OthersPredictionsProps {
  predictions: PredictionWithProfile[]
  homeTeamName: string
  awayTeamName: string
  currentUserId?: string
}

export function OthersPredictions({ predictions, homeTeamName, awayTeamName, currentUserId }: OthersPredictionsProps) {
  if (predictions.length === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-4">Nadie ha predicho este partido aun</p>
    )
  }

  return (
    <div className="space-y-2">
      {predictions.map(pred => {
        const winnerLabel = pred.predicted_winner === 'home' ? homeTeamName
          : pred.predicted_winner === 'away' ? awayTeamName
          : 'Empate'

        const hasScore = pred.predicted_home_score != null && pred.predicted_away_score != null

        return (
          <Card key={pred.id} className="flex items-center gap-3 py-3">
            <div className="h-7 w-7 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
              {pred.profile.avatar_url ? (
                <img src={pred.profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">
                  {pred.profile.display_name[0]}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{pred.profile.display_name}</p>
              <p className="text-xs text-slate-400">
                {winnerLabel}
                {hasScore && ` (${pred.predicted_home_score}-${pred.predicted_away_score})`}
              </p>
            </div>
            {pred.is_correct != null && (
              <Badge variant={pred.is_correct ? 'success' : 'danger'}>
                {pred.points_earned > 0 ? `+${pred.points_earned}` : pred.is_correct ? 'OK' : 'X'}
              </Badge>
            )}
          </Card>
        )
      })}
    </div>
  )
}
