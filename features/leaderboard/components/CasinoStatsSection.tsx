import { Card } from '@/components/ui/Card'
import type { CasinoStatsRow } from '@/features/leaderboard/queries'

interface Props {
  title: string
  icon: string
  rows: CasinoStatsRow[]
  formatValue: (n: number) => string
  emptyMessage?: string
}

const MEDALS = ['🥇', '🥈', '🥉']

const GAME_LABELS: Record<string, string> = {
  slots: '🎰 Slots',
  mines: '⚠️ Mines',
  penalty: '⚽ Penal',
  scratch: '🎟️ Rasca',
}

export function CasinoStatsSection({ title, icon, rows, formatValue, emptyMessage }: Props) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">{title}</h3>
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-xs text-slate-500 py-4">
          {emptyMessage ?? 'Aún no hay datos suficientes'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row, i) => {
            const rank = i + 1
            const medal = rank <= 3 ? MEDALS[rank - 1] : `#${rank}`

            return (
              <div
                key={`${row.user_id}-${i}`}
                className="flex items-center gap-3 rounded-lg bg-slate-900/50 px-3 py-2 border border-slate-700/50"
              >
                <span className="w-7 text-center text-base">{medal}</span>

                <div className="h-7 w-7 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
                  {row.avatar_url ? (
                    <img src={row.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-[10px] text-slate-400">
                      {row.display_name[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{row.display_name}</p>
                  {row.meta && (
                    <p className="text-[10px] text-slate-500 truncate">
                      {GAME_LABELS[row.meta] ?? row.meta}
                    </p>
                  )}
                </div>

                <p className="text-sm font-black text-[var(--casino-yellow)] whitespace-nowrap">
                  {formatValue(row.value)}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
