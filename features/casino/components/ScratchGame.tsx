'use client'

import { useState } from 'react'
import { playScratchCard, claimScratchPrize } from '@/features/casino/actions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { clsx } from 'clsx'

interface ScratchGameProps {
  credits: number
  freeCard?: boolean
}

export function ScratchGame({ credits, freeCard = false }: ScratchGameProps) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [cells, setCells] = useState<string[] | null>(null)
  const [revealed, setRevealed] = useState<boolean[]>(Array(9).fill(false))
  const [revealCount, setRevealCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ payout: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [hasFreeCard, setHasFreeCard] = useState(freeCard)

  const startGame = async () => {
    setLoading(true)
    setErrorMsg(null)
    setResult(null)
    setRevealed(Array(9).fill(false))
    setRevealCount(0)
    setSessionId(null)

    try {
      const res = await playScratchCard()
      if ('error' in res && res.error) {
        setErrorMsg(res.error)
        return
      }
      setCells(res.cells ?? null)
      setSessionId(res.sessionId ?? null)
      if ('free' in res && res.free) setHasFreeCard(false)
    } catch (err) {
      console.error('[ScratchGame] playScratchCard failed', err)
      setErrorMsg('Error inesperado, reintentá')
    } finally {
      setLoading(false)
    }
  }

  // Helper para claim — encapsula try/catch para que un error del server
  // no deje la tarjeta en estado intermedio (sin result, sin reset).
  const safeClaim = async (id: string) => {
    try {
      const res = await claimScratchPrize(id)
      setResult({ payout: res.payout ?? 0 })
      setRevealed(Array(9).fill(true))
    } catch (err) {
      console.error('[ScratchGame] claimScratchPrize failed', err)
      // Marca el result como 0 para que el user vea "Sin premio" en lugar
      // de quedarse pegado sin saber qué pasó.
      setResult({ payout: 0 })
      setRevealed(Array(9).fill(true))
    }
  }

  const revealCell = async (index: number) => {
    if (!cells || revealed[index] || result || !sessionId) return

    const newRevealed = [...revealed]
    newRevealed[index] = true
    setRevealed(newRevealed)
    const newCount = revealCount + 1
    setRevealCount(newCount)

    if (newCount >= 3) {
      const revealedSymbols = cells.filter((_, i) => newRevealed[i])
      const counts: Record<string, number> = {}
      revealedSymbols.forEach(s => { counts[s] = (counts[s] ?? 0) + 1 })

      const matching = Object.entries(counts).find(([, c]) => c >= 3)

      if (matching) {
        await safeClaim(sessionId)
      } else if (newCount >= 6) {
        await safeClaim(sessionId)
      }
    }
  }

  if (!cells) {
    return (
      <Card className="text-center py-10 space-y-4">
        <p className="text-4xl">🎟️</p>
        <h2 className="text-lg font-bold text-[var(--casino-yellow)]">Rasca y Gana</h2>
        <p className="text-sm text-slate-400">Rasca las celdas. 3 simbolos iguales = premio!</p>

        <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto text-xs">
          {[['⚽⚽⚽', '$300'], ['🏆🏆🏆', '$150'], ['⭐⭐⭐', '$100'], ['🥅🥅🥅', '$50'], ['🟨🟨🟨', '$15']].map(([combo, prize]) => (
            <div key={combo} className="col-span-3 flex justify-between bg-slate-800 rounded px-3 py-1.5">
              <span>{combo}</span>
              <span className="text-[var(--casino-yellow)] font-semibold">{prize}</span>
            </div>
          ))}
        </div>

        <Button onClick={startGame} disabled={loading} size="lg">
          {loading ? 'Generando...' : hasFreeCard ? 'Obtener tarjeta (GRATIS)' : 'Obtener tarjeta ($15)'}
        </Button>
        {errorMsg && (
          <p className="mx-auto max-w-xs rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {errorMsg}
          </p>
        )}
        <p className="text-xs text-slate-500">
          {hasFreeCard
            ? <><span className="text-[var(--accent)] font-semibold">Tu tarjeta gratis del día está disponible</span></>
            : <>1 tarjeta gratis al dia · Ya usaste el gratis · Balance: ${credits.toLocaleString('es-CL')}</>}
        </p>
      </Card>
    )
  }

  return (
    <Card className="space-y-6 py-6">
      <p className="text-center text-sm text-slate-400">
        Rasca las celdas ({revealCount}/9 reveladas)
      </p>

      <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
        {cells.map((symbol, i) => (
          <button
            key={i}
            onClick={() => revealCell(i)}
            disabled={revealed[i] || !!result}
            className={clsx(
              'h-20 rounded-xl text-3xl font-bold transition-all',
              revealed[i]
                ? 'bg-slate-700 border border-slate-600'
                : 'bg-gradient-to-br from-[var(--casino-blue)] to-[var(--casino-purple)] border-2 border-[var(--casino-teal)] hover:scale-105 active:scale-95 cursor-pointer shadow-lg',
            )}
          >
            {revealed[i] ? symbol : '?'}
          </button>
        ))}
      </div>

      {result && (
        <div className={clsx(
          'text-center py-4 rounded-xl',
          result.payout > 0
            ? 'bg-[var(--casino-yellow)]/10 border border-[var(--casino-yellow)]/50'
            : 'bg-slate-800'
        )}>
          {result.payout > 0 ? (
            <>
              <p className="text-2xl font-bold text-[var(--casino-yellow)]">+${result.payout}</p>
              <p className="text-sm text-[var(--casino-yellow)]/70">Ganaste!</p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Sin premio esta vez</p>
          )}
          <Button
            onClick={startGame}
            variant="secondary"
            size="sm"
            className="mt-3"
          >
            Nueva tarjeta
          </Button>
        </div>
      )}
    </Card>
  )
}
