/**
 * "Mejor apuesta del dia" — card destacada en dorado.
 * Data: por ahora viene por prop (mock razonable). Futuro: query de la apuesta
 * de mayor potential_payout/backers del dia.
 */

export interface BestBet {
  user: string
  label: string   // ej: "Argentina gana + Over 2.5 goles"
  stake: number
  odds: number
  payout: number
  backers: number
}

export function BestBetWidget({ bet }: { bet: BestBet }) {
  return (
    <section className="relative overflow-hidden rounded-lg border border-gold/40 bg-[linear-gradient(160deg,color-mix(in_oklab,var(--color-gold)_16%,var(--color-card)),var(--color-card)_55%)] px-[18px] pb-4 pt-[18px]">
      <div className="absolute right-4 top-3.5 text-[22px] drop-shadow-[0_2px_6px_rgba(244,183,64,.5)]">
        👑
      </div>
      <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-gold">
        Mejor apuesta del dia
      </p>
      <p className="mt-1.5 max-w-[90%] text-base font-bold leading-tight text-strong">
        {bet.label}
      </p>

      <div className="mt-2 flex items-center gap-2.5 text-[13px] text-muted">
        <span>
          por <b className="text-foreground">{bet.user}</b>
        </span>
        <span className="ml-auto rounded-full bg-gold/15 px-2.5 py-0.5 font-mono text-[13px] font-bold text-gold">
          x{bet.odds.toFixed(2)}
        </span>
      </div>

      <div className="mt-3.5 flex items-center gap-3 border-t border-gold/20 pt-3">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.06em] text-subtle">Apostó</span>
          <span className="font-mono text-lg font-bold text-foreground">${bet.stake}</span>
        </div>
        <div className="text-base text-subtle">→</div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.06em] text-subtle">Paga</span>
          <span className="font-mono text-lg font-bold text-win">${bet.payout}</span>
        </div>
        <div className="ml-auto rounded-full bg-sunken px-2.5 py-1 text-[11px] text-muted">
          {bet.backers} la siguen
        </div>
      </div>
    </section>
  )
}
