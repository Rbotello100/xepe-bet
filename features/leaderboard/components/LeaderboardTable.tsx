import type { LeaderboardEntry } from '@/features/leaderboard/queries'

interface LeaderboardTableProps {
  entries: LeaderboardEntry[]
  currentUserId?: string
}

const MEDALS = ['🥇', '🥈', '🥉']

export function LeaderboardTable({ entries, currentUserId }: LeaderboardTableProps) {
  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500">
        <p>Aun no hay participantes en el ranking</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, i) => {
        const isCurrentUser = entry.id === currentUserId
        const rank = i + 1

        return (
          <div
            key={entry.id}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
              isCurrentUser
                ? 'border border-[var(--accent)]/60 bg-[var(--accent)]/10 shadow-[0_0_15px_rgba(0,230,118,0.15)]'
                : 'border border-slate-700 bg-slate-800'
            }`}
          >
            <span className="w-8 text-center text-lg">
              {rank <= 3 ? MEDALS[rank - 1] : <span className="text-sm text-slate-500">#{rank}</span>}
            </span>

            <div className="h-8 w-8 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
              {entry.avatar_url ? (
                <img src={entry.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">
                  {entry.display_name[0]}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{entry.display_name}</p>
            </div>

            <div className="text-right">
              <p className="text-sm font-black text-[var(--accent)]">${entry.credits.toLocaleString('es-CL')}</p>
              <p className="text-xs text-slate-500">{entry.total_points} pts</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
