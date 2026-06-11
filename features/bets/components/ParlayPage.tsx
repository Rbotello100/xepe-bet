'use client'

import { useParlay } from '@/hooks/useParlay'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatOdds, formatCredits } from '@/lib/utils/format'
import { useState } from 'react'
import { MIN_BET, MAX_BET } from '@/lib/constants'
import { placeParlay } from '@/features/bets/actions'
import { toast } from 'sonner'

interface ParlayPageProps {
  credits: number
}

export function ParlayPage({ credits }: ParlayPageProps) {
  const { legs, removeLeg, clearAll, totalOdds } = useParlay()
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const numAmount = parseFloat(amount) || 0
  const potentialPayout = numAmount * totalOdds

  const handleSubmit = async () => {
    setSubmitting(true)
    const result = await placeParlay({
      legs: legs.map(l => ({
        match_id: l.matchId,
        market_type: l.market_type,
        pick: l.pick,
        odds: l.odds,
      })),
      amount: numAmount,
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`Parlay creado! Ganancia potencial: ${formatCredits(result.potential_payout!)}`)
      clearAll()
      setAmount('')
    }
    setSubmitting(false)
  }

  if (legs.length === 0) {
    return (
      <Card className="text-center py-12 space-y-3">
        <p className="text-3xl">🎯</p>
        <p className="text-white font-medium">Tu parlay esta vacio</p>
        <p className="text-sm text-slate-400">
          Ve a un partido y agrega selecciones para armar tu apuesta combinada
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {legs.map(leg => (
          <Card key={leg.matchId} className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">{leg.matchLabel}</p>
              <p className="text-xs text-slate-400">{leg.pickLabel} -- x{formatOdds(leg.odds)}</p>
            </div>
            <button
              onClick={() => removeLeg(leg.matchId)}
              className="text-slate-500 hover:text-red-400 text-lg px-2"
            >
              &times;
            </button>
          </Card>
        ))}
      </div>

      <Card className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Selecciones</span>
          <span className="text-white">{legs.length}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Odds total</span>
          <span className="text-[var(--casino-yellow)] font-bold text-lg">x{formatOdds(totalOdds)}</span>
        </div>

        <input
          type="number"
          min={MIN_BET}
          max={MAX_BET}
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder={`Monto ($${MIN_BET}-$${MAX_BET})`}
          className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[var(--casino-red)] focus:outline-none"
        />

        {numAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Ganancia potencial</span>
            <span className="text-[var(--casino-yellow)] font-semibold">{formatCredits(potentialPayout)}</span>
          </div>
        )}

        <Button
          disabled={legs.length < 2 || numAmount < MIN_BET || submitting}
          className="w-full"
          size="lg"
          onClick={handleSubmit}
        >
          {submitting ? 'Apostando...' : `Apostar Parlay (${legs.length} selecciones)`}
        </Button>

        <Button variant="ghost" size="sm" onClick={clearAll} className="w-full">
          Limpiar todo
        </Button>

        <p className="text-xs text-slate-600 text-center">Creditos: ${credits}</p>
      </Card>
    </div>
  )
}
