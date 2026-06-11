'use client'

import { useActionState } from 'react'
import { cashOutBet } from '@/features/bets/actions'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCredits, formatOdds } from '@/lib/utils/format'
import type { Bet } from '@/lib/types'

interface BetCardProps {
  bet: Bet
  locked?: boolean
}

const STATUS_MAP = {
  pending: { label: 'Pendiente', variant: 'warning' as const },
  won: { label: 'Ganada', variant: 'success' as const },
  lost: { label: 'Perdida', variant: 'danger' as const },
  cancelled: { label: 'Cancelada', variant: 'default' as const },
  cashed_out: { label: 'Cash Out', variant: 'info' as const },
}

export function BetCard({ bet, locked }: BetCardProps) {
  const status = STATUS_MAP[bet.status]
  const canCashOut = bet.status === 'pending' && !locked

  // Cashout fijo: 92% del stake. Misma formula que el server en cashOutBet.
  // NO depende de currentOdds: con stake × 0.92 no hace falta leer match.odds*
  // ni match_market_odds — el valor siempre es estable.
  const cashOutValue: number | null = canCashOut
    ? Math.round(Number(bet.amount) * 0.92 * 100) / 100
    : null

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
        <span className="text-[var(--casino-yellow)]">
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
