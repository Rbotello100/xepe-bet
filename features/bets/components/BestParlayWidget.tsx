'use client'

import { useState } from 'react'
import { buildPickLabel } from '@/lib/utils/pick-label'

/**
 * "Mejor parlay del día" — card destacada en violeta con modal de detalle
 * al click. El modal muestra todas las legs del parlay + info del user.
 */

export interface BestParlayLeg {
  home_team: string
  away_team: string
  home_flag: string | null
  away_flag: string | null
  market_type: string
  pick: string
  odds: number
}

export interface BestParlay {
  user: string
  avatar: string | null
  stake: number
  total_odds: number
  payout: number
  parlay_id: string
  created_at: string
  legs: BestParlayLeg[]
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

const MARKET_LABELS: Record<string, string> = {
  '1x2': '1X2',
  'double_chance': 'Doble ch.',
  'btts': 'Ambos',
  'draw_no_bet': 'Sin empate',
  'totals_1.5': 'Total 1.5',
  'totals_2.5': 'Total 2.5',
  'totals_3.5': 'Total 3.5',
  'spreads_1.5': 'Hcap 1.5',
  'spreads_2.5': 'Hcap 2.5',
  'spreads_3.5': 'Hcap 3.5',
}

export function BestParlayWidget({ parlay }: { parlay: BestParlay }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group relative w-full overflow-hidden rounded-lg border border-accent/40 bg-[linear-gradient(160deg,color-mix(in_oklab,var(--color-accent)_16%,var(--color-card)),var(--color-card)_55%)] px-[18px] pb-4 pt-[18px] text-left transition-colors hover:border-accent/70"
      >
        <div className="absolute right-4 top-3.5 text-[22px] drop-shadow-[0_2px_6px_rgba(139,92,246,.5)]">
          🎯
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-accent-deep">
          Mejor parlay del día
        </p>
        <p className="mt-1.5 max-w-[90%] text-base font-bold leading-tight text-strong">
          {parlay.legs.length} legs · x{parlay.total_odds.toFixed(2)}
        </p>

        <div className="mt-2 flex items-center gap-2 text-[13px] text-muted">
          {parlay.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={parlay.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
          ) : (
            <span className="grid h-5 w-5 place-items-center rounded-full border border-accent/40 bg-accent/10 text-[10px] font-bold text-accent-deep">
              {parlay.user[0]}
            </span>
          )}
          <span>
            por <b className="text-foreground">{parlay.user}</b>
          </span>
        </div>

        <div className="mt-3.5 flex items-center gap-3 border-t border-accent/20 pt-3">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.06em] text-subtle">Apostó</span>
            <span className="font-mono text-lg font-bold text-foreground">${parlay.stake.toLocaleString('es-CL')}</span>
          </div>
          <div className="text-base text-subtle">→</div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.06em] text-subtle">Paga</span>
            <span className="font-mono text-lg font-bold text-win">${parlay.payout.toLocaleString('es-CL')}</span>
          </div>
        </div>

        <p className="mt-2 text-[10px] text-subtle opacity-0 transition-opacity group-hover:opacity-100">
          Click para ver las legs →
        </p>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-xl border border-accent/40 bg-card p-5 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 rounded-full p-1.5 text-subtle hover:bg-sunken hover:text-strong"
              aria-label="Cerrar"
            >
              ✕
            </button>

            <div className="mb-3 flex items-center gap-2">
              <span className="text-xl">🎯</span>
              <p className="text-[11px] font-bold uppercase tracking-wider text-accent-deep">
                Mejor parlay del día
              </p>
            </div>

            {/* Header: odds + stake + payout */}
            <div className="mb-4 rounded-lg border border-accent/30 bg-accent/5 px-3 py-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-accent-deep">x{parlay.total_odds.toFixed(2)}</span>
                <span className="text-xs text-muted">· {parlay.legs.length} legs</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                ${parlay.stake.toLocaleString('es-CL')} → <span className="font-bold text-win">${parlay.payout.toLocaleString('es-CL')}</span>
              </p>
            </div>

            {/* Legs */}
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-wider text-subtle mb-2">Combinación</p>
              <ul className="space-y-2">
                {parlay.legs.map((l, i) => {
                  const pickLabel = buildPickLabel(l.market_type, l.pick, l.home_team, l.away_team)
                  const marketLabel = MARKET_LABELS[l.market_type] ?? l.market_type
                  return (
                    <li key={i} className="rounded-md border border-card-border bg-sunken/40 px-3 py-2">
                      <p className="text-[11px] text-muted">
                        {l.home_flag ?? ''} {l.home_team} vs {l.away_team} {l.away_flag ?? ''}
                      </p>
                      <div className="mt-0.5 flex items-center justify-between">
                        <span className="text-sm font-semibold text-strong">
                          <span className="text-[9px] uppercase text-subtle mr-1.5">{marketLabel}</span>
                          {pickLabel}
                        </span>
                        <span className="font-mono text-xs font-bold text-accent-deep">x{l.odds.toFixed(2)}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>

            {/* User */}
            <div className="border-t border-card-border pt-3">
              <div className="flex items-center gap-2">
                {parlay.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={parlay.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-accent/40 bg-accent/10 text-xs font-bold text-accent-deep">
                    {parlay.user[0]}
                  </span>
                )}
                <div>
                  <p className="text-sm font-semibold text-strong">{parlay.user}</p>
                  <p className="text-[11px] text-subtle">armó este parlay {timeAgo(parlay.created_at)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
