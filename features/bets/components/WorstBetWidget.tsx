'use client'

import { useState } from 'react'
import { buildPickLabel } from '@/lib/utils/pick-label'

/**
 * "Peor pifia del día" — contrapunto rojo al BestBetWidget. Card muestra la
 * bet perdida con mayor stake del dia. Al click abre modal con detalle:
 * quien fue, contra que partido, resultado real vs pick, mercado y cuando.
 */

export interface WorstBet {
  user: string
  avatar: string | null
  label: string
  stake: number
  odds: number
  perdio: number
  matchLabel: string
  bet_id: string
  match_id: string
  home_team: string
  away_team: string
  home_flag: string | null
  away_flag: string | null
  home_score: number | null
  away_score: number | null
  market_type: string
  pick: string
  created_at: string
  resolved_at: string
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
  '1x2': 'Ganador (1X2)',
  'double_chance': 'Doble chance',
  'btts': 'Ambos anotan',
  'draw_no_bet': 'Sin empate',
  'totals_1.5': 'Total goles 1.5',
  'totals_2.5': 'Total goles 2.5',
  'totals_3.5': 'Total goles 3.5',
  'spreads_1.5': 'Handicap 1.5',
  'spreads_2.5': 'Handicap 2.5',
  'spreads_3.5': 'Handicap 3.5',
}

export function WorstBetWidget({ bet }: { bet: WorstBet }) {
  const [open, setOpen] = useState(false)
  const pickLabel = buildPickLabel(bet.market_type, bet.pick, bet.home_team, bet.away_team)
  const marketLabel = MARKET_LABELS[bet.market_type] ?? bet.market_type
  const hasScore = bet.home_score != null && bet.away_score != null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group relative w-full overflow-hidden rounded-lg border border-danger/40 bg-[linear-gradient(160deg,color-mix(in_oklab,var(--color-danger)_14%,var(--color-card)),var(--color-card)_55%)] px-[18px] pb-4 pt-[18px] text-left transition-colors hover:border-danger/70"
      >
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
            // eslint-disable-next-line @next/next/no-img-element
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

        <p className="mt-2 text-[10px] text-subtle opacity-0 transition-opacity group-hover:opacity-100">
          Click para ver detalle →
        </p>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-xl border border-danger/40 bg-card p-5 shadow-2xl"
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
              <span className="text-xl">💀</span>
              <p className="text-[11px] font-bold uppercase tracking-wider text-danger">
                Peor pifia del día
              </p>
            </div>

            {/* Apuesta */}
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-subtle">{marketLabel}</p>
              <p className="mt-0.5 text-lg font-bold text-strong">{pickLabel}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="rounded-full bg-danger/15 px-2.5 py-0.5 font-mono text-sm font-bold text-danger">
                  x{bet.odds.toFixed(2)}
                </span>
                <span className="text-xs text-muted">
                  ${bet.stake.toLocaleString('es-CL')} → <span className="font-bold text-danger">-${bet.perdio.toLocaleString('es-CL')}</span>
                </span>
              </div>
            </div>

            {/* Partido */}
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-wider text-subtle">Partido</p>
              <p className="mt-0.5 text-sm font-semibold text-strong">
                {bet.home_flag ?? ''} {bet.home_team} <span className="text-subtle">vs</span> {bet.away_team} {bet.away_flag ?? ''}
              </p>
              {hasScore && (
                <p className="mt-0.5 text-[11px] text-muted">
                  Resultado: <span className="font-mono font-bold text-strong">{bet.home_score}-{bet.away_score}</span>
                </p>
              )}
            </div>

            {/* User */}
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-wider text-subtle">Apostador</p>
              <div className="mt-1 flex items-center gap-2">
                {bet.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={bet.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-danger/40 bg-danger/10 text-xs font-bold text-danger">
                    {bet.user[0]}
                  </span>
                )}
                <div>
                  <p className="text-sm font-semibold text-strong">{bet.user}</p>
                  <p className="text-[11px] text-subtle">apostó {timeAgo(bet.created_at)} · resolvió {timeAgo(bet.resolved_at)}</p>
                </div>
              </div>
            </div>

            <div className="border-t border-card-border pt-3 text-xs text-muted">
              F 🙏
            </div>
          </div>
        </div>
      )}
    </>
  )
}
