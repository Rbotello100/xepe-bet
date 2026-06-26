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
          toast.success(`¡Apuesta colocada! Ganás $${res.potential_payout?.toLocaleString('es-CL')} si ${selected.team_name} sale campeón`)
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
      <div className="rounded-xl border border-card-border bg-card p-8 text-center">
        <p className="text-3xl">⏳</p>
        <p className="mt-2 text-sm font-medium text-strong">Las cuotas están en camino</p>
        <p className="mt-1 text-xs text-muted">El cron va a poblar los equipos en las próximas horas</p>
      </div>
    )
  }

  if (market.status === 'settled') {
    return (
      <div className="rounded-xl border border-card-border bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-win)_20%,var(--color-card)),var(--color-card))] p-8 text-center">
        <p className="text-5xl">🏆</p>
        <p className="mt-2 text-lg font-bold text-strong">Campeón Mundial 2026</p>
        <p className="mt-1 text-2xl font-extrabold text-win">{market.winner_team}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-card-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-strong">{market.market_name}</h2>
          {isClosed ? (
            <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger">Cerrado</span>
          ) : (
            <span className="rounded-full bg-win/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-win">Abierto</span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">
          {isClosed
            ? 'No se aceptan más apuestas. Esperando la final.'
            : `Cierra el ${new Date(market.closes_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })} (inicio de octavos)`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {outcomes.map(o => {
          const isSelected = selected?.team_name === o.team_name
          return (
            <button
              key={o.id}
              onClick={() => setSelected(isSelected ? null : o)}
              disabled={isClosed}
              className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isSelected
                  ? 'border-accent bg-accent/15 ring-2 ring-accent'
                  : 'border-card-border bg-card hover:bg-sunken'
              }`}
            >
              <span className="text-xs font-semibold text-strong">{o.team_name}</span>
              <span className="mt-1 font-mono text-lg font-bold text-accent-deep">x{o.odds.toFixed(2)}</span>
            </button>
          )
        })}
      </div>

      {selected && !isClosed && (
        <div className="sticky bottom-4 rounded-xl border border-accent bg-card p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-subtle">Apostando a</p>
              <p className="font-bold text-strong">{selected.team_name}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-subtle">Cuota</p>
              <p className="font-mono text-lg font-bold text-accent-deep">x{selected.odds.toFixed(2)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={MIN_BET}
              max={userCredits}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Monto"
              className="flex-1 rounded-md border border-card-border bg-sunken px-3 py-2 text-sm text-strong placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              onClick={handlePlace}
              disabled={isPending || numAmount < MIN_BET || numAmount > userCredits}
              className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-slate-900 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? 'Apostando…' : 'Apostar'}
            </button>
          </div>
          {numAmount >= MIN_BET && (
            <p className="mt-2 text-xs text-muted">
              Premio potencial: <span className="font-mono font-bold text-win">${potential.toLocaleString('es-CL')}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
