import type { PublicOutrightBet } from '../queries'

interface Props {
  bets: PublicOutrightBet[]
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

/**
 * Feed lateral de apuestas al campeon — quien le aposto a quien y por
 * cuanto. Genera FOMO y conversacion. No randomiza monto: mostramos lo
 * que cada uno arriesgo para que la gente vea quien va all-in.
 */
export function ChampionFeed({ bets }: Props) {
  if (bets.length === 0) {
    return (
      <div className="rounded-xl border border-card-border bg-card p-4">
        <h3 className="text-sm font-bold text-strong">Quién le apostó a quién</h3>
        <p className="mt-3 text-xs text-muted">Sin apuestas todavía. Sé el primero.</p>
      </div>
    )
  }

  // Agrupar por team para mostrar "rally" del equipo + lista de ultimos
  const byTeam = new Map<string, PublicOutrightBet[]>()
  for (const b of bets) {
    const arr = byTeam.get(b.team_name) ?? []
    arr.push(b)
    byTeam.set(b.team_name, arr)
  }
  const teamsRanked = [...byTeam.entries()]
    .map(([team, bs]) => ({
      team,
      count: bs.length,
      volume: bs.reduce((s, b) => s + b.amount, 0),
    }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5)

  return (
    <div className="space-y-3">
      {/* Ranking de equipos mas apostados */}
      <div className="rounded-xl border border-card-border bg-card p-3.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-subtle">Top equipos apostados</h3>
        <ul className="mt-2 space-y-1.5">
          {teamsRanked.map((t, i) => (
            <li key={t.team} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-strong">
                <span className="font-mono text-subtle">{i + 1}.</span>
                <span className="font-semibold">{t.team}</span>
              </span>
              <span className="font-mono text-muted">{t.count} · ${(t.volume).toLocaleString('es-CL')}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Feed de actividad reciente */}
      <div className="rounded-xl border border-card-border bg-card p-3.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-subtle">Actividad reciente</h3>
        <ul className="mt-2 space-y-2.5">
          {bets.slice(0, 20).map((b, i) => (
            <li key={`${b.user_id}-${b.created_at}-${i}`} className="flex items-start gap-2">
              {b.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-strong">
                  {initial(b.display_name)}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground">
                  <span className="font-semibold text-strong">{b.display_name}</span>
                  <span className="text-muted"> → </span>
                  <span className="font-semibold text-accent-deep">{b.team_name}</span>
                </p>
                <p className="text-[10px] text-subtle">
                  ${b.amount.toLocaleString('es-CL')} · x{b.odds_at_placement.toFixed(2)} · {timeAgo(b.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
