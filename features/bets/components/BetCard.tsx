'use client'

import { useActionState } from 'react'
import { cashOutBet } from '@/features/bets/actions'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCredits, formatOdds } from '@/lib/utils/format'
import { calculateCashOut } from '@/lib/utils/cash-out'
import type { Bet } from '@/lib/types'

interface BetCardProps {
  bet: Bet
  currentOdds?: { home: number | null; draw: number | null; away: number | null }
  locked?: boolean
}

const STATUS_MAP = {
  pending: { label: 'Pendiente', variant: 'warning' as const },
  won: { label: 'Ganada', variant: 'success' as const },
  lost: { label: 'Perdida', variant: 'danger' as const },
  cancelled: { label: 'Cancelada', variant: 'default' as const },
  cashed_out: { label: 'Cash Out', variant: 'info' as const },
}

export function BetCard({ bet, currentOdds, locked }: BetCardProps) {
  const status = STATUS_MAP[bet.status]
  const canCashOut = bet.status === 'pending' && !locked && currentOdds

  let cashOutValue: number | null = null
  if (canCashOut && currentOdds) {
    const current = bet.pick === 'home' || bet.pick === '1' ? currentOdds.home
      : bet.pick === 'away' || bet.pick === '2' ? currentOdds.away
      : currentOdds.draw
    if (current) {
      cashOutValue = Math.round(calculateCashOut(bet.odds_at_placement, current, bet.amount) * 100) / 100
    }
  }

  const [cashOutState, cashOutAction, isCashingOut] = useActionState(
    async () => cashOutBet(bet.id),
    null
  )

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-white font-medium">{bet.pick}</span>
          <span className="text-xs text-slate-500 ml-2">x{formatOdds(bet.odds_at_placement)}</span>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">Apostado: {formatCredits(bet.amount)}</span>
        <span className="text-emerald-400">
          {bet.status === 'cashed_out'
            ? `Cash out: ${formatCredits(bet.cash_out_amount!)}`
            : `Potencial: ${formatCredits(bet.potential_payout)}`
          }
        </span>
      </div>

      {canCashOut && cashOutValue != null && (
        <form action={cashOutAction}>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={isCashingOut}
            className="w-full"
          >
            {isCashingOut ? 'Procesando...' : `Cash Out ${formatCredits(cashOutValue)}`}
          </Button>
        </form>
      )}

      {cashOutState?.error && <p className="text-xs text-red-400">{cashOutState.error}</p>}
    </Card>
  )
}
