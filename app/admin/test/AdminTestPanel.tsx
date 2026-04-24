'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

interface TestResult {
  name: string
  status: 'pending' | 'running' | 'success' | 'error'
  message?: string
  data?: Record<string, unknown>
}

export function AdminTestPanel() {
  const [results, setResults] = useState<TestResult[]>([])
  const [running, setRunning] = useState(false)

  const updateResult = (name: string, update: Partial<TestResult>) => {
    setResults(prev => prev.map(r => r.name === name ? { ...r, ...update } : r))
  }

  const addResult = (name: string) => {
    setResults(prev => [...prev, { name, status: 'pending' }])
  }

  // Test 1: Sync Odds (authenticated admin endpoint)
  const testSyncOdds = async () => {
    const name = 'Sync Odds (The Odds API)'
    addResult(name)
    updateResult(name, { status: 'running' })

    try {
      const res = await fetch('/api/admin/sync-odds', { method: 'POST' })
      const data = await res.json()
      updateResult(name, {
        status: data.error ? 'error' : 'success',
        message: data.error ?? `Synced: ${data.synced ?? 0} partidos. Remaining: ${data.remaining ?? 'N/A'}`,
        data,
      })
    } catch (e) {
      updateResult(name, { status: 'error', message: (e as Error).message })
    }
  }

  // Test 2: Sync Scores (authenticated admin endpoint)
  const testSyncScores = async () => {
    const name = 'Sync Scores (The Odds API)'
    addResult(name)
    updateResult(name, { status: 'running' })

    try {
      const res = await fetch('/api/admin/sync-scores', { method: 'POST' })
      const data = await res.json()
      updateResult(name, {
        status: data.error ? 'error' : 'success',
        message: data.error ?? `Synced: ${data.synced ?? 0} partidos. ${data.skipped ? '(Skipped: ' + data.reason + ')' : ''}`,
        data,
      })
    } catch (e) {
      updateResult(name, { status: 'error', message: (e as Error).message })
    }
  }

  const runAllTests = async () => {
    setRunning(true)
    setResults([])
    await testSyncOdds()
    await testSyncScores()
    setRunning(false)
  }

  const STATUS_COLORS = {
    pending: 'text-slate-400',
    running: 'text-amber-400',
    success: 'text-[var(--casino-teal)]',
    error: 'text-red-400',
  }

  const STATUS_ICONS = {
    pending: '⏳',
    running: '🔄',
    success: '✅',
    error: '❌',
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Tests de Integracion</h2>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={runAllTests} disabled={running}>
          {running ? 'Ejecutando...' : 'Ejecutar todos los tests'}
        </Button>
        <Button variant="secondary" onClick={testSyncOdds} disabled={running}>
          Sync Odds
        </Button>
        <Button variant="secondary" onClick={testSyncScores} disabled={running}>
          Sync Scores
        </Button>
      </div>

      <p className="text-xs text-slate-500">
        Para importar ligas nuevas (EPL, La Liga, etc.) usa el boton &ldquo;Discover events&rdquo; en el panel Admin &gt; API Usage.
      </p>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((result, i) => (
            <Card key={i} className="flex items-start gap-3">
              <span className="text-lg mt-0.5">{STATUS_ICONS[result.status]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{result.name}</p>
                <p className={`text-xs ${STATUS_COLORS[result.status]}`}>
                  {result.message ?? result.status}
                </p>
                {result.data && result.status !== 'pending' && (
                  <details className="mt-1">
                    <summary className="text-xs text-slate-600 cursor-pointer">Ver respuesta</summary>
                    <pre className="text-xs text-slate-500 mt-1 overflow-auto max-h-32 bg-slate-900 rounded p-2">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
