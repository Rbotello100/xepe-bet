'use client'

import { useState } from 'react'
import { playScratchCard, claimScratchPrize } from '@/features/casino/actions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { clsx } from 'clsx'

export function ScratchGame({ credits }: { credits: number }) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [cells, setCells] = useState<string[] | null>(null)
  const [revealed, setRevealed] = useState<boolean[]>(Array(9).fill(false))
  const [revealCount, setRevealCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ payout: number } | null>(null)

  const startGame = async () => {
    setLoading(true)
    setResult(null)
    setRevealed(Array(9).fill(false))
    setRevealCount(0)
    setSessionId(null)

    const res = await playScratchCard()
    if ('error' in res && res.error) { setLoading(false); return }

    setCells(res.cells ?? null)
    setSessionId(res.sessionId ?? null)
    setLoading(false)
  }

  const revealCell = async (index: number) => {
    if (!cells || revealed[index] || result || !sessionId) return

    const newRevealed = [...revealed]
    newRevealed[index] = true
    setRevealed(newRevealed)
    const newCount = revealCount + 1
    setRevealCount(newCount)

    // After revealing 3+, check for matches client-side (purely visual)
    if (newCount >= 3) {
      const revealedSymbols = cells.filter((_, i) => newRevealed[i])
      const counts: Record<string, number> = {}
      revealedSymbols.forEach(s => { counts[s] = (counts[s] ?? 0) + 1 })

      const matching = Object.entries(counts).find(([, c]) => c >= 3)

      if (matching) {
        // El servidor decide el premio (ya está guardado en BD), solo confirmamos con sessionId
        const res = await claimScratchPrize(sessionId)
        setResult({ payout: res.payout ?? 0 })
        setRevealed(Array(9).fill(true))
      } else if (newCount >= 6) {
        // Sin 3 iguales después de 6 reveals → claim igual para cerrar la sesión
        const res = await claimScratchPrize(sessionId)
        setResult({ payout: res.payout ?? 0 })
        setRevealed(Array(9).fill(true))
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
          {loading ? 'Generando...' : 'Obtener tarjeta ($15)'}
        </Button>
        <p className="text-xs text-slate-500">1 tarjeta gratis al dia</p>
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
