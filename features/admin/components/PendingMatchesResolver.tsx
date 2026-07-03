'use client'

import { useState, useTransition, useRef } from 'react'
import { toast } from 'sonner'
import { resolveMatch, cancelMatch } from '@/features/admin/actions'
import { Card } from '@/components/ui/Card'
import type { PendingResolveMatch } from '@/features/admin/observability/queries'

interface Props {
  matches: PendingResolveMatch[]
}

/**
 * Panel de resolucion manual de partidos con kickoff ya pasado.
 *
 * Flow anti-error:
 *   1. Admin ingresa score 90'. Los inputs son grandes y claros con label
 *      explicito "MINUTO 90" para no confundir con score final.
 *   2. Muestra impacto en vivo (bets/parlays afectados + monto).
 *   3. Boton "Vista previa" (paso 1). Muestra confirmacion inline con el
 *      texto "vas a resolver X-Y afectando Z bets por $W" — obliga a leer.
 *   4. Boton "Confirmar" (paso 2). Solo si preview esta activo.
 *   5. Guard client-side: no permite double-click (processingRef).
 *   6. Guard server-side: resolveMatch es idempotente (UPDATE con guard
 *      status='pending' en cada leg + reference_id UNIQUE en addCredits).
 *
 * Estados por card:
 *   - idle: inputs vacios
 *   - editing: inputs con datos, sin preview
 *   - previewing: modo confirmacion activo
 *   - processing: submit en vuelo
 *   - resolved: partido resuelto (card queda con resumen final)
 */
