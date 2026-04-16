'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { placeBet } from '@/features/bets/actions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { formatOdds, formatCredits } from '@/lib/utils/format'
import { MIN_BET, MAX_BET } from '@/lib/constants'
import type { MatchWithTeams } from '@/lib/types'

interface BetSlipProps {
  match: MatchWithTeams
  pick: string
  odds: number
  onClose: () => void
}

type BetState = { success?: boolean; error?: string; potential_payout?: number } | null

const QUICK_AMOUNTS = [10, 25, 50, 100]

export function BetSlip({ match, pick, odds, onClose }: BetSlipProps) {
  const [amount, setAmount] = useState('')
  const numAmount = parseFloat(amount) || 0
  const potentialPayout = numAmount * odds

  const pickLabel = pick === 'home' ? match.home_team.name
    : pick === 'away' ? match.away_team.name
    : pick === 'draw' ? 'Empate'
    : pick

  const [state, formAction, isPending] = useActionState(
    async (_prev: BetState) => {
      return placeBet({
        match_id: match.id,
        market_type: '1x2',
        pick,
        amount: numAmount,
        odds,
      })
    },
    null
  )

  return (
    <Card className="space-y-4 border-[var(--casino-red)]/50">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white">Apostar</p>
        <button onClick={onClose} className="text-slate-500 hover:text-white text-lg">&times;</button>
      </div>

      <div className="text-center">
        <p className="text-sm text-slate-400">{pickLabel}</p>
        <p className="text-2xl font-bold text-[var(--casino-yellow)]">x{formatOdds(odds)}</p>
      </div>

      <div className="flex gap-2">
        {QUICK_AMOUNTS.map(q => (
          <button
            key={q}
            type="button"
            onClick={() => setAmount(q.toString())}
            className="flex-1 rounded-lg border border-slate-600 py-1.5 text-xs text-slate-300 hover:border-[var(--casino-red)] transition-colors"
          >
            ${q}
          </button>
        ))}
      </div>

      <div>
        <input
          type="number"
          min={MIN_BET}
          max={MAX_BET}
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder={`Monto ($${MIN_BET}-$${MAX_BET})`}
          className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[var(--casino-red)] focus:outline-none"
        />
      </div>

      {numAmount > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Ganancia potencial</span>
          <span className="text-[var(--casino-yellow)] font-semibold">{formatCredits(potentialPayout)}</span>
        </div>
      )}

      <form action={formAction}>
        <Button
          type="submit"
          disabled={isPending || numAmount < MIN_BET}
          className="w-full"
          size="lg"
        >
          {isPending ? 'Apostando...' : `Apostar ${numAmount > 0 ? formatCredits(numAmount) : ''}`}
        </Button>
      </form>

      {state?.error && <p className="text-sm text-red-400 text-center">{state.error}</p>}
      {state?.success && <p className="text-sm text-[var(--casino-yellow)] text-center">Apuesta realizada</p>}
    </Card>
  )
}
