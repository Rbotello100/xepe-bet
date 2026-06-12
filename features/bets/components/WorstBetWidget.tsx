/**
 * "Peor pifia del día" — card en tono perdedor (rojo).
 * Contrapunto al BestBetWidget.
 * Data: la bet LOST con mayor stake del día.
 */

export interface WorstBet {
  user: string
  avatar: string | null
  label: string
  stake: number
  odds: number
  perdio: number
  matchLabel: string
}

export function WorstBetWidget({ bet }: { bet: WorstBet }) {
  return (
    <section className="relative overflow-hidden rounded-lg border border-danger/40 bg-[linear-gradient(160deg,color-mix(in_oklab,var(--color-danger)_14%,var(--color-card)),var(--color-card)_55%)] px-[18px] pb-4 pt-[18px]">
      <div className="absolute right-4 top-3.5 text-[22px] drop-shadow-[0_2px_6px_rgba(220,53,69,.5)]">
        💀
      </div>
      <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-danger">
        Peor pifia del día
      </p>
      <p className="mt-1.5 max-w-[90%] text-base font-bold leading-tight text-strong">
        {bet.label}
      </p>
      <p className="text-[11px] text-subtle">
        {bet.matchLabel}
      </p>

      <div className="mt-2 flex items-center gap-2 text-[13px] text-muted">
        {bet.avatar ? (
          <img src={bet.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
        ) : (
          <span className="grid h-5 w-5 place-items-center rounded-full border border-danger/40 bg-danger/10 text-[10px] font-bold text-danger">
            {bet.user[0]}
          </span>
        )}
        <span>
          por <b className="text-foreground">{bet.user}</b>
        </span>
        <span className="ml-auto rounded-full bg-danger/15 px-2.5 py-0.5 font-mono text-[13px] font-bold text-danger">
          x{bet.odds.toFixed(2)}
        </span>
      </div>

      <div className="mt-3.5 flex items-center gap-3 border-t border-danger/20 pt-3">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.06em] text-subtle">Apostó</span>
          <span className="font-mono text-lg font-bold text-foreground">${bet.stake.toLocaleString('es-CL')}</span>
        </div>
        <div className="text-base text-subtle">→</div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.06em] text-subtle">Perdió</span>
          <span className="font-mono text-lg font-bold text-danger">-${bet.perdio.toLocaleString('es-CL')}</span>
        </div>
      </div>
    </section>
  )
}
