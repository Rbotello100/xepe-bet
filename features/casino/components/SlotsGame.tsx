'use client'

import { useState, useRef } from 'react'
import { playSlots } from '@/features/casino/actions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { clsx } from 'clsx'

// Mapeo de símbolo → imagen. Usar placeholders hasta que lleguen las fotos reales.
const SYMBOL_LABELS: Record<string, string> = {
  s1: 'CEO',
  s2: 'CFO',
  s3: 'CTO',
  s4: 'COO',
  s5: 'VP',
}

const SYMBOL_COLORS: Record<string, string> = {
  s1: 'from-[var(--casino-yellow)] to-[#A88800]',
  s2: 'from-[var(--casino-cyan)] to-[#005566]',
  s3: 'from-[var(--accent)] to-[#005C2E]',
  s4: 'from-[var(--casino-teal)] to-[#005A52]',
  s5: 'from-slate-600 to-slate-800',
}

const PAYOUTS: Record<string, number> = {
  s1: 8000, s2: 1500, s3: 300, s4: 70, s5: 18,
}

// Símbolos que se muestran durante el spin
const ALL_SYMS = ['s1', 's2', 's3', 's4', 's5']

function SlotCell({
  symbol,
  spinning,
  landed,
  isWin,
}: {
  symbol: string
  spinning: boolean
  landed: boolean
  isWin: boolean
}) {
  const hasImage = false // cambiar a true cuando lleguen las fotos

  return (
    <div
      className={clsx(
        'w-20 h-20 rounded-xl border-2 flex items-center justify-center overflow-hidden transition-all duration-200',
        spinning && !landed && 'border-slate-600 animate-pulse',
        landed && !isWin && 'border-slate-600',
        isWin && 'border-[var(--casino-yellow)] animate-[win-glow_0.5s_ease-in-out_3]',
        !spinning && !landed && 'border-slate-700',
      )}
    >
      {spinning && !landed ? (
        <div className={clsx('w-full h-full bg-gradient-to-br', SYMBOL_COLORS[symbol])} />
      ) : (
        <div
          className={clsx(
            'w-full h-full bg-gradient-to-br flex flex-col items-center justify-center gap-0.5',
            SYMBOL_COLORS[symbol],
            landed && 'animate-[slot-land_0.25s_ease-out_forwards]',
          )}
        >
          {hasImage ? (
            <img
              src={`/casino/slots/${symbol}.png`}
              alt={SYMBOL_LABELS[symbol]}
              className="w-full h-full object-cover"
            />
          ) : (
            <>
              <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider">
                {SYMBOL_LABELS[symbol]}
              </span>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs text-white font-bold">
                {symbol.toUpperCase()}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function SlotsGame({ credits }: { credits: number }) {
  const [grid, setGrid] = useState<string[]>(Array(9).fill('s5'))
  const [spinning, setSpinning] = useState(false)
  const [stoppedCols, setStoppedCols] = useState<Set<number>>(new Set())
  const [result, setResult] = useState<{ winLine: number[] | null; symbol: string | null; payout: number; free: boolean } | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const spin = async () => {
    setSpinning(true)
    setResult(null)
    setStoppedCols(new Set())

    // Animar todas las celdas con símbolos aleatorios
    intervalRef.current = setInterval(() => {
      setGrid(Array.from({ length: 9 }, () => ALL_SYMS[Math.floor(Math.random() * ALL_SYMS.length)]))
    }, 80)

    // Llamar al servidor
    const res = await playSlots(10)

    if (intervalRef.current) clearInterval(intervalRef.current)

    if ('error' in res && res.error) {
      setSpinning(false)
      return
    }

    const finalGrid = res.grid!

    // Detener columna por columna
    const stopCol = (col: number) => {
      setStoppedCols(prev => new Set([...prev, col]))
      setGrid(prev => {
        const next = [...prev]
        // Actualizar las 3 celdas de esta columna (índices col, col+3, col+6)
        next[col]     = finalGrid[col]
        next[col + 3] = finalGrid[col + 3]
        next[col + 6] = finalGrid[col + 6]
        return next
      })
    }

    setTimeout(() => stopCol(0), 600)
    setTimeout(() => stopCol(1), 900)
    setTimeout(() => {
      stopCol(2)
      setResult({
        winLine: res.winLine ?? null,
        symbol: res.symbol ?? null,
        payout: res.payout ?? 0,
        free: res.free ?? false,
      })
      setSpinning(false)
    }, 1200)
  }

  const winSet = new Set(result?.winLine ?? [])

  return (
    <Card className="space-y-6 py-8">
      {/* Grid 3×3 */}
      <div className="flex justify-center">
        <div className="bg-gradient-to-b from-[var(--casino-blue)] to-slate-900 rounded-2xl p-5 border-2 border-[var(--casino-blue)] shadow-2xl">
          <div className="grid grid-cols-3 gap-2">
            {grid.map((sym, i) => {
              const col = i % 3
              const isLanded = stoppedCols.has(col)
              const isWin = winSet.has(i) && !spinning
              return (
                <SlotCell
                  key={i}
                  symbol={sym}
                  spinning={spinning}
                  landed={isLanded}
                  isWin={isWin}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Resultado */}
      {result && (
        <div className={clsx(
          'text-center py-3 rounded-xl',
          result.payout > 0
            ? 'bg-[var(--casino-yellow)]/10 border border-[var(--casino-yellow)]/50'
            : 'bg-slate-800'
        )}>
          {result.payout > 0 ? (
            <>
              <p className="text-2xl font-bold text-[var(--casino-yellow)]">+${result.payout}</p>
              <p className="text-sm text-[var(--casino-yellow)]/70">
                3x {SYMBOL_LABELS[result.symbol!]} en linea!
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Sin premio. Intenta de nuevo!</p>
          )}
        </div>
      )}

      {/* Boton */}
      <div className="text-center">
        <Button onClick={spin} disabled={spinning} size="lg" className="px-12">
          {spinning ? 'Girando...' : 'GIRAR ($10)'}
        </Button>
        <p className="text-xs text-slate-500 mt-2">1 giro gratis al dia</p>
      </div>

      {/* Tabla de premios */}
      <div>
        <p className="text-xs text-slate-500 text-center mb-2 uppercase tracking-wider">
          Paga con 3 en línea horizontal
        </p>
        <div className="grid grid-cols-1 gap-1 text-xs">
          {Object.entries(PAYOUTS).map(([sym, prize]) => (
            <div key={sym} className="flex items-center justify-between bg-slate-800 rounded px-3 py-1.5">
              <div className="flex items-center gap-2">
                <div className={clsx('w-4 h-4 rounded bg-gradient-to-br', SYMBOL_COLORS[sym])} />
                <span className="text-slate-300 font-medium">{SYMBOL_LABELS[sym]} × 3</span>
              </div>
              <span className="text-[var(--casino-yellow)] font-bold">${prize.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