export function PendingMatchesResolver({ matches }: Props) {
  if (matches.length === 0) {
    return (
      <Card className="border-l-4 border-l-win bg-win/5">
        <p className="font-bold text-win">✓ No hay partidos por resolver</p>
        <p className="text-sm text-muted">Todos los partidos cuyo kickoff ya paso estan en status finished o cancelled.</p>
      </Card>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-strong">🎯 Partidos por resolver ({matches.length})</h2>
        <span className="text-xs text-subtle">Ingresa el marcador al minuto 90 (excluye prorroga y penales)</span>
      </div>
      <div className="grid gap-3">
        {matches.map(m => <MatchCard key={m.id} match={m} />)}
      </div>
    </section>
  )
}

function MatchCard({ match }: { match: PendingResolveMatch }) {
  const [home, setHome] = useState('')
  const [away, setAway] = useState('')
  const [preview, setPreview] = useState(false)
  const [resolved, setResolved] = useState<null | { won: number; lost: number; parlays: number; predictions: number }>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const processingRef = useRef(false)

  const homeNum = parseInt(home, 10)
  const awayNum = parseInt(away, 10)
  const scoresValid = Number.isFinite(homeNum) && Number.isFinite(awayNum) && homeNum >= 0 && awayNum >= 0 && homeNum <= 20 && awayNum <= 20

  const winner = scoresValid
    ? homeNum > awayNum ? `${match.home_team.name} gana`
    : homeNum < awayNum ? `${match.away_team.name} gana`
    : 'Empate'
    : null

  const startsAt = new Date(match.starts_at)
  const hoursAgo = Math.round((Date.now() - startsAt.getTime()) / 3600000)

  const handlePreview = () => {
    setError(null)
    if (!scoresValid) {
      setError('Ingresa un marcador valido (0-20 por lado)')
      return
    }
    setPreview(true)
  }

  const handleConfirm = () => {
    if (processingRef.current || resolved) return
    processingRef.current = true

    startTransition(async () => {
      try {
        const res = await resolveMatch(match.id, homeNum, awayNum)
        if ('error' in res && res.error) {
          setError(res.error)
          toast.error(`Error: ${res.error}`)
        } else if ('success' in res) {
          setResolved({
            won: res.bets_won ?? 0,
            lost: res.bets_lost ?? 0,
            parlays: res.parlays_resolved ?? 0,
            predictions: res.predictions_resolved ?? 0,
          })
          toast.success(`${match.home_team.name} ${homeNum}-${awayNum} ${match.away_team.name} resuelto`)
        }
      } finally {
        processingRef.current = false
      }
    })
  }

  const handleCancel = () => {
    if (processingRef.current || resolved) return
    if (!confirm(`¿Cancelar ${match.home_team.name} vs ${match.away_team.name}? Se refundean ${match.impact.bets_pending} bets ($${match.impact.stake_total}) y ${match.impact.parlay_legs_pending} legs.`)) return
    processingRef.current = true
    startTransition(async () => {
      try {
        const res = await cancelMatch(match.id, 'no jugado / admin manual')
        if ('error' in res && res.error) {
          setError(res.error)
          toast.error(`Error: ${res.error}`)
        } else {
          setResolved({ won: 0, lost: 0, parlays: 0, predictions: 0 })
          toast.success('Partido cancelado y bets refundeadas')
        }
      } finally {
        processingRef.current = false
      }
    })
  }

  if (resolved) {
    return (
      <Card className="border-l-4 border-l-win bg-win/5 space-y-1">
        <p className="font-semibold text-strong">
          ✓ {match.home_team.name} {homeNum}-{awayNum} {match.away_team.name}
        </p>
        <p className="text-xs text-muted">
          {resolved.predictions} predicciones · {resolved.won} bets W / {resolved.lost} bets L · {resolved.parlays} parlays cerrados
        </p>
      </Card>
    )
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-strong truncate">
            {match.home_team.flag ?? ''} {match.home_team.name} <span className="text-subtle">vs</span> {match.away_team.name} {match.away_team.flag ?? ''}
          </p>
          <p className="text-[11px] text-muted">
            {match.round ? `${match.round.toUpperCase()} · ` : ''}
            Empezó hace {hoursAgo}h · status <span className="font-mono">{match.status}</span>
          </p>
        </div>
        <div className="text-right text-xs text-muted shrink-0">
          <div><span className="text-subtle">pending:</span> <span className="font-mono">{match.impact.bets_pending}</span> bets · <span className="font-mono">{match.impact.parlay_legs_pending}</span> legs</div>
          <div><span className="text-subtle">pozo:</span> <span className="font-mono">${match.impact.stake_total.toLocaleString('es-CL')}</span> · at risk <span className="font-mono">${match.impact.payout_at_risk.toLocaleString('es-CL')}</span></div>
        </div>
      </div>

      {!preview && (
        <>
          <div className="rounded-md border border-card-border bg-sunken px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-subtle mb-1.5">Marcador al minuto 90</p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-subtle">{match.home_team.name}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="20"
                  value={home}
                  onChange={e => { setHome(e.target.value); setError(null) }}
                  className="mt-0.5 w-full rounded-md border border-card-border bg-card px-3 py-2 text-lg font-bold text-strong text-center focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="0"
                />
              </div>
              <span className="text-2xl text-subtle pt-4">-</span>
              <div className="flex-1">
                <label className="text-[10px] text-subtle">{match.away_team.name}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="20"
                  value={away}
                  onChange={e => { setAway(e.target.value); setError(null) }}
                  className="mt-0.5 w-full rounded-md border border-card-border bg-card px-3 py-2 text-lg font-bold text-strong text-center focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="0"
                />
              </div>
            </div>
            {winner && (
              <p className="mt-2 text-xs text-center text-accent-deep font-semibold">Ganador (1X2): {winner}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePreview}
              disabled={!scoresValid}
              className="flex-1 rounded-md bg-accent px-3 py-2 text-sm font-bold text-slate-900 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Vista previa
            </button>
            <button
              onClick={handleCancel}
              disabled={isPending}
              className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-40"
              title="No se jugo — cancelar y refundear"
            >
              Cancelar partido
            </button>
          </div>
        </>
      )}

      {preview && (
        <div className="rounded-md border border-accent bg-accent/5 p-3 space-y-2.5">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-subtle mb-1">Vas a resolver</p>
            <p className="text-base font-bold text-strong">
              {match.home_team.name} <span className="text-accent-deep">{homeNum}</span> - <span className="text-accent-deep">{awayNum}</span> {match.away_team.name}
            </p>
            <p className="text-xs text-muted mt-0.5">Ganador (1X2): <span className="font-semibold text-accent-deep">{winner}</span></p>
          </div>

          <div className="rounded bg-card px-2.5 py-2 text-xs space-y-0.5">
            <p className="text-muted">Impacto:</p>
            <p className="text-foreground">→ Se van a resolver <span className="font-bold">{match.impact.bets_pending}</span> bets pending (pozo <span className="font-mono">${match.impact.stake_total.toLocaleString('es-CL')}</span>)</p>
            <p className="text-foreground">→ Se van a resolver <span className="font-bold">{match.impact.parlay_legs_pending}</span> parlay legs</p>
            <p className="text-foreground">→ Payout a pagar: hasta <span className="font-mono">${match.impact.payout_at_risk.toLocaleString('es-CL')}</span> (solo ganadores)</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleConfirm}
              disabled={isPending}
              className="flex-1 rounded-md bg-win px-3 py-2 text-sm font-bold text-slate-900 hover:opacity-90 disabled:opacity-40"
            >
              {isPending ? 'Procesando...' : `✓ Confirmar ${homeNum}-${awayNum}`}
            </button>
            <button
              onClick={() => setPreview(false)}
              disabled={isPending}
              className="rounded-md border border-card-border px-3 py-2 text-xs text-muted hover:bg-sunken"
            >
              Editar
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger">⚠ {error}</p>}
    </Card>
  )
}
