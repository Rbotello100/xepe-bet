'use client'

import { useState } from 'react'
import type { MatchWithTeams } from '@/lib/types'
import { formatDate, formatCredits } from '@/lib/utils/format'
import { BET_LOCK_HOURS } from '@/lib/constants'
import { MatchMarketsPanel, type MarketOddsRow } from './MatchMarketsPanel'

interface MatchCardProps {
  match: MatchWithTeams
  /** Rows de match_market_odds para este partido. El server las precarga
   *  en MatchList. Si esta vacio, el panel solo muestra 1X2 (con fallback
   *  a las columnas legacy de matches). */
  marketRows?: MarketOddsRow[]
  /** Distribucion real de la multitud [%home, %draw, %away]. Omitir si no hay bets. */
  dist?: [number, number, number]
  /** Count real de bets pending del match (solo 1X2). Omitir si 0. */
  pool?: number
  /** Stakes acumulados por bucket 1X2 + total. Omitir si pool=0. */
  stakes?: { home: number; draw: number; away: number; total: number }
}

function PickBar({ dist, stakes, homeName, awayName }: {
  dist: [number, number, number]
  stakes?: { home: number; draw: number; away: number }
  homeName: string
  awayName: string
}) {
  const [h, x, a] = dist
  const tooltip = stakes
    ? `${homeName} ${h}% · ${formatCredits(stakes.home)}\nEmpate ${x}% · ${formatCredits(stakes.draw)}\n${awayName} ${a}% · ${formatCredits(stakes.away)}`
    : `${h}% local · ${x}% empate · ${a}% visita`
  return (
    <div
      className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"
      title={tooltip}
    >
      <span className="h-full bg-accent" style={{ width: `${h}%` }} />
      <span className="h-full bg-subtle" style={{ width: `${x}%` }} />
      <span className="h-full bg-cyan" style={{ width: `${a}%` }} />
    </div>
  )
}

export function MatchCard({ match, marketRows = [], dist, pool, stakes }: MatchCardProps) {
  const isFinished = match.status === 'finished'
  const isLive = match.status === 'live'
  const lockCutoff = new Date(new Date(match.starts_at).getTime() - BET_LOCK_HOURS * 60 * 60 * 1000)
  const isLocked = new Date() >= lockCutoff
  const canBet = !isFinished && !isLocked && match.odds_home
  const [expanded, setExpanded] = useState(false)

  const toggle = () => { if (canBet) setExpanded(e => !e) }

  return (
    <article
      className={`rounded-lg border bg-card transition-[border-color] ${
        isLive ? 'border-win/40' : expanded ? 'border-accent/50' : 'border-card-border hover:border-accent/45'
      }`}
    >
      {/* Header clickeable: toggle del acordeon. cursor-pointer solo si canBet. */}
      <div
        onClick={toggle}
        className={`p-[14px_16px] ${canBet ? 'cursor-pointer' : ''}`}
      >
        <div className="mb-[11px] flex items-center justify-between gap-2">
          <span className="text-xs text-subtle">
            {match.group_name ? `Grupo ${match.group_name}` : match.round}
            {' · '}
            {formatDate(match.starts_at)}
          </span>
          <span className="flex items-center gap-1.5">
            {match.round && match.round !== 'group' && (
              <span
                title="Las apuestas 1X2 cierran a los 90 min + tiempo añadido. Extra time y penales NO cuentan."
                className="hidden sm:inline-flex items-center rounded-full border border-gold/30 bg-gold/10 px-2 py-[2px] text-[10px] font-bold tracking-wide text-gold"
              >
                90 MIN
              </span>
            )}
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-win/30 bg-win/15 px-2.5 py-[3px] text-[11px] font-semibold text-win">
                <span className="h-1.5 w-1.5 rounded-full bg-win" style={{ animation: 'live-pulse 1.6s infinite' }} />
                EN VIVO
              </span>
            ) : isFinished ? (
              <span className="rounded-full border border-card-border bg-sunken px-2.5 py-[3px] text-[11px] font-semibold text-muted">
                Finalizado
              </span>
            ) : isLocked ? (
              <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-[3px] text-[11px] font-semibold text-gold">
                Cerrado
              </span>
            ) : (
              <span className="rounded-full border border-card-border bg-sunken px-2.5 py-[3px] text-[11px] font-semibold text-muted">
                Programado
              </span>
            )}
            {canBet && (
              <span
                className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] transition-transform ${
                  expanded
                    ? 'border-accent bg-accent text-background rotate-180'
                    : 'border-card-border bg-sunken text-muted'
                }`}
                aria-label={expanded ? 'Colapsar' : 'Expandir'}
              >
                ▼
              </span>
            )}
          </span>
        </div>

        {/* teams */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="text-2xl leading-none">{match.home_team.flag}</span>
            <span className="truncate text-base font-semibold text-strong">{match.home_team.name}</span>
          </div>
          <div className="grid place-items-center">
            {isLive || isFinished ? (
              <span className="flex items-center gap-1.5 font-mono text-[22px] font-bold text-strong">
                {match.home_score}
                <i className="not-italic text-subtle">-</i>
                {match.away_score}
              </span>
            ) : (
              <span className="text-xs font-semibold text-subtle">vs</span>
            )}
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2.5">
            <span className="truncate text-base font-semibold text-strong">{match.away_team.name}</span>
            <span className="text-2xl leading-none">{match.away_team.flag}</span>
          </div>
        </div>

        {/* Pool/distribution preview cuando NO esta expandido y hay data */}
        {!expanded && !isFinished && dist && (
          <div className="mt-[11px] space-y-1">
            <div className="flex items-center gap-3">
              <PickBar
                dist={dist}
                stakes={stakes}
                homeName={match.home_team.name}
                awayName={match.away_team.name}
              />
              {pool !== undefined && pool > 0 && (
                <span className="whitespace-nowrap font-mono text-[11px] text-muted">
                  {pool.toLocaleString('es-CL')} apostando
                  {stakes && stakes.total > 0 && (
                    <span className="text-accent-deep"> · {formatCredits(stakes.total)}</span>
                  )}
                </span>
              )}
            </div>
            {/* Breakdown por bucket — solo si tenemos stakes y hay plata */}
            {stakes && stakes.total > 0 && (
              <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-subtle">
                <span className="truncate">
                  <span className="text-accent">●</span> {formatCredits(stakes.home)}
                </span>
                <span className="truncate">
                  <span className="text-subtle">●</span> {formatCredits(stakes.draw)}
                </span>
                <span className="truncate">
                  <span className="text-cyan">●</span> {formatCredits(stakes.away)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slide-down acordeon. Usamos grid trick para animar height auto sin
          medir manualmente: grid-template-rows va de 0fr a 1fr y el contenido
          colapsa con min-height:0 + overflow hidden. */}
      {canBet && (
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            <div className="border-t border-card-border px-[16px] pb-[14px] pt-1">
              <MatchMarketsPanel match={match} marketRows={marketRows} />
            </div>
          </div>
        </div>
      )}
    </article>
  )
}
