'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatOdds, formatCredits } from '@/lib/utils/format'
import { MIN_BET, MAX_BET } from '@/lib/constants'
import { placeParlay } from '@/features/bets/actions'
import { toast } from 'sonner'
import type { ParlayLeg } from '@/hooks/useParlay'

const STORAGE_KEY = 'mundial-parlay'

export function BetslipSidebar() {
  const [legs, setLegs] = useState<ParlayLeg[]>([])
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Poll localStorage for changes from other components
  useEffect(() => {
    const read = () => {
      try { setLegs(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')) } catch { /* */ }
    }
    read()
    const interval = setInterval(read, 500)
    return () => clearInterval(interval)
  }, [])

  const removeLeg = (matchId: string) => {
    const next = legs.filter(l => l.matchId !== matchId)
    setLegs(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const clearAll = () => {
    setLegs([])
    localStorage.setItem(STORAGE_KEY, '[]')
  }

  const totalOdds = legs.reduce((acc, leg) => acc * leg.odds, 1)
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
                <p className="text-xs text-slate-400">{leg.pickLabel} <span className="text-emerald-400">x{formatOdds(leg.odds)}</span></p>
              </div>
              <button onClick={() => removeLeg(leg.matchId)} className="text-slate-500 hover:text-red-400 ml-2">&times;</button>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-700 pt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Odds total</span>
            <span className="text-emerald-400 font-bold">x{formatOdds(totalOdds)}</span>
          </div>

          <input
            type="number"
            min={MIN_BET}
            max={MAX_BET}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder={`$${MIN_BET} - $${MAX_BET}`}
            className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          />

          {numAmount > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Ganancia potencial</span>
              <span className="text-emerald-400 font-semibold">{formatCredits(potentialPayout)}</span>
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
