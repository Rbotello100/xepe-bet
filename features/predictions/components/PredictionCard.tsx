import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { Prediction, MatchWithTeams } from '@/lib/types'

interface PredictionCardProps {
  prediction: Prediction
  match: MatchWithTeams
}

export function PredictionCard({ prediction, match }: PredictionCardProps) {
  const winnerLabel = prediction.predicted_winner === 'home'
    ? match.home_team.name
    : prediction.predicted_winner === 'away'
      ? match.away_team.name
      : 'Empate'

  const hasScore = prediction.predicted_home_score != null && prediction.predicted_away_score != null

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          {match.home_team.flag} {match.home_team.name} vs {match.away_team.name} {match.away_team.flag}
        </p>
        {prediction.is_correct != null && (
          <Badge variant={prediction.is_correct ? 'success' : 'danger'}>
            {prediction.is_correct ? 'Acertaste' : 'Fallaste'}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-white font-medium">{winnerLabel}</span>
        {hasScore && (
          <span className="text-[var(--casino-yellow)] text-sm">
            ({prediction.predicted_home_score}-{prediction.predicted_away_score})
          </span>
        )}
        {prediction.points_earned > 0 && (
          <Badge variant="success">+{prediction.points_earned} pts</Badge>
        )}
      </div>
    </Card>
  )
}
