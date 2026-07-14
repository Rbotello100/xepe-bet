'use client'

import { useState } from 'react'
import type { InPlayItem } from '@/features/bets/queries'

/**
 * "En juego $X" clickable — abre modal con la lista de bets/parlays pending
 * ordenados por potential payout. Los parlays se pueden expandir para ver
 * sus legs (click en la fila).
 */

interface Props {
  amount: number
  items: InPlayItem[]
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

export function InPlayDropdown({ amount, items }: Props) {
  const [open, setOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex flex-col text-left transition-opacity hover:opacity-80"
      >
        <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-subtle">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-deep" style={{ animation: 'live-pulse 1.8s infinite' }} />
          En juego
        </p>
        <p className="font-mono text-2xl font-bold text-accent-deep">
          ${amount.toLocaleString('es-CL')}
        </p>
        <p className="mt-0.5 text-[10px] text-subtle">bets pending · click para ver</p>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl rounded-xl border border-accent/40 bg-card p-5 shadow-2xl max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 rounded-full p-1.5 text-subtle hover:bg-sunken hover:text-strong"
              aria-label="Cerrar"
            >
              ✕
            </button>

            <div className="mb-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-accent-deep">Apuestas en juego</p>
              <p className="text-xl font-bold text-strong">
                ${amount.toLocaleString('es-CL')} <span className="text-xs font-normal text-muted">· {items.length} pendientes · click parlay para ver legs</span>
              </p>
            </div>

            <ul className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {items.length === 0 && (
                <li className="rounded-md border border-card-border bg-sunken/40 p-4 text-center text-xs text-muted">
                  Sin apuestas pendientes ahora.
                </li>
              )}
              {items.map(it => {
                const key = `${it.kind}-${it.id}`
                const expanded = expandedIds.has(key)
                const isParlay = it.kind === 'parlay'
                return (
                  <li key={key} className="rounded-md border border-card-border bg-sunken/40">
                    <div
                      className={`flex items-center gap-2 px-3 py-2 ${isParlay ? 'cursor-pointer hover:bg-sunken' : ''}`}
                      onClick={isParlay ? () => toggle(key) : undefined}
                    >
                      {it.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.avatar} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-[10px] font-bold text-accent-deep">
                          {it.user[0]}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold text-strong">
                          {it.user}
                          {isParlay && (
                            <span className="ml-1.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent-deep">
                              parlay · {it.legs_count} legs {expanded ? '▲' : '▼'}
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[11px] text-muted">
                          {isParlay ? (
                            <>{it.legs_count} selecciones combinadas · click para ver</>
                          ) : (
                            <>{it.pick_label} <span className="text-subtle">· {it.match_label}</span></>
                          )}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm font-bold text-strong">${it.stake.toLocaleString('es-CL')}</p>
                        <p className="text-[10px] text-muted">
                          x{it.odds.toFixed(2)} → <span className="text-win font-mono font-bold">${it.payout.toLocaleString('es-CL')}</span>
                        </p>
                      </div>
                      <span className="hidden shrink-0 text-[10px] text-subtle sm:inline">{timeAgo(it.created_at)}</span>
                    </div>

                    {isParlay && expanded && it.legs && (
                      <ul className="border-t border-card-border/60 bg-card/40 divide-y divide-card-border/40">
                        {it.legs.map((l, i) => {
                          const statusColor = l.status === 'won' ? 'text-win' : l.status === 'lost' ? 'text-danger' : l.status === 'void' ? 'text-subtle' : 'text-muted'
                          return (
                            <li key={i} className="flex items-center gap-2 px-3 py-1.5">
                              <span className="text-[10px] text-subtle font-mono w-4">{i + 1}.</span>
                              <div className="flex-1 min-w-0">
                                <p className="truncate text-xs font-semibold text-strong">{l.pick_label}</p>
                                <p className="truncate text-[10px] text-subtle">{l.match_label}</p>
                              </div>
                              <span className="shrink-0 font-mono text-xs text-accent-deep">x{l.odds.toFixed(2)}</span>
                              <span className={`shrink-0 text-[10px] font-bold uppercase ${statusColor}`}>{l.status}</span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
