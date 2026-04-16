'use client'

import { useState } from 'react'
import { startMines, revealMineCell, cashoutMines } from '@/features/casino/actions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { clsx } from 'clsx'

const GRID_SIZE = 36
const COST = 25
const MINE_LEVELS = [
  { count: 3,  label: 'Fácil',   description: '3 árbitros · ×1116 max' },
  { count: 5,  label: 'Medio',   description: '5 árbitros · ×6100 max' },
  { count: 8,  label: 'Difícil', description: '8 árbitros · jackpot enorme' },
  { count: 12, label: 'Extremo', description: '12 árbitros · solo valientes' },
]

type Phase = 'idle' | 'playing' | 'busted' | 'cashed_out'

export function MinesGame() {
  const [phase, setPhase]               = useState<Phase>('idle')
  const [sessionId, setSessionId]       = useState<string | null>(null)
  const [mineCount, setMineCount]       = useState<number>(3)
  const [revealed, setRevealed]         = useState<Set<number>>(new Set())
  const [mines, setMines]               = useState<Set<number>>(new Set())
  const [bustedCell, setBustedCell]     = useState<number | null>(null)
  const [multiplier, setMultiplier]     = useState(1)
  const [nextMultiplier, setNextMult]   = useState(0)
  const [payout, setPayout]             = useState(0)
  const [loading, setLoading]           = useState(false)

  const reset = () => {
    setPhase('idle'); setSessionId(null); setRevealed(new Set()); setMines(new Set())
    setBustedCell(null); setMultiplier(1); setNextMult(0); setPayout(0)
  }

  const handleStart = async (mines: number) => {
    setLoading(true)
    setMineCount(mines)
    const res = await startMines(mines)
    if ('error' in res && res.error) { setLoading(false); return }
    setSessionId(res.sessionId ?? null)
    setRevealed(new Set())
    setMines(new Set())
    setBustedCell(null)
    setMultiplier(1)
    setPhase('playing')
    setLoading(false)
  }

  const handleReveal = async (cellIndex: number) => {
    if (phase !== 'playing' || loading || !sessionId) return
    if (revealed.has(cellIndex)) return
    setLoading(true)

    const res = await revealMineCell(sessionId, cellIndex)
    if ('error' in res && res.error) { setLoading(false); return }

    if (res.isMine) {
      setBustedCell(cellIndex)
      setMines(new Set(res.minePositions ?? []))
      setRevealed(new Set([...(res.safeRevealed ?? []), cellIndex]))
      setPhase('busted')
      setPayout(0)
    } else if ('cashout' in res && res.cashout) {
      // Auto-cashout (reveló todas las seguras)
      setRevealed(new Set(res.safeRevealed ?? []))
      setMines(new Set(res.minePositions ?? []))
      setMultiplier(res.multiplier ?? 1)
      setPayout(res.payout ?? 0)
      setPhase('cashed_out')
    } else {
      setRevealed(new Set(res.safeRevealed ?? []))
      setMultiplier(res.multiplier ?? 1)
      setNextMult('nextMultiplier' in res ? (res.nextMultiplier ?? 0) : 0)
    }
    setLoading(false)
  }

  const handleCashout = async () => {
    if (!sessionId || loading || revealed.size === 0) return
    setLoading(true)
    const res = await cashoutMines(sessionId)
    if ('error' in res && res.error) { setLoading(false); return }
    setMines(new Set(res.minePositions ?? []))
    setMultiplier(res.multiplier ?? 1)
    setPayout(res.payout ?? 0)
    setPhase('cashed_out')
    setLoading(false)
  }

  // ——— IDLE: selección de dificultad ———
  if (phase === 'idle') {
    return (
      <Card className="text-center py-8 space-y-4">
        <p className="text-5xl">⚠️</p>
        <h2 className="text-lg font-bold text-white">Cancha Minada</h2>
        <p className="text-sm text-slate-400 max-w-xs mx-auto">
          Esquiva las tarjetas rojas. Cada celda segura sube tu multiplicador. Retírate cuando quieras.
        </p>

        <div className="space-y-2 max-w-sm mx-auto">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Elige dificultad</p>
          {MINE_LEVELS.map(lvl => (
            <button
              key={lvl.count}
              onClick={() => handleStart(lvl.count)}
              disabled={loading}
              className="w-full bg-slate-800 hover:bg-slate-700 hover:border-[var(--accent)] border border-slate-700 rounded-xl p-3 transition-all flex items-center justify-between cursor-pointer disabled:opacity-50"
            >
              <div className="text-left">
                <p className="text-white font-bold text-sm">{lvl.label}</p>
                <p className="text-[10px] text-slate-500">{lvl.description}</p>
              </div>
              <div className="flex items-center gap-1">
                {Array.from({ length: lvl.count > 5 ? 5 : lvl.count }).map((_, i) => (
                  <span key={i} className="text-base">🟥</span>
                ))}
                {lvl.count > 5 && <span className="text-[10px] text-slate-500 ml-1">×{lvl.count}</span>}
              </div>
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-500">Costo: ${COST} · 1 gratis al día</p>
      </Card>
    )
  }

  const safeTotal = GRID_SIZE - mineCount
  const safeRevealedCount = revealed.size
  const cashoutValue = Math.round(COST * multiplier)

  return (
    <Card className="space-y-4 py-5">
      {/* Stats top */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
          <p className="text-[9px] text-slate-500 uppercase tracking-wider">Multiplicador</p>
          <p className="text-xl font-black text-[var(--accent)]">×{multiplier.toFixed(2)}</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
          <p className="text-[9px] text-slate-500 uppercase tracking-wider">Reveladas</p>
          <p className="text-xl font-black text-white">{safeRevealedCount}/{safeTotal}</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
          <p className="text-[9px] text-slate-500 uppercase tracking-wider">Si retiras</p>
          <p className="text-xl font-black text-[var(--casino-yellow)]">${cashoutValue}</p>
        </div>
      </div>

      {/* Grid 6×6 — cancha verde con celdas */}
      <div className="bg-[#0a1f12] rounded-xl p-2 border-2 border-white/15 shadow-[0_0_30px_rgba(0,230,118,0.15)_inset]">
        <div className="grid grid-cols-6 gap-1.5 aspect-square">
          {Array.from({ length: GRID_SIZE }).map((_, i) => {
            const isRevealed = revealed.has(i)
            const isMine = mines.has(i)
            const isBusted = i === bustedCell
            const showAll = phase === 'busted' || phase === 'cashed_out'

            return (
              <button
                key={i}
                onClick={() => handleReveal(i)}
                disabled={phase !== 'playing' || loading || isRevealed}
                className={clsx(
                  'rounded border aspect-square flex items-center justify-center text-base sm:text-lg transition-all',
                  // Default
                  !isRevealed && !showAll && 'border-white/10 bg-white/[0.03] hover:border-[var(--accent)] hover:bg-[var(--accent)]/15 hover:scale-105 cursor-pointer',
                  // Revealed safe
                  isRevealed && !isMine && 'border-[var(--accent)]/60 bg-[var(--accent)]/20',
                  // Mine reveal at end
                  showAll && isMine && !isBusted && 'border-red-500/40 bg-red-500/20',
                  // Busted cell
                  isBusted && 'border-red-500 bg-red-500/60 animate-pulse',
                  // Hidden after game ends
                  showAll && !isRevealed && !isMine && 'border-white/5 bg-white/[0.02] opacity-50',
                )}
              >
                {isBusted && '🟥'}
                {isRevealed && !isMine && '⚽'}
                {showAll && isMine && !isBusted && '🟥'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Controls */}
      {phase === 'playing' && (
        <div className="space-y-2">
          {safeRevealedCount > 0 ? (
            <div className="flex gap-3">
              <Button onClick={handleCashout} disabled={loading} variant="secondary" size="md" className="flex-1">
                💰 Retirar ${cashoutValue}
              </Button>
              <div className="flex-1 text-center bg-slate-800/50 rounded-lg py-2 px-3">
                <p className="text-[9px] text-slate-500 uppercase">Próximo</p>
                <p className="text-sm font-bold text-[var(--casino-cyan)]">×{nextMultiplier.toFixed(2)}</p>
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-slate-500">Revela una celda para empezar</p>
          )}
        </div>
      )}

      {phase === 'busted' && (
        <div className="text-center bg-red-500/10 border border-red-500/40 rounded-xl py-4 space-y-2">
          <p className="text-3xl">😬</p>
          <p className="text-xl font-black text-red-400">¡TARJETA ROJA!</p>
          <p className="text-sm text-slate-400">Llegaste a ×{multiplier.toFixed(2)} con {safeRevealedCount} celdas. Perdiste ${COST}.</p>
          <Button onClick={reset} variant="secondary" size="sm">Jugar de nuevo</Button>
        </div>
      )}

      {phase === 'cashed_out' && (
        <div className="text-center bg-[var(--accent)]/10 border border-[var(--accent)]/40 rounded-xl py-4 space-y-2">
          <p className="text-3xl">🎉</p>
          <p className="text-xl font-black text-[var(--accent)]">+${payout.toLocaleString()}</p>
          <p className="text-sm text-slate-400">{safeRevealedCount} celdas reveladas · ×{multiplier.toFixed(2)}</p>
          <Button onClick={reset} variant="secondary" size="sm">Jugar de nuevo</Button>
        </div>
      )}

      <p className="text-center text-[10px] text-slate-700">
        Costo: ${COST}/partida · 1 gratis al día
      </p>
    </Card>
  )
}
