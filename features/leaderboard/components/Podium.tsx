import type { LeaderboardEntry } from '@/features/leaderboard/queries'

interface PodiumProps {
  top3: LeaderboardEntry[]
}

export function Podium({ top3 }: PodiumProps) {
  if (top3.length < 3) return null

  const [first, second, third] = top3

  return (
    <div className="flex items-end justify-center gap-4 py-6">
      <PodiumPlace entry={second} rank={2} height="h-20" />
      <PodiumPlace entry={first} rank={1} height="h-28" />
      <PodiumPlace entry={third} rank={3} height="h-16" />
    </div>
  )
}

function PodiumPlace({ entry, rank, height }: { entry: LeaderboardEntry; rank: number; height: string }) {
  const colors = {
    1: 'from-amber-500/30 to-amber-500/10 border-amber-500/50',
    2: 'from-slate-400/30 to-slate-400/10 border-slate-400/50',
    3: 'from-orange-700/30 to-orange-700/10 border-orange-700/50',
  }
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' }

  return (
    <div className="flex flex-col items-center gap-2 w-24">
      <div className="h-10 w-10 rounded-full bg-slate-700 overflow-hidden">
        {entry.avatar_url ? (
          <img src={entry.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-sm text-slate-400">
            {entry.display_name[0]}
          </div>
        )}
      </div>
      <p className="text-xs text-white font-medium truncate w-full text-center">{entry.display_name}</p>
      <p className="text-sm font-black text-[var(--accent)]">${entry.credits.toLocaleString('es-CL')}</p>
      <p className="text-[10px] text-slate-500">{entry.total_points} pts</p>
      <div className={`w-full ${height} rounded-t-lg bg-gradient-to-t border ${colors[rank as 1 | 2 | 3]} flex items-center justify-center`}>
        <span className="text-2xl">{medals[rank as 1 | 2 | 3]}</span>
      </div>
    </div>
  )
}
