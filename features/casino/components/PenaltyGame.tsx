'use client'

import { useState, useRef, useEffect } from 'react'
import { startPenaltyGame, takePenaltyKick, cashoutPenalty } from '@/features/casino/actions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { clsx } from 'clsx'

const BET = 20
const TOTAL_ZONES = 12
const MULTIPLIERS = [1.5, 3.5, 8, 20, 55, 200]
const GK_COVERAGE = [5, 6, 7, 8, 9, 10]

type Phase = 'idle' | 'kicking' | 'result' | 'decision' | 'finished'

// ——— Barra de multiplicadores ———
function MultiplierLadder({ goalsScored, currentBet }: { goalsScored: number; currentBet: number }) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {MULTIPLIERS.map((m, i) => {
        const reached = i < goalsScored
        const isNext = i === goalsScored
        return (
          <div
            key={i}
            className={clsx(
              'rounded-lg border-2 px-1 py-2 text-center transition-all',
              reached && 'bg-[var(--accent)]/15 border-[var(--accent)] shadow-[0_0_12px_rgba(0,230,118,0.3)]',
              isNext && 'border-[var(--casino-yellow)]/60 bg-[var(--casino-yellow)]/5',
              !reached && !isNext && 'border-slate-700 bg-slate-800/50',
            )}
          >
            <p className={clsx(
              'text-[10px] uppercase tracking-wider font-semibold',
              reached ? 'text-[var(--accent)]' : isNext ? 'text-[var(--casino-yellow)]' : 'text-slate-600'
            )}>
              Gol {i + 1}
            </p>
            <p className={clsx(
              'text-sm font-black',
              reached ? 'text-white' : isNext ? 'text-[var(--casino-yellow)]' : 'text-slate-600'
            )}>
              ×{m}
            </p>
            {reached && (
              <p className="text-[9px] text-[var(--accent)]/80">${Math.round(currentBet * m)}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function PenaltyGame() {
  const [phase, setPhase]               = useState<Phase>('idle')
  const [sessionId, setSessionId]       = useState<string | null>(null)
  const [goalsScored, setGoalsScored]   = useState(0)
  const [kickedZone, setKickedZone]     = useState<number | null>(null)
  const [coveredZones, setCovered]      = useState<number[]>([])
  const [isGoal, setIsGoal]             = useState<boolean | null>(null)
  const [multiplier, setMultiplier]     = useState(0)
  const [nextProb, setNextProb]         = useState(0.583)
  const [payout, setPayout]             = useState(0)
  const [isFree, setIsFree]             = useState(false)
  const [loading, setLoading]           = useState(false)

  // Tracking de timeouts para evitar leaks/loading colgado: si el componente
  // unmounta o el user reinicia, cancelamos los setTimeout de la coreografia
  // de animacion antes que disparen su setLoading(false) tardio.
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearAnimationTimers = () => {
    for (const t of timeoutsRef.current) clearTimeout(t)
    timeoutsRef.current = []
  }

  // Safety net global: si el componente desmonta con timers pendientes los
  // limpiamos. Asi el "Apostando..." nunca queda colgado en otra ruta.
  useEffect(() => {
    return () => clearAnimationTimers()
  }, [])

  const reset = () => {
    clearAnimationTimers()
    setLoading(false)
    setPhase('idle'); setSessionId(null); setGoalsScored(0); setKickedZone(null); setCovered([])
    setIsGoal(null); setMultiplier(0); setNextProb(0.583); setPayout(0); setIsFree(false)
  }

  // try/catch en cada handler: garantiza que setLoading vuelva a false
  // aunque la server action throwee — sin esto el UI quedaba pegado.
  const handleStart = async () => {
    setLoading(true)
    try {
      const res = await startPenaltyGame(BET)
      if ('error' in res && res.error) return
      setSessionId(res.sessionId ?? null)
      setNextProb(res.firstProb ?? 0.583)
      setPhase('kicking')
    } catch (err) {
      console.error('[PenaltyGame] startPenaltyGame failed', err)
    } finally {
      setLoading(false)
    }
  }

  const handleKick = async (zone: number) => {
    if (phase !== 'kicking' || loading || !sessionId) return
    setLoading(true)
    setKickedZone(zone)

    let res: Awaited<ReturnType<typeof takePenaltyKick>>
    try {
      res = await takePenaltyKick(sessionId, zone)
    } catch (err) {
      console.error('[PenaltyGame] takePenaltyKick failed', err)
      setLoading(false)
      return
    }
    if ('error' in res && res.error) {
      setLoading(false)
      return
    }

    setCovered(res.coveredZones ?? [])
    setIsGoal(res.isGoal ?? false)
    setIsFree(res.isFree ?? false)

    // Coreografia de animacion: 500ms hasta mostrar resultado, 1100ms hasta
    // resolver fase. Los setTimeout van trackeados en timeoutsRef para que
    // se cancelen si el componente unmounta — sin eso, setLoading(false)
    // del inner timeout no corria nunca y el boton quedaba pegado.
    const outerId = setTimeout(() => {
      setPhase('result')
      const innerId = setTimeout(() => {
        if (res.isGoal) {
          const newGoals = res.goalsScored ?? goalsScored + 1
          setGoalsScored(newGoals)
          setMultiplier(res.multiplier ?? 0)
          setNextProb(res.nextProb ?? 0)
          if (newGoals >= MULTIPLIERS.length) {
            handleAutoCashout()
          } else {
            setPhase('decision')
          }
        } else {
          setPhase('finished')
          setPayout(0)
        }
        setLoading(false)
      }, 1100)
      timeoutsRef.current.push(innerId)
    }, 500)
    timeoutsRef.current.push(outerId)
  }

  const handleAutoCashout = async () => {
    if (!sessionId) return
    try {
      const res = await cashoutPenalty(sessionId)
      if ('error' in res && res.error) return
      setPayout(res.payout ?? 0)
      setIsFree(res.isFree ?? false)
      setPhase('finished')
    } catch (err) {
      console.error('[PenaltyGame] auto cashoutPenalty failed', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCashout = async () => {
    if (!sessionId || loading) return
    setLoading(true)
    try {
      const res = await cashoutPenalty(sessionId)
      if ('error' in res && res.error) return
      setPayout(res.payout ?? 0)
      setIsFree(res.isFree ?? false)
      setPhase('finished')
    } catch (err) {
      console.error('[PenaltyGame] cashoutPenalty failed', err)
    } finally {
      setLoading(false)
    }
  }

  const handleContinue = () => {
    setKickedZone(null)
    setCovered([])
    setIsGoal(null)
    setPhase('kicking')
  }

  // ——— IDLE ———
  if (phase === 'idle') {
    return (
      <Card className="text-center py-8 space-y-4">
        <p className="text-5xl">⚽</p>
        <h2 className="text-lg font-bold text-white">Tanda de Penales</h2>
        <p className="text-sm text-slate-400 max-w-xs mx-auto">
          Apunta a una de las 12 zonas. El arquero cubre algunas — esquívalo, anota goles y multiplica tu apuesta.
        </p>

        <div className="bg-slate-800/50 rounded-xl p-3 space-y-2 max-w-sm mx-auto">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Tabla de multiplicadores</p>
          <div className="grid grid-cols-6 gap-1.5">
            {MULTIPLIERS.map((m, i) => {
              const prob = ((TOTAL_ZONES - GK_COVERAGE[i]) / TOTAL_ZONES * 100).toFixed(0)
              return (
                <div key={i} className="bg-slate-900 rounded-lg py-1.5">
                  <p className="text-[var(--casino-yellow)] font-bold text-sm">×{m}</p>
                  <p className="text-[9px] text-slate-500">{prob}%</p>
                </div>
              )
            })}
          </div>
        </div>

        <p className="text-xs text-slate-500">Costo: ${BET} · 1 gratis al dia</p>
        <Button onClick={handleStart} disabled={loading} size="lg">
          {loading ? 'Iniciando...' : `Jugar ($${BET})`}
        </Button>
      </Card>
    )
  }

  // ——— FINISHED ———
  // 4 estados:
  //  - payout > 0 && isFree:  gano gratis Y le pagó (bonus por jugada del día)
  //  - payout > 0:            gano normal (pagó su bet)
  //  - payout === 0 && isFree: lo atajaron en free play (sin perder créditos)
  //  - payout === 0:          lo atajaron normal (perdió su bet)
  if (phase === 'finished') {
    const won = payout > 0
    return (
      <Card className="text-center py-10 space-y-4">
        <p className="text-5xl">{won ? '🎉' : '😔'}</p>
        {won && isFree ? (
          <>
            <h2 className="text-3xl font-black text-white">+${payout.toLocaleString()}</h2>
            <p className="text-sm text-[var(--accent)]">
              {goalsScored} gol{goalsScored > 1 ? 'es' : ''} · Multiplicador ×{multiplier}
            </p>
            <p className="text-xs text-[var(--casino-yellow)]">🎁 Jugada del día gratis — ¡bonus!</p>
          </>
        ) : won ? (
          <>
            <h2 className="text-3xl font-black text-white">+${payout.toLocaleString()}</h2>
            <p className="text-sm text-[var(--accent)]">
              {goalsScored} gol{goalsScored > 1 ? 'es' : ''} · Multiplicador ×{multiplier}
            </p>
          </>
        ) : isFree ? (
          <>
            <h2 className="text-3xl font-black text-white">Perdiste</h2>
            <p className="text-sm text-slate-400">El arquero la atajo.</p>
            <p className="text-xs text-slate-500">Era jugada gratis — no perdiste créditos</p>
          </>
        ) : (
          <>
            <h2 className="text-3xl font-black text-white">Perdiste</h2>
            <p className="text-sm text-slate-400">El arquero la atajo. Mejor suerte la proxima.</p>
          </>
        )}
        <Button onClick={reset} variant="secondary">Jugar de nuevo</Button>
      </Card>
    )
  }

  // ——— KICKING / RESULT / DECISION ———
  return (
    <Card className="space-y-4 py-5">
      {/* Multiplicadores */}
      <MultiplierLadder goalsScored={goalsScored} currentBet={BET} />

      {/* Arco con 12 zonas */}
      <div className="relative w-full aspect-[16/9] max-w-md mx-auto rounded-lg overflow-hidden border-4 border-white/95 bg-[#0a1f12] shadow-[0_0_30px_rgba(0,230,118,0.15)_inset]">
        {/* Red de fondo (patrón crosshatch) */}
        <div
          className="absolute inset-0 opacity-20 bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(255,255,255,0.4)_8px,rgba(255,255,255,0.4)_9px),repeating-linear-gradient(-45deg,transparent,transparent_8px,rgba(255,255,255,0.4)_8px,rgba(255,255,255,0.4)_9px)]"
          aria-hidden
        />

        {/* Grid 4×3 = 12 zonas */}
        <div className="relative grid grid-cols-4 grid-rows-3 gap-1.5 p-2 h-full">
          {Array.from({ length: TOTAL_ZONES }).map((_, i) => {
            const isKicked = kickedZone === i
            const isCovered = coveredZones.includes(i)
            const showResult = phase !== 'kicking'

            return (
              <button
                key={i}
                onClick={() => handleKick(i)}
                disabled={phase !== 'kicking' || loading}
                className={clsx(
                  'rounded border transition-all flex items-center justify-center text-xl',
                  phase === 'kicking' && 'border-white/15 bg-white/[0.02] hover:border-[var(--accent)] hover:bg-[var(--accent)]/15 hover:scale-105 cursor-pointer',
                  showResult && isCovered && !isKicked && 'border-red-500/60 bg-red-500/25',
                  showResult && !isCovered && !isKicked && 'border-white/10 bg-white/[0.02]',
                  showResult && isKicked && isGoal && 'border-[var(--accent)] bg-[var(--accent)]/40 shadow-[0_0_20px_rgba(0,230,118,0.6)]',
                  showResult && isKicked && !isGoal && 'border-red-500 bg-red-500/50',
                )}
              >
                {showResult && isKicked && (isGoal ? '⚽' : '🧤')}
                {showResult && isCovered && !isKicked && <span className="text-base opacity-60">🧤</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Estado actual */}
      {phase === 'kicking' && (
        <div className="text-center space-y-1">
          <p className="text-sm text-slate-400">
            Probabilidad de gol: <span className="text-[var(--casino-yellow)] font-bold">{Math.round(nextProb * 100)}%</span>
          </p>
          <p className="text-xs text-slate-500">Elige una de las 12 zonas para patear</p>
        </div>
      )}

      {/* Feedback */}
      {phase === 'result' && (
        <p className={clsx(
          'text-center text-3xl font-black animate-bounce',
          isGoal
            ? 'text-[var(--accent)] drop-shadow-[0_0_15px_rgba(0,230,118,0.7)]'
            : 'text-red-400 drop-shadow-[0_0_15px_rgba(239,68,68,0.6)]'
        )}>
          {isGoal ? 'GOOOL!' : 'ATAJADO'}
        </p>
      )}

      {/* Decision: retirarse o seguir */}
      {phase === 'decision' && (
        <div className="space-y-3 text-center bg-slate-800/50 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Tu decision</p>
          <p className="text-sm text-white">
            Llevas <span className="text-[var(--accent)] font-bold">{goalsScored} gol{goalsScored > 1 ? 'es' : ''}</span>
            {' · '}
            Próximo: <span className="text-[var(--casino-yellow)] font-bold">{Math.round(nextProb * 100)}% chance</span>
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={handleCashout} disabled={loading} variant="secondary" size="sm">
              💰 Retirar ${Math.round(BET * multiplier).toLocaleString()}
            </Button>
            <Button onClick={handleContinue} disabled={loading} size="sm">
              ⚽ Seguir
            </Button>
          </div>
        </div>
      )}

      <p className="text-center text-[10px] text-slate-700">
        Costo: ${BET}/partida · 1 gratis al dia
      </p>
    </Card>
  )
}
