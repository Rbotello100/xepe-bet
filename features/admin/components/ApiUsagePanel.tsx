'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { syncOddsManual, syncScoresManual, discoverMatchesManual, getOddsApiUsage, type ApiUsageSummary } from '@/features/admin/actions'

interface ApiUsagePanelProps {
  initial: ApiUsageSummary
}

const SPORT_OPTIONS = [
  { value: '', label: 'Usar pending de la DB (auto)' },
  { value: 'soccer_fifa_world_cup', label: 'Mundial 2026' },
  { value: 'soccer_epl', label: 'Premier League' },
  { value: 'soccer_spain_la_liga', label: 'La Liga' },
  { value: 'soccer_uefa_champs_league', label: 'Champions League' },
]

export function ApiUsagePanel({ initial }: ApiUsagePanelProps) {
  const [usage, setUsage] = useState<ApiUsageSummary>(initial)
  const [sportOverride, setSportOverride] = useState('')
  const [isPending, startTransition] = useTransition()
  const [lastResult, setLastResult] = useState<string | null>(null)

  const refresh = () => {
    startTransition(async () => {
      const res = await getOddsApiUsage(30)
      if (!('error' in res)) setUsage(res)
    })
  }

  const doSyncOdds = () => {
    startTransition(async () => {
      const res = await syncOddsManual(sportOverride || undefined)
      setLastResult(JSON.stringify(res, null, 2))
      const fresh = await getOddsApiUsage(30)
      if (!('error' in fresh)) setUsage(fresh)
    })
  }

  const doSyncScores = () => {
    startTransition(async () => {
      const res = await syncScoresManual()
      setLastResult(JSON.stringify(res, null, 2))
      const fresh = await getOddsApiUsage(30)
      if (!('error' in fresh)) setUsage(fresh)
    })
  }

  const doDiscover = () => {
    startTransition(async () => {
      const res = await discoverMatchesManual(sportOverride || undefined)
      setLastResult(JSON.stringify(res, null, 2))
      const fresh = await getOddsApiUsage(30)
      if (!('error' in fresh)) setUsage(fresh)
    })
  }

  const remaining = usage.last_remaining
  const remainingColor =
    remaining === null ? 'text-slate-400' :
    remaining < 50 ? 'text-red-400' :
    remaining < 150 ? 'text-amber-400' :
    'text-[var(--casino-teal)]'

  return (
    <div className="space-y-4">
      {/* Stats de créditos API */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <p className="text-xs text-slate-400">Créditos restantes</p>
          <p className={`text-xl font-bold ${remainingColor}`}>
            {remaining ?? '—'}
          </p>
          {remaining !== null && remaining < 50 && (
            <p className="mt-1 text-[10px] text-red-400">ALERTA: quedan pocos</p>
          )}
        </Card>
        <Card className="text-center">
          <p className="text-xs text-slate-400">Gastados hoy</p>
          <p className="text-xl font-bold text-white">{usage.credits_today}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs text-slate-400">Gastados este mes</p>
          <p className="text-xl font-bold text-white">{usage.credits_this_month}</p>
        </Card>
      </div>

      {/* Controles de sync manual */}
      <Card className="space-y-3">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Sport para sync de odds</label>
          <select
            value={sportOverride}
            onChange={e => setSportOverride(e.target.value)}
            className="w-full rounded-lg bg-slate-800 text-slate-200 px-3 py-2 text-sm border border-slate-700"
          >
            {SPORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            &ldquo;Auto&rdquo; itera sobre todos los sports con matches pending. Override fuerza uno solo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={doDiscover} disabled={isPending}>
            {isPending ? 'Descubriendo...' : 'Discover events'}
          </Button>
          <Button variant="secondary" size="sm" onClick={doSyncOdds} disabled={isPending}>
            {isPending ? 'Sincronizando...' : 'Sync odds'}
          </Button>
          <Button variant="secondary" size="sm" onClick={doSyncScores} disabled={isPending}>
            {isPending ? 'Sincronizando...' : 'Sync scores'}
          </Button>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={isPending}>
            Refrescar
          </Button>
        </div>

        <p className="text-xs text-slate-500">
          <span className="text-[var(--accent)]">Discover</span>: llama /events (gratis). Linka seeds del Mundial con external_id o inserta matches nuevos (EPL, La Liga) a medida que la API los publica.
        </p>

        {lastResult && (
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-900 p-2 text-[10px] text-slate-300">
            {lastResult}
          </pre>
        )}
      </Card>

      {/* Breakdown por endpoint */}
      {usage.by_endpoint.length > 0 && (
        <Card>
          <p className="mb-2 text-sm font-medium text-white">Consumo por endpoint (30d)</p>
          <div className="space-y-1">
            {usage.by_endpoint.map(e => (
              <div key={e.endpoint} className="flex justify-between text-xs">
                <span className="text-slate-400">{e.endpoint}</span>
                <span className="text-slate-200">{e.credits} créditos</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Historial reciente */}
      <Card>
        <p className="mb-2 text-sm font-medium text-white">Últimos 20 calls</p>
        {usage.recent.length === 0 ? (
          <p className="text-xs text-slate-500">Sin datos aún</p>
        ) : (
          <div className="space-y-1">
            {usage.recent.map(e => (
              <div key={e.id} className="grid grid-cols-5 gap-2 rounded bg-slate-800/50 px-2 py-1 text-[11px]">
                <span className="text-slate-500 col-span-2">
                  {new Date(e.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-slate-300">{e.endpoint}</span>
                <span className="text-slate-400 truncate" title={e.sport_key}>{e.sport_key.replace('soccer_', '')}</span>
                <span className={`text-right ${e.error ? 'text-red-400' : 'text-slate-200'}`}>
                  {e.error ? 'error' : `${e.credits_used}c`} {e.remaining !== null && `(${e.remaining} left)`}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
