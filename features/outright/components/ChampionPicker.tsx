'use client'

import { useState, useRef, useTransition } from 'react'
import { toast } from 'sonner'
import { placeOutrightBet } from '../actions'
import type { OutrightMarket, OutrightOutcome } from '../queries'
import { MIN_BET } from '@/lib/constants'

interface Props {
  market: OutrightMarket
  outcomes: OutrightOutcome[]
  userCredits: number
}

export function ChampionPicker({ market, outcomes, userCredits }: Props) {
  const [selected, setSelected] = useState<OutrightOutcome | null>(null)
  const [amount, setAmount] = useState('')
  const [isPending, startTransition] = useTransition()
  const processingRef = useRef(false)

  const numAmount = parseFloat(amount) || 0
  const potential = selected ? Math.round(numAmount * selected.odds * 100) / 100 : 0
  const isClosed = market.status !== 'open' || new Date(market.closes_at).getTime() < Date.now()

  const handlePlace = () => {
    if (!selected || numAmount < MIN_BET || isClosed || processingRef.current) return
    if (numAmount > userCredits) {
      toast.error('No tenés créditos suficientes')
      return
    }
    processingRef.current = true
    startTransition(async () => {
      try {
        const res = await placeOutrightBet({
          market_id: market.id,
          team_name: selected.team_name,
          amount: numAmount,
          expected_odds: selected.odds,
        })
        if (res.error) {
          toast.error(res.error)
        } else {
          toast.success(`Apuesta colocada · ${selected.team_name} · gana $${res.potential_payout?.toLocaleString('es-CL')}`)
          setSelected(null)
          setAmount('')
        }
      } finally {
        processingRef.current = false
      }
    })
  }

  if (outcomes.length === 0) {
    return (
      <div className="rounded-xl border border-card-border bg-card p-5 text-center">
        <p className="text-2xl">⏳</p>
        <p className="mt-1.5 text-xs text-muted">Cuotas en camino — refrescá en un rato</p>
      </div>
    )
  }

  if (market.status === 'settled') {
    return (
      <div className="rounded-xl border border-card-border bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-win)_20%,var(--color-card)),var(--color-card))] p-5 text-center">
        <p className="text-3xl">🏆</p>
        <p className="mt-1 text-xs uppercase tracking-wider text-subtle">Campeón</p>
        <p className="text-xl font-extrabold text-win">{market.winner_team}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header compacto inline con estado */}
      <div className="flex items-center justify-between rounded-lg border border-card-border bg-card px-3.5 py-2">
        <div className="flex items-center gap-2">
          {isClosed ? (
            <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger">Cerrado</span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-win/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-win">
              <span className="h-1.5 w-1.5 rounded-full bg-win" style={{ animation: 'live-pulse 1.8s infinite' }} />
              Abierto
            </span>
          )}
          <span className="text-[11px] text-muted">
            {isClosed ? 'Esperando la final' : `Cierra ${new Date(market.closes_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`}
          </span>
        </div>
        <span className="text-[10px] text-subtle">{outcomes.length} equipos</span>
      </div>

      {/* Grid denso: ~6 columnas en desktop, scroll vertical */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {outcomes.map(o => {
          const isSelected = selected?.team_name === o.team_name
          return (
            <button
              key={o.id}
              onClick={() => setSelected(isSelected ? null : o)}
              disabled={isClosed}
              className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isSelected
                  ? 'border-accent bg-accent/15 ring-1 ring-accent'
                  : 'border-card-border bg-card hover:bg-sunken'
              }`}
            >
              <span className="truncate text-xs font-medium text-strong">{o.team_name}</span>
              <span className="ml-2 font-mono text-xs font-bold text-accent-deep">x{o.odds.toFixed(2)}</span>
            </button>
          )
        })}
      </div>

      {/* Bet builder sticky compacto */}
      {selected && !isClosed && (
        <div className="sticky bottom-3 rounded-lg border border-accent bg-card p-3 shadow-2xl">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-bold text-strong">{selected.team_name}</p>
              <p className="font-mono text-[11px] text-accent-deep">x{selected.odds.toFixed(2)}</p>
            </div>
            <input
              type="number"
              inputMode="decimal"
              min={MIN_BET}
              max={userCredits}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="$"
              className="w-20 rounded-md border border-card-border bg-sunken px-2 py-1.5 text-sm text-strong placeholder:text-subtle focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              onClick={handlePlace}
              disabled={isPending || numAmount < MIN_BET || numAmount > userCredits}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? '…' : 'Apostar'}
            </button>
            <button
              onClick={() => { setSelected(null); setAmount('') }}
              className="rounded-md border border-card-border px-2 py-1.5 text-xs text-muted hover:bg-sunken"
              aria-label="Cancelar"
            >
              ✕
            </button>
          </div>
          {numAmount >= MIN_BET && (
            <p className="mt-1.5 text-[10px] text-muted">
              Premio: <span className="font-mono font-bold text-win">${potential.toLocaleString('es-CL')}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
