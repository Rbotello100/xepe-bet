'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { voidOrphanParlay, voidAllOrphanParlays, reconcileMatch, getHealthChecks, type HealthCheckResult } from '@/features/admin/actions'

interface HealthCheckPanelProps {
  initial: HealthCheckResult
}

export function HealthCheckPanel({ initial }: HealthCheckPanelProps) {
  const [data, setData] = useState<HealthCheckResult>(initial)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  const refresh = () => {
    startTransition(async () => {
      const res = await getHealthChecks()
      if ('error' in res) setMessage(`Error: ${res.error}`)
      else setData(res)
    })
  }

  const handleVoidOne = (parlayId: string) => {
    startTransition(async () => {
      const res = await voidOrphanParlay(parlayId)
      if ('error' in res) setMessage(`Error: ${res.error}`)
      else {
        setMessage(`Parlay cerrado. Refund: $${res.refunded}`)
        const fresh = await getHealthChecks()
        if (!('error' in fresh)) setData(fresh)
      }
    })
  }

  const handleVoidAll = () => {
    if (!confirm(`Cerrar ${data.orphan_parlays.length} parlays huérfanos y refundar a sus users?`)) return
    startTransition(async () => {
      const res = await voidAllOrphanParlays()
      if ('error' in res) setMessage(`Error: ${res.error}`)
      else {
        setMessage(`${res.succeeded}/${res.total} parlays cerrados`)
        const fresh = await getHealthChecks()
        if (!('error' in fresh)) setData(fresh)
      }
    })
  }

  const handleReconcile = (matchId: string) => {
    startTransition(async () => {
      const res = await reconcileMatch(matchId)
      if ('error' in res) setMessage(`Error: ${res.error}`)
      else {
        setMessage('Match reconciliado')
        const fresh = await getHealthChecks()
        if (!('error' in fresh)) setData(fresh)
      }
    })
  }

  const totalIssues =
    data.orphan_parlays.length +
    data.legs_without_match.length +
    data.bets_pending_finished_match.length +
    data.matches_finished_no_score.length +
    data.bets_pending_old.length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">Total de inconsistencias</p>
          <p className={`text-2xl font-bold ${totalIssues === 0 ? 'text-[var(--casino-teal)]' : 'text-amber-400'}`}>
            {totalIssues}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={isPending}>
          {isPending ? 'Revisando...' : 'Refrescar'}
        </Button>
      </div>

      {message && (
        <div className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200">{message}</div>
      )}

      {/* Parlays huérfanos */}
      <Section
        title="Parlays sin legs (huérfanos)"
        count={data.orphan_parlays.length}
        description="Parlays que quedaron creados sin selecciones. Se refundan al user y se marcan 'void'."
        action={
          data.orphan_parlays.length > 0 && (
            <Button size="sm" variant="danger" onClick={handleVoidAll} disabled={isPending}>
              Cerrar todos (refund)
            </Button>
          )
        }
      >
        {data.orphan_parlays.length === 0 ? (
          <p className="text-xs text-slate-500">OK - no hay huérfanos</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {data.orphan_parlays.map(p => (
              <li key={p.id} className="flex items-center justify-between rounded bg-slate-800/50 px-2 py-1">
                <span className="text-slate-300">
                  ${p.amount} · user {p.user_id.slice(0, 8)} · {new Date(p.created_at).toLocaleDateString()}
                </span>
                <Button size="sm" variant="outline" onClick={() => handleVoidOne(p.id)} disabled={isPending}>
                  Cerrar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Legs sin match */}
      <Section
        title="Legs sin match válido"
        count={data.legs_without_match.length}
        description="Selecciones de parlays cuyo match_id es null o apunta a un match inexistente."
      >
        {data.legs_without_match.length === 0 ? (
          <p className="text-xs text-slate-500">OK</p>
        ) : (
          <ul className="space-y-1 text-xs text-slate-300">
            {data.legs_without_match.map(l => (
              <li key={l.id} className="rounded bg-slate-800/50 px-2 py-1">
                leg {l.id.slice(0, 8)} · pick {l.pick} · parlay {l.parlay_id.slice(0, 8)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Bets pending con match finished */}
      <Section
        title="Apuestas pending con match finalizado"
        count={data.bets_pending_finished_match.length}
        description="Apuestas que deberían haberse pagado pero quedaron pending. Re-corré el auto-resolve."
      >
        {data.bets_pending_finished_match.length === 0 ? (
          <p className="text-xs text-slate-500">OK</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {Array.from(new Set(data.bets_pending_finished_match.map(b => b.match_id))).map(matchId => (
              <li key={matchId} className="flex items-center justify-between rounded bg-slate-800/50 px-2 py-1">
                <span className="text-slate-300">
                  match {matchId.slice(0, 8)} · {data.bets_pending_finished_match.filter(b => b.match_id === matchId).length} bets
                </span>
                <Button size="sm" variant="outline" onClick={() => handleReconcile(matchId)} disabled={isPending}>
                  Re-resolver
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Matches finished sin score */}
      <Section
        title="Partidos finished sin score"
        count={data.matches_finished_no_score.length}
        description="Están marcados finished pero home_score o away_score son null. Resolvelos desde la tab 'Resolver'."
      >
        {data.matches_finished_no_score.length === 0 ? (
          <p className="text-xs text-slate-500">OK</p>
        ) : (
          <ul className="space-y-1 text-xs text-slate-300">
            {data.matches_finished_no_score.map(m => (
              <li key={m.id} className="rounded bg-slate-800/50 px-2 py-1">
                {m.home_name} vs {m.away_name}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Bets viejos (> 3 días) */}
      <Section
        title="Apuestas pending > 3 días"
        count={data.bets_pending_old.length}
        description="Matches viejos fuera de la ventana de /scores. Hay que resolverlos manual desde 'Resolver Partidos'."
      >
        {data.bets_pending_old.length === 0 ? (
          <p className="text-xs text-slate-500">OK</p>
        ) : (
          <ul className="space-y-1 text-xs text-slate-300">
            {Array.from(new Set(data.bets_pending_old.map(b => b.match_id))).map(matchId => {
              const sample = data.bets_pending_old.find(b => b.match_id === matchId)!
              const count = data.bets_pending_old.filter(b => b.match_id === matchId).length
              return (
                <li key={matchId} className="rounded bg-slate-800/50 px-2 py-1">
                  {sample.home_name} vs {sample.away_name} · {new Date(sample.starts_at).toLocaleDateString()} · {count} bets
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}

function Section({
  title,
  count,
  description,
  action,
  children,
}: {
  title: string
  count: number
  description: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const ok = count === 0
  return (
    <Card>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${ok ? 'bg-[var(--casino-teal)]' : 'bg-amber-400'}`} />
            <p className="text-sm font-medium text-white">{title}</p>
            <span className="text-xs text-slate-500">({count})</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}
