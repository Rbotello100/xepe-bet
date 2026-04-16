'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { BetSlip } from './BetSlip'
import { formatOdds } from '@/lib/utils/format'
import { calculateDerivedMarkets, type DerivedMarket } from '@/lib/utils/derived-odds'
import { useParlay } from '@/hooks/useParlay'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import type { MatchWithTeams } from '@/lib/types'

interface MatchBettingProps {
  match: MatchWithTeams
  locked: boolean
  credits: number
}

export function MatchBetting({ match, locked, credits }: MatchBettingProps) {
  const [selectedPick, setSelectedPick] = useState<string | null>(null)
  const [selectedOdds, setSelectedOdds] = useState<number>(0)
  const [selectedMarket, setSelectedMarket] = useState<string>('1x2')
  const [activeTab, setActiveTab] = useState(0)
  const { addLeg, legs } = useParlay()

  if (locked) {
    return (
      <Card className="text-center text-slate-500 text-sm py-6">
        Apuestas cerradas (menos de 1 hora para el partido)
      </Card>
    )
  }

  // Build all markets
  const markets: { key: string; label: string; options: { pick: string; label: string; odds: number }[] }[] = []

  // Primary 1X2
  if (match.odds_home && match.odds_draw && match.odds_away) {
    markets.push({
      key: '1x2',
      label: '1X2',
      options: [
        { pick: 'home', label: match.home_team.name, odds: match.odds_home },
        { pick: 'draw', label: 'Empate', odds: match.odds_draw },
        { pick: 'away', label: match.away_team.name, odds: match.odds_away },
      ],
    })

    // Derived markets
    const derived = calculateDerivedMarkets(match.odds_home, match.odds_draw, match.odds_away)
    markets.push(...derived)
  }

  const handleSelect = (pick: string, odds: number, marketKey: string) => {
    if (selectedPick === pick) {
      setSelectedPick(null)
      return
    }
    setSelectedPick(pick)
    setSelectedOdds(odds)
    setSelectedMarket(marketKey)
  }

  const handleAddToParlay = () => {
    if (!selectedPick) return

    const alreadyInParlay = legs.some(l => l.matchId === match.id)
    if (alreadyInParlay) {
      toast.error('Este partido ya esta en tu parlay')
      return
    }

    const market = markets.find(m => m.key === selectedMarket)
    const option = market?.options.find(o => o.pick === selectedPick)

    addLeg({
      matchId: match.id,
      matchLabel: `${match.home_team.name} vs ${match.away_team.name}`,
      pick: selectedPick,
      pickLabel: option?.label ?? selectedPick,
      odds: selectedOdds,
    })

    toast.success('Agregado al parlay')
    setSelectedPick(null)
  }

  if (markets.length === 0) {
    return (
      <Card className="text-center text-slate-500 text-sm py-6">
        Odds no disponibles todavia
      </Card>
    )
  }

  const currentMarket = markets[activeTab]

  return (
    <div className="space-y-3">
      {/* Market tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {markets.map((market, i) => (
          <button
            key={market.key}
            onClick={() => { setActiveTab(i); setSelectedPick(null) }}
            className={clsx(
              'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors flex-shrink-0',
              activeTab === i
                ? 'bg-[var(--casino-red)] text-white'
                : 'bg-slate-700 text-slate-400 hover:text-white'
            )}
          >
            {market.label}
          </button>
        ))}
      </div>

      {/* Market options */}
      <div className={clsx(
        'gap-2',
        currentMarket.options.length <= 3 ? 'flex' : 'grid grid-cols-3'
      )}>
        {currentMarket.options.map(({ pick, label, odds }) => (
          <button
            key={pick}
            onClick={() => handleSelect(pick, odds, currentMarket.key)}
            className={clsx(
              'rounded-lg border px-3 py-3 text-center transition-all min-h-[44px]',
              currentMarket.options.length <= 3 && 'flex-1',
              selectedPick === pick
                ? 'border-[var(--casino-red)] bg-[var(--casino-red)]/20'
                : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
            )}
          >
            <span className="block text-xs text-slate-400 truncate">{label}</span>
            <span className={clsx(
              'block text-sm font-semibold',
              selectedPick === pick ? 'text-[var(--casino-yellow)]' : 'text-slate-300'
            )}>
              x{formatOdds(odds)}
            </span>
          </button>
        ))}
      </div>

      {/* BetSlip + Add to Parlay */}
      {selectedPick && (
        <>
          <BetSlip
            match={match}
            pick={selectedPick}
            odds={selectedOdds}
            onClose={() => setSelectedPick(null)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddToParlay}
            className="w-full"
          >
            + Agregar al Parlay
          </Button>
        </>
      )}

      <p className="text-xs text-slate-600 text-center">
        Creditos disponibles: ${credits}
      </p>
    </div>
  )
}
