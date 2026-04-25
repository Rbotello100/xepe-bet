'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { clsx } from 'clsx'
import { placeFelipeBets, revealFelipe } from '@/features/casino/actions'
import {
  FELIPE_ROOMS,
  FELIPE_CHIPS,
  getRoomMultiplier,
  type FelipeCategory,
} from '@/features/casino/felipe-config'

type Phase = 'betting' | 'placed' | 'revealed'

interface CategoryStyle {
  badge: string
  text: string
}

const CATEGORY_STYLES: Record<FelipeCategory, CategoryStyle> = {
  revenue: { badge: 'bg-emerald-500/20 text-emerald-300', text: 'revenue' },
  stakeholder: { badge: 'bg-purple-500/20 text-purple-300', text: 'stakeholder' },
  ops: { badge: 'bg-blue-500/20 text-blue-300', text: 'ops' },
  analytics: { badge: 'bg-cyan-500/20 text-cyan-300', text: 'analytics' },
  misterio: { badge: 'bg-amber-500/20 text-amber-300', text: 'misterio' },
  amigos: { badge: 'bg-pink-500/20 text-pink-300', text: 'amigos' },
  cultura: { badge: 'bg-fuchsia-500/20 text-fuchsia-300', text: 'cultura' },
  producto: { badge: 'bg-indigo-500/20 text-indigo-300', text: 'producto' },
  negociacion: { badge: 'bg-orange-500/20 text-orange-300', text: 'negociacion' },
}

interface RoundResult {
  winningRoom: string
  winningRoomName: string
  payout: number
  totalBet: number
}

