'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatOdds, formatCredits } from '@/lib/utils/format'
import { MIN_BET, MAX_BET } from '@/lib/constants'
import { placeParlay } from '@/features/bets/actions'
import { toast } from 'sonner'
import { useParlay } from '@/hooks/useParlay'

export function BetslipSidebar() {
  // Toda la lectura/escritura de localStorage vive en useParlay (scoped por
  // userId + listener `parlay-updated` para sincronizar instancias). Antes
  // este componente hacia localStorage.setItem directo y rompia el sync con
  // los MatchCards y el ParlayIndicator.
  const { legs, removeLeg, clearAll, totalOdds } = useParlay()
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const numAmount = parseFloat(amount) || 0
  const potentialPayout = numAmount * totalOdds

  const handleSubmit = async () => {
    if (legs.length < 2 || numAmount < MIN_BET) return
    setSubmitting(true)
    const result = await placeParlay({
      legs: legs.map(l => ({ match_id: l.matchId, market_type: '1x2', pick: l.pick, odds: l.odds })),
      amount: numAmount,
    })
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`Parlay creado! Potencial: ${formatCredits(result.potential_payout!)}`)
      clearAll()
      setAmount('')
    }
    setSubmitting(false)
  }

  if (legs.length === 0) {
    return (
      <div className="sticky top-20 space-y-3">
        <Card className="text-center py-8 space-y-2">
          <p className="text-2xl">🎯</p>
          <p className="text-sm font-medium text-white">Talonera</p>
          <p className="text-xs text-slate-500">Selecciona odds de los partidos para armar tu parlay</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="sticky top-20 space-y-3">
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Talonera ({legs.length})</p>
          <button onClick={clearAll} className="text-xs text-slate-500 hover:text-red-400">Limpiar</button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {legs.map(leg => (
            <div key={leg.matchId} className="flex items-start justify-between rounded-lg bg-slate-700/50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white truncate">{leg.matchLabel}</p>
                <p className="text-xs text-slate-400">{leg.pickLabel} <span className="text-[var(--casino-yellow)]">x{formatOdds(leg.odds)}</span></p>
              </div>
              <button onClick={() => removeLeg(leg.matchId)} className="text-slate-500 hover:text-red-400 ml-2">&times;</button>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-700 pt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Odds total</span>
            <span className="text-[var(--casino-yellow)] font-bold">x{formatOdds(totalOdds)}</span>
          </div>

          <input
            type="number"
            min={MIN_BET}
            max={MAX_BET}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder={`$${MIN_BET} - $${MAX_BET}`}
            className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-[var(--casino-red)] focus:outline-none"
          />

          {numAmount > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Ganancia potencial</span>
              <span className="text-[var(--casino-yellow)] font-semibold">{formatCredits(potentialPayout)}</span>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={legs.length < 2 || numAmount < MIN_BET || submitting}
            className="w-full"
            size="sm"
          >
            {submitting ? 'Apostando...' : `Apostar Parlay`}
          </Button>
        </div>
      </Card>
    </div>
  )
}
