'use client'

import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useParlay, type ParlayLeg } from '@/hooks/useParlay'
import { placeBet } from '@/features/bets/actions'
import { formatOdds, formatCredits } from '@/lib/utils/format'
import { MIN_BET } from '@/lib/constants'
import type { MatchWithTeams } from '@/lib/types'

/**
 * Una row de match_market_odds. El server precarga estos rows en MatchList
 * y los pasa a cada MatchCard, que a su vez los pasa al panel.
 */
export interface MarketOddsRow {
  market_type: string
  pick: string
  odds: number
  point: number | null
}

interface Tab {
  market_type: string
  label: string
  picks: Array<{ pick: string; label: string; odds: number }>
}

interface Props {
  match: MatchWithTeams
  marketRows: MarketOddsRow[]
}

const MARKET_ORDER: Array<{ market_type: string; label: string }> = [
  { market_type: '1x2',           label: '1X2' },
  { market_type: 'double_chance', label: 'Doble chance' },
  { market_type: 'btts',          label: 'BTTS' },
  { market_type: 'draw_no_bet',   label: 'Sin empate' },
  { market_type: 'totals_2.5',    label: 'Más/Menos 2.5' },
  { market_type: 'totals_1.5',    label: 'Más/Menos 1.5' },
  { market_type: 'totals_3.5',    label: 'Más/Menos 3.5' },
  { market_type: 'spreads_1.5',   label: 'Handicap 1.5' },
  { market_type: 'spreads_2.5',   label: 'Handicap 2.5' },
  { market_type: 'spreads_3.5',   label: 'Handicap 3.5' },
]

/**
 * Convierte rows raw del server en tabs renderizables. Cada tab agrupa los picks
 * de un mercado. Si un mercado no tiene rows, no aparece en los tabs.
 */
function buildTabs(match: MatchWithTeams, rows: MarketOddsRow[]): Tab[] {
  // 1X2 viene de la tabla matches directamente (legacy), no de match_market_odds.
  const tabs: Tab[] = []
  if (match.odds_home && match.odds_draw && match.odds_away) {
    tabs.push({
      market_type: '1x2',
      label: '1X2',
      picks: [
        { pick: 'home', label: `${match.home_team.name}`,  odds: match.odds_home },
        { pick: 'draw', label: 'Empate',                    odds: match.odds_draw },
        { pick: 'away', label: `${match.away_team.name}`,  odds: match.odds_away },
      ],
    })
  }

  // Agrupar rows por market_type
  const byMarket = new Map<string, MarketOddsRow[]>()
  for (const r of rows) {
    const arr = byMarket.get(r.market_type) ?? []
    arr.push(r)
    byMarket.set(r.market_type, arr)
  }

  for (const def of MARKET_ORDER) {
    if (def.market_type === '1x2') continue // ya esta arriba
    const rs = byMarket.get(def.market_type)
    if (!rs) continue
    const picks: Tab['picks'] = []
    for (const r of rs) {
      const label = pickLabel(def.market_type, r.pick, match)
      picks.push({ pick: r.pick, label, odds: Number(r.odds) })
    }
    if (picks.length > 0) tabs.push({ market_type: def.market_type, label: def.label, picks })
  }
  return tabs
}

function pickLabel(market_type: string, pick: string, match: MatchWithTeams): string {
  switch (market_type) {
    case 'double_chance':
      if (pick === '1X') return `${match.home_team.name} o Empate`
      if (pick === 'X2') return `Empate o ${match.away_team.name}`
      if (pick === '12') return `${match.home_team.name} o ${match.away_team.name}`
      return pick
    case 'btts':
      return pick === 'btts_yes' ? 'Sí (ambos anotan)' : 'No (no ambos)'
    case 'draw_no_bet':
      return pick === 'dnb_home' ? `${match.home_team.name} (sin empate)` : `${match.away_team.name} (sin empate)`
    case 'totals_1.5':
    case 'totals_2.5':
    case 'totals_3.5': {
      const point = market_type.split('_')[1]
      if (pick.startsWith('over_')) return `Más de ${point}`
      if (pick.startsWith('under_')) return `Menos de ${point}`
      return pick
    }
    case 'spreads_1.5':
    case 'spreads_2.5':
    case 'spreads_3.5': {
      // pick: 'home_-1.5' / 'home_+1.5' / 'away_-1.5' / 'away_+1.5'
      const m = pick.match(/^(home|away)_([+-]\d+\.\d+)$/)
      if (!m) return pick
      const team = m[1] === 'home' ? match.home_team.name : match.away_team.name
      return `${team} ${m[2]}`
    }
    default:
      return pick
  }
}

