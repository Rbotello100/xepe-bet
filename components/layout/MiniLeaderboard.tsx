import type { LeaderboardEntry } from '@/features/leaderboard/queries'

const MEDALS = ['🥇', '🥈', '🥉']

/**
 * Top 7 del ranking + fila del usuario actual resaltada.
 * Datos vienen de getLeaderboard() de features/leaderboard.
 * `trend` (cambio de posicion) no esta disponible en el schema actual; se omite.
 */
export function MiniLeaderboard({
  entries,
  currentUserId,
}: {
  entries: LeaderboardEntry[]
  currentUserId?: string
}) {
  return (
    <section className="rounded-lg border border-card-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-bold tracking-tight text-strong">Ranking</h3>
        <a href="/leaderboard" className="text-xs font-semibold text-accent-deep">
          Ver todo
        </a>
      </div>
      <div className="flex flex-col gap-0.5">
        {entries.slice(0, 7).map((e, i) => {
          const rank = i + 1
          const you = e.id === currentUserId
          return (
            <div
              key={e.id}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 ${
                you ? 'border border-accent/40 bg-accent-soft' : ''
              }`}
            >
              <span className="w-[22px] text-center font-mono text-sm font-bold text-muted">
                {rank <= 3 ? MEDALS[rank - 1] : rank}
              </span>
              <span
                className={`grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-full text-xs font-bold ${
                  you ? 'bg-accent text-white' : 'border border-card-border bg-sunken text-muted'
                }`}
              >
                {e.display_name[0]}
              </span>
              <span className="flex-1 truncate text-[13.5px] font-semibold text-foreground">
                {e.display_name}
                {you && (
                  <em className="not-italic font-normal text-accent-deep"> · tú</em>
                )}
              </span>
              <span className="w-[64px] text-right font-mono text-[13.5px] font-bold text-strong">
                ${Number(e.credits).toLocaleString('es-CL')}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
