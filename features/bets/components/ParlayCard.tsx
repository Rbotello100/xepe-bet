import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatCredits, formatOdds } from '@/lib/utils/format'
import type { ParlayWithLegs } from '@/features/bets/queries'

const STATUS_MAP = {
  pending: { label: 'Pendiente', variant: 'warning' as const },
  won: { label: 'Ganado', variant: 'success' as const },
  lost: { label: 'Perdido', variant: 'danger' as const },
}

const PICK_LABELS: Record<string, string> = {
  home: 'Local',
  draw: 'Empate',
  away: 'Visita',
  btts_yes: 'Ambos marcan: Si',
  btts_no: 'Ambos marcan: No',
  '1X': 'Doble oportunidad: 1X',
  'X2': 'Doble oportunidad: X2',
  '12': 'Doble oportunidad: 12',
  dnb_home: 'Sin empate: Local',
  dnb_away: 'Sin empate: Visita',
}

function formatPick(pick: string): string {
  if (PICK_LABELS[pick]) return PICK_LABELS[pick]
  if (pick.startsWith('over_')) return `Mas de ${pick.replace('over_', '')} goles`
  if (pick.startsWith('under_')) return `Menos de ${pick.replace('under_', '')} goles`
  if (pick.startsWith('score_')) return `Marcador: ${pick.replace('score_', '')}`
  return pick
}

export function ParlayCard({ parlay }: { parlay: ParlayWithLegs }) {
  const status = STATUS_MAP[parlay.status as keyof typeof STATUS_MAP] ?? STATUS_MAP.pending

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="info">Parlay</Badge>
          <span className="text-sm font-semibold text-emerald-400">x{formatOdds(parlay.total_odds)}</span>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <div className="space-y-1">
        {parlay.legs.map(leg => {
          const home = leg.match?.home_team?.name ?? '?'
          const away = leg.match?.away_team?.name ?? '?'

          return (
            <div key={leg.id} className="rounded bg-slate-700/50 px-3 py-2">
              <p className="text-xs text-slate-500">{home} vs {away}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white">{formatPick(leg.pick)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-emerald-400">x{formatOdds(leg.odds)}</span>
                  {leg.status !== 'pending' && (
                    <Badge variant={leg.status === 'won' ? 'success' : 'danger'}>
                      {leg.status === 'won' ? 'OK' : 'X'}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between text-sm border-t border-slate-700 pt-2">
        <span className="text-slate-400">Apostado: {formatCredits(parlay.amount)}</span>
        <span className="text-emerald-400 font-semibold">Potencial: {formatCredits(parlay.potential_payout)}</span>
      </div>
    </Card>
  )
}
