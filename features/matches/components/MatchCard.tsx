'use client'

import Link from 'next/link'
import type { MatchWithTeams } from '@/lib/types'
import { formatDate, formatOdds } from '@/lib/utils/format'
import { BET_LOCK_HOURS } from '@/lib/constants'
import { useParlay, type ParlayLeg } from '@/hooks/useParlay'

interface MatchCardProps {
  match: MatchWithTeams
  /** Distribucion de la multitud [%home, %draw, %away]. Mock por ahora — futuro: agregada de picks. */
  dist?: [number, number, number]
  /** N apostando en el partido. Mock — futuro: count de bets activas. */
  pool?: number
}

const LABELS = ['1', 'X', '2'] as const
const SIDES = ['home', 'draw', 'away'] as const

function PickBar({ dist }: { dist: [number, number, number] }) {
  const [h, x, a] = dist
  return (
    <div
      className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"
      title={`${h}% local · ${x}% empate · ${a}% visita`}
    >
      <span className="h-full bg-accent" style={{ width: `${h}%` }} />
      <span className="h-full bg-subtle" style={{ width: `${x}%` }} />
      <span className="h-full bg-cyan" style={{ width: `${a}%` }} />
    </div>
  )
}

export function MatchCard({ match, dist = [62, 22, 16], pool }: MatchCardProps) {
  const { legs, addLeg, removeLeg } = useParlay()
  const isFinished = match.status === 'finished'
  const isLive = match.status === 'live'
  const lockCutoff = new Date(new Date(match.starts_at).getTime() - BET_LOCK_HOURS * 60 * 60 * 1000)
  const isLocked = new Date() >= lockCutoff
  const showOdds = !isFinished && !isLocked && match.odds_home

  const currentLeg = legs.find((l) => l.matchId === match.id)
  const selectedPick = currentLeg?.pick ?? null

  const togglePick = (pick: string, label: string, odds: number) => {
    if (selectedPick === pick) {
      removeLeg(match.id)
      return
    }
    // Reemplazar: useParlay.addLeg ignora si ya hay leg de ese matchId, asi
    // que primero removemos.
    if (selectedPick) removeLeg(match.id)
    const leg: ParlayLeg = {
      matchId: match.id,
      matchLabel: `${match.home_team.name} vs ${match.away_team.name}`,
      pick,
      pickLabel: label,
      odds,
    }
    // microtask para que el remove se aplique antes del add
    queueMicrotask(() => addLeg(leg))
  }

  const odds = [match.odds_home, match.odds_draw, match.odds_away]

  return (
    <article
      className={`rounded-lg border bg-card p-[14px_16px] transition-[border-color,transform] hover:-translate-y-px ${
        isLive ? 'border-win/40' : 'border-card-border hover:border-accent/45'
      }`}
    >
      {/* top — clickeable -> /match/[id] */}
      <Link href={`/match/${match.id}`} className="mb-[11px] flex items-center justify-between">
        <span className="text-xs text-subtle">
          {match.group_name ? `Grupo ${match.group_name}` : match.round}
          {' · '}
          {formatDate(match.starts_at)}
        </span>
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
      </Link>

      {/* teams — clickeable -> /match/[id] */}
      <Link href={`/match/${match.id}`} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
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
      </Link>

      {/* odds — click = toggle Betslip */}
      {showOdds && (
        <div className="mt-[13px] grid grid-cols-3 gap-2">
          {odds.map((o, i) => {
            const pick = SIDES[i]
            const label = LABELS[i]
            const on = selectedPick === pick
            return (
              <button
                key={i}
                onClick={() => togglePick(pick, label, o!)}
                className={`flex flex-col items-center gap-0.5 rounded-md border py-[9px] transition-colors ${
                  on
                    ? 'border-accent bg-accent text-white shadow-[0_4px_16px_color-mix(in_oklab,var(--color-accent)_40%,transparent)]'
                    : 'border-card-border bg-sunken hover:border-accent hover:bg-accent-soft'
                }`}
              >
                <span className={`text-[11px] font-semibold ${on ? 'text-white/80' : 'text-muted'}`}>
                  {label}
                </span>
                <span className={`font-mono text-[15px] font-bold ${on ? 'text-white' : 'text-foreground'}`}>
                  {formatOdds(o)}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* foot: pickbar + N apostando */}
      {!isFinished && (
        <div className="mt-[11px] flex items-center gap-3">
          <PickBar dist={dist} />
          {pool !== undefined && (
            <span className="whitespace-nowrap font-mono text-[11px] text-muted">
              {pool.toLocaleString('es-CL')} apostando
            </span>
          )}
        </div>
      )}
    </article>
  )
}