export function MatchMarketsPanel({ match, marketRows }: Props) {
  const tabs = useMemo(() => buildTabs(match, marketRows), [match, marketRows])
  const [activeMarket, setActiveMarket] = useState<string>(tabs[0]?.market_type ?? '1x2')
  const [selectedPick, setSelectedPick] = useState<{ pick: string; label: string; odds: number } | null>(null)
  const [amount, setAmount] = useState<string>('')
  const [submitting, setSubmitting] = useState<'bet' | 'parlay' | null>(null)

  const { legs, addLeg, removeLeg } = useParlay()
  const numAmount = parseFloat(amount) || 0
  const currentTab = tabs.find(t => t.market_type === activeMarket)
  // Guard contra double-click rapido en mobile. setSubmitting es async (batch
  // de React) y el primer click no llega a desactivar el boton antes del segundo.
  // useRef es sincrono y bloquea inmediato la segunda invocacion.
  const processingRef = useRef(false)

  if (tabs.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-card-border bg-sunken px-3 py-3 text-center text-xs text-subtle">
        Odds no disponibles todavía
      </div>
    )
  }

  const handleSelect = (pick: string, label: string, odds: number) => {
    setSelectedPick(prev => (prev?.pick === pick ? null : { pick, label, odds }))
  }

  const handleBetNow = async () => {
    if (!selectedPick || numAmount < MIN_BET) return
    if (processingRef.current) return
    processingRef.current = true
    setSubmitting('bet')
    try {
      const result = await placeBet({
        match_id: match.id,
        market_type: activeMarket,
        pick: selectedPick.pick,
        odds: selectedPick.odds,
        amount: numAmount,
      })
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Apuesta creada — premio potencial ${formatCredits(result.potential_payout ?? 0)}`)
        setSelectedPick(null)
        setAmount('')
      }
    } finally {
      setSubmitting(null)
      processingRef.current = false
    }
  }

  const handleAddToParlay = () => {
    if (!selectedPick) return
    if (processingRef.current) return
    processingRef.current = true
    setSubmitting('parlay')
    // Sobreescribir leg viejo del match (regla user: 1 pick por matchId)
    removeLeg(match.id)
    const leg: ParlayLeg = {
      matchId: match.id,
      matchLabel: `${match.home_team.name} vs ${match.away_team.name}`,
      market_type: activeMarket,
      pick: selectedPick.pick,
      pickLabel: selectedPick.label,
      odds: selectedPick.odds,
    }
    queueMicrotask(() => {
      addLeg(leg)
      toast.success('Agregado al parlay')
      setSelectedPick(null)
      setSubmitting(null)
      processingRef.current = false
    })
  }

  const alreadyInParlay = legs.some(l => l.matchId === match.id)

  return (
    <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
      {/* Tabs de mercado — scroll horizontal en mobile (7 tabs no caben a 375px) */}
      <div className="flex flex-nowrap gap-1.5 overflow-x-auto rounded-md border border-card-border bg-sunken p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map(t => (
          <button
            key={t.market_type}
            type="button"
            onClick={() => { setActiveMarket(t.market_type); setSelectedPick(null) }}
            className={`whitespace-nowrap shrink-0 rounded px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              activeMarket === t.market_type
                ? 'bg-accent text-background shadow-[0_2px_8px_color-mix(in_oklab,var(--color-accent)_35%,transparent)]'
                : 'text-muted hover:bg-card hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Picks del mercado activo — 2 cols en mobile (labels largos), 3 en sm+ cuando hay 3 picks */}
      {currentTab && (
        <div className={`grid gap-2 ${currentTab.picks.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {currentTab.picks.map(p => {
            const on = selectedPick?.pick === p.pick
            return (
              <button
                key={p.pick}
                type="button"
                onClick={() => handleSelect(p.pick, p.label, p.odds)}
                className={`flex flex-col items-center gap-0.5 rounded-md border py-2 px-2 transition-colors min-w-0 ${
                  on
                    ? 'border-accent bg-accent text-white shadow-[0_4px_16px_color-mix(in_oklab,var(--color-accent)_40%,transparent)]'
                    : 'border-card-border bg-card hover:border-accent hover:bg-accent-soft'
                }`}
              >
                <span className={`block w-full truncate text-[10px] leading-tight text-center ${on ? 'text-white/85' : 'text-muted'}`}>
                  {p.label}
                </span>
                <span className={`font-mono text-[14px] font-bold ${on ? 'text-white' : 'text-foreground'}`}>
                  {formatOdds(p.odds)}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Input + 2 botones */}
      {selectedPick && (
        <div className="space-y-2 rounded-md border border-card-border bg-sunken p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Selección:</span>
            <span className="font-semibold text-strong">{selectedPick.label} <span className="text-accent-deep">x{formatOdds(selectedPick.odds)}</span></span>
          </div>
          <input
            type="number"
            inputMode="decimal"
            min={MIN_BET}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder={`Monto a apostar (min $${MIN_BET})`}
            className="w-full rounded border border-card-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-subtle focus:border-accent focus:outline-none"
          />
          {numAmount >= MIN_BET && (
            <p className="text-right text-[11px] text-subtle">
              Premio potencial: <span className="font-mono text-accent-deep">{formatCredits(numAmount * selectedPick.odds)}</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={handleBetNow}
              disabled={numAmount < MIN_BET || submitting !== null}
              className="rounded-md bg-accent px-3 py-2 text-sm font-bold text-background shadow-[0_4px_16px_color-mix(in_oklab,var(--color-accent)_30%,transparent)] transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting === 'bet' ? 'Apostando…' : 'Apostar ahora'}
            </button>
            <button
              type="button"
              onClick={handleAddToParlay}
              disabled={submitting !== null}
              className="rounded-md border border-card-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:border-accent hover:bg-accent-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {alreadyInParlay ? 'Reemplazar en parlay' : 'Agregar al parlay'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