export function FelipeGame({ credits }: { credits: number }) {
  const [phase, setPhase] = useState<Phase>('betting')
  const [selectedChip, setSelectedChip] = useState<number>(50)
  const [bets, setBets] = useState<Record<string, number>>({}) // roomId → amount
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [result, setResult] = useState<RoundResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const totalBet = Object.values(bets).reduce((a, b) => a + b, 0)
  const remainingBalance = credits - totalBet

  const handleRoomClick = (roomId: string) => {
    if (phase !== 'betting') return
    if (bets[roomId]) return // ya tiene apuesta — un click = una sala (sin stackear)
    if (selectedChip > remainingBalance) {
      setError('Creditos insuficientes para este chip')
      return
    }
    setError(null)
    setBets(prev => ({ ...prev, [roomId]: selectedChip }))
  }

  const handleRoomRemove = (roomId: string) => {
    if (phase !== 'betting') return
    setBets(prev => {
      const next = { ...prev }
      delete next[roomId]
      return next
    })
  }

  const handlePlaceBets = () => {
    if (Object.keys(bets).length === 0) {
      setError('Tenes que apostar a al menos una sala')
      return
    }
    setError(null)
    startTransition(async () => {
      const payload = Object.entries(bets).map(([room_id, amount]) => ({ room_id, amount }))
      const res = (await placeFelipeBets(payload)) as { error?: string; sessionId?: string }
      if (res.error) {
        setError(res.error)
        return
      }
      if (res.sessionId) {
        setSessionId(res.sessionId)
        setPhase('placed')
      }
    })
  }

  const handleReveal = () => {
    if (!sessionId) return
    startTransition(async () => {
      const res = (await revealFelipe(sessionId)) as {
        error?: string
        winningRoom?: string
        winningRoomName?: string
        payout?: number
        totalBet?: number
      }
      if (res.error) {
        setError(res.error)
        return
      }
      if (res.winningRoom && res.winningRoomName !== undefined && res.payout !== undefined && res.totalBet !== undefined) {
        setResult({
          winningRoom: res.winningRoom,
          winningRoomName: res.winningRoomName,
          payout: res.payout,
          totalBet: res.totalBet,
        })
        setPhase('revealed')
      }
    })
  }

  const handleNewRound = () => {
    setPhase('betting')
    setBets({})
    setSessionId(null)
    setResult(null)
    setError(null)
  }

  return (
    <div className="space-y-4">
      {/* Header con titulo y status */}
      <Card className="space-y-3">
        <div className="text-center">
          <h2 className="text-2xl font-black text-white">¿Donde esta Felipe?</h2>
          <p className="text-xs text-slate-400 uppercase tracking-widest">
            Edicion gerente comercial
          </p>
        </div>

        {/* Saldo + apuesta actual + chips */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Saldo</p>
            <p className="text-lg font-bold text-white">${credits.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Apuesta</p>
            <p className="text-lg font-bold text-[var(--casino-yellow)]">${totalBet}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Salas</p>
            <p className="text-lg font-bold text-white">{Object.keys(bets).length}</p>
          </div>
        </div>

        {/* Chip selector */}
        {phase === 'betting' && (
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Ficha</p>
            <div className="grid grid-cols-4 gap-2">
              {FELIPE_CHIPS.map(chip => (
                <button
                  key={chip}
                  onClick={() => setSelectedChip(chip)}
                  className={clsx(
                    'rounded-lg border py-2 text-sm font-semibold transition-all',
                    selectedChip === chip
                      ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                      : 'border-slate-600 bg-slate-700/50 text-slate-300 hover:border-slate-500',
                  )}
                >
                  ${chip}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {error && (
        <Card className="border-red-500/40 bg-red-500/10">
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      )}

      {/* Resultado de reveal */}
      {phase === 'revealed' && result && (
        <Card className={clsx(
          'text-center space-y-2 border-2',
          result.payout > 0 ? 'border-[var(--casino-teal)]/50 bg-[var(--casino-teal)]/5' : 'border-red-500/40 bg-red-500/5'
        )}>
          <p className="text-xs text-slate-400 uppercase tracking-widest">Felipe estaba en</p>
          <p className="text-2xl font-bold text-white">{result.winningRoomName}</p>
          {result.payout > 0 ? (
            <p className="text-lg text-[var(--casino-teal)] font-bold">
              Ganaste ${result.payout.toLocaleString()}
            </p>
          ) : (
            <p className="text-sm text-slate-400">
              No le pegaste — perdiste ${result.totalBet}
            </p>
          )}
        </Card>
      )}

      {/* Grid de salas */}
      <div className="space-y-2">
        <p className="text-xs text-slate-500 uppercase tracking-wider px-1">
          Elige donde esta Felipe — podes apostar a varias salas
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {FELIPE_ROOMS.map(room => {
            const multiplier = getRoomMultiplier(room.prob)
            const myBet = bets[room.id]
            const isWinner = result?.winningRoom === room.id
            const probPct = (room.prob * 100).toFixed(1)
            const style = CATEGORY_STYLES[room.category]

            return (
              <button
                key={room.id}
                onClick={() => myBet ? handleRoomRemove(room.id) : handleRoomClick(room.id)}
                disabled={phase !== 'betting' && !isWinner}
                className={clsx(
                  'relative rounded-xl border p-3 text-left transition-all',
                  phase === 'betting' && !myBet && 'border-slate-700 bg-slate-800/40 hover:border-slate-500 hover:bg-slate-800/60',
                  myBet && 'border-[var(--casino-yellow)] bg-[var(--casino-yellow)]/10',
                  isWinner && 'border-[var(--casino-teal)] bg-[var(--casino-teal)]/15 shadow-[0_0_20px_rgba(0,230,118,0.3)]',
                  phase !== 'betting' && !isWinner && !myBet && 'opacity-40',
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className={clsx('text-[10px] px-1.5 py-0.5 rounded', style.badge)}>
                    {style.text}
                  </span>
                  <span className="text-sm font-bold text-white">x{multiplier}</span>
                </div>
                <p className="text-sm font-medium text-white leading-tight">{room.name}</p>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug line-clamp-3">{room.lore}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">{probPct}% prob</span>
                  {myBet && (
                    <Badge variant="warning">${myBet}</Badge>
                  )}
                </div>
                <div className="mt-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-600"
                    style={{ width: `${Math.min(100, room.prob * 100 * 8)}%` }}
                  />
                </div>
                {isWinner && (
                  <div className="absolute -top-2 -right-2 text-2xl">📍</div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Botones de accion */}
      <div className="grid grid-cols-3 gap-2 sticky bottom-2">
        <Button
          variant={phase === 'betting' ? 'primary' : 'secondary'}
          disabled={phase !== 'betting' || Object.keys(bets).length === 0 || isPending}
          onClick={handlePlaceBets}
        >
          {isPending && phase === 'betting' ? '...' : 'Apostar'}
        </Button>
        <Button
          variant={phase === 'placed' ? 'primary' : 'secondary'}
          disabled={phase !== 'placed' || isPending}
          onClick={handleReveal}
        >
          {isPending && phase === 'placed' ? '...' : 'Revelar'}
        </Button>
        <Button variant="outline" onClick={handleNewRound} disabled={isPending}>
          Nueva ronda
        </Button>
      </div>
    </div>
  )
}
