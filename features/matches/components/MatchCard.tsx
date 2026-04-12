import Link from 'next/link'
import type { MatchWithTeams } from '@/lib/types'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatOdds } from '@/lib/utils/format'
import { getMatchStatusLabel, getMatchStatusVariant } from '@/features/matches/types'

interface MatchCardProps {
  match: MatchWithTeams
}

export function MatchCard({ match }: MatchCardProps) {
  const statusVariant = getMatchStatusVariant(match.status)
  const statusLabel = getMatchStatusLabel(match.status)
  const isFinished = match.status === 'finished'

  return (
    <Link href={`/match/${match.id}`}>
      <Card className="space-y-3 hover:border-slate-600 transition-colors cursor-pointer">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {match.group_name ? `Grupo ${match.group_name}` : match.round} — {formatDate(match.starts_at)}
          </p>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{match.home_team.flag}</span>
            <span className="font-medium text-white">{match.home_team.name}</span>
          </div>

          {isFinished ? (
            <span className="text-lg font-bold text-white">
              {match.home_score} - {match.away_score}
            </span>
          ) : (
            <span className="text-sm text-slate-500">vs</span>
          )}

          <div className="flex items-center gap-2">
            <span className="font-medium text-white">{match.away_team.name}</span>
            <span className="text-xl">{match.away_team.flag}</span>
          </div>
        </div>

        {!isFinished && match.odds_home && (
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2.5 text-center">
              <span className="block text-xs text-slate-400">1</span>
              <span className="block text-sm font-semibold text-emerald-400">{formatOdds(match.odds_home)}</span>
            </div>
            <div className="flex-1 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2.5 text-center">
              <span className="block text-xs text-slate-400">X</span>
              <span className="block text-sm font-semibold text-emerald-400">{formatOdds(match.odds_draw)}</span>
            </div>
            <div className="flex-1 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2.5 text-center">
              <span className="block text-xs text-slate-400">2</span>
              <span className="block text-sm font-semibold text-emerald-400">{formatOdds(match.odds_away)}</span>
            </div>
          </div>
        )}
      </Card>
    </Link>
  )
}
