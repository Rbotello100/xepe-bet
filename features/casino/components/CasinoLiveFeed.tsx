import type { CasinoLiveItem } from '@/features/casino/queries'

/**
 * Feed en vivo de jugadas de casino — columna derecha de /casino.
 * Misma estetica que MiniLeaderboard. Cada fila: avatar, nombre, juego,
 * monto neto (verde si gano, rojo si perdio, neutral si empato/cero).
 */

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

export function CasinoLiveFeed({ items }: { items: CasinoLiveItem[] }) {
  return (
    <section className="rounded-lg border border-card-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold tracking-tight text-strong">Apuestas</h3>
          <span className="h-1.5 w-1.5 rounded-full bg-win" style={{ animation: 'live-pulse 1.8s infinite' }} />
        </div>
        <span className="text-[10px] uppercase tracking-wider text-subtle">en vivo</span>
      </div>

      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-subtle">
          Aún no hay jugadas. Sé el primero 🎰
        </p>
      ) : (
        <div className="flex flex-col gap-0.5 max-h-[640px] overflow-y-auto pr-1">
          {items.map(it => {
            const won = it.net > 0
            const lost = it.net < 0
            return (
              <div
                key={it.id}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-sunken/40 transition-colors"
              >
                {it.avatar_url ? (
                  <img
                    src={it.avatar_url}
                    alt=""
                    className="h-[26px] w-[26px] flex-shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-full border border-card-border bg-sunken text-xs font-bold text-muted">
                    {it.display_name[0]}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="truncate text-[12.5px] font-semibold text-foreground">
                      {it.display_name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-subtle">
                      {timeAgo(it.created_at)}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted">
                    <span className="mr-0.5">{it.gameIcon}</span>
                    {it.gameLabel}
                    <span className="text-subtle"> · ${it.bet.toLocaleString('es-CL')}</span>
                  </div>
                </div>

                <div className="shrink-0">
                  {won && (
                    <span className="font-mono text-[12.5px] font-bold text-win">
                      +${it.net.toLocaleString('es-CL')}
                    </span>
                  )}
                  {lost && (
                    <span className="font-mono text-[12.5px] font-bold text-danger">
                      ${it.net.toLocaleString('es-CL')}
                    </span>
                  )}
                  {it.net === 0 && (
                    <span className="rounded-full bg-sunken px-2 py-0.5 text-[10px] font-semibold text-muted">
                      —
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
