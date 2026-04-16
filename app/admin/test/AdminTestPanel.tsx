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

  // Test 1: Sync Odds from The Odds API
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

  // Test 2: Sync Scores from API-Football
  const testSyncScores = async () => {
    const name = 'Sync Scores (API-Football)'
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

  // Test 3: Check The Odds API directly
  const testOddsAPI = async () => {
    const name = 'The Odds API - Events (gratis)'
    addResult(name)
    updateResult(name, { status: 'running' })

    try {
      const res = await fetch('/api/test/odds-events')
      const data = await res.json()
      updateResult(name, {
        status: data.error ? 'error' : 'success',
        message: data.error ?? `${data.count} eventos encontrados para ${data.sport}`,
        data,
      })
    } catch (e) {
      updateResult(name, { status: 'error', message: (e as Error).message })
    }
  }

  // Test 4: Check API-Football directly
  const testFootballAPI = async () => {
    const name = 'API-Football - Status'
    addResult(name)
    updateResult(name, { status: 'running' })

    try {
      const res = await fetch('/api/test/football-status')
      const data = await res.json()
      updateResult(name, {
        status: data.error ? 'error' : 'success',
        message: data.error ?? `Plan: ${data.plan}. Requests hoy: ${data.requestsToday}/${data.requestsLimit}`,
        data,
      })
    } catch (e) {
      updateResult(name, { status: 'error', message: (e as Error).message })
    }
  }

  // Test 5: Import live league (default sport)
  const testImportLeague = async () => {
    const name = 'Importar Liga Activa'
    addResult(name)
    updateResult(name, { status: 'running' })

    try {
      const res = await fetch('/api/test/import-league', { method: 'POST' })
      const data = await res.json()
      updateResult(name, {
        status: data.error ? 'error' : 'success',
        message: data.error ?? data.message,
        data,
      })
    } catch (e) {
      updateResult(name, { status: 'error', message: (e as Error).message })
    }
  }

  // Test 5b: One-click EPL demo (import + sync)
  const testImportEplDemo = async () => {
    const name = 'Demo EPL (import + sync odds)'
    addResult(name)
    updateResult(name, { status: 'running' })

    try {
      // Step 1: import EPL events as matches
      const importRes = await fetch('/api/test/import-league?sport=soccer_epl', { method: 'POST' })
      const importData = await importRes.json()
      if (importData.error) {
        updateResult(name, { status: 'error', message: `Import fallo: ${importData.error}`, data: importData })
        return
      }

      // Step 2: sync odds for the freshly imported EPL matches
      const syncRes = await fetch('/api/admin/sync-odds?sport=soccer_epl', { method: 'POST' })
      const syncData = await syncRes.json()
      if (syncData.error) {
        updateResult(name, {
          status: 'error',
          message: `Imported ${importData.matches_created} pero sync fallo: ${syncData.error}`,
          data: { importData, syncData },
        })
        return
      }

      updateResult(name, {
        status: 'success',
        message: `Importados ${importData.matches_created} partidos, odds sincronizadas: ${syncData.synced ?? 0}`,
        data: { importData, syncData },
      })
    } catch (e) {
      updateResult(name, { status: 'error', message: (e as Error).message })
    }
  }

  const runAllTests = async () => {
    setRunning(true)
    setResults([])
    await testOddsAPI()
    await testFootballAPI()
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
        <Button variant="secondary" onClick={testOddsAPI} disabled={running}>
          Test Odds API
        </Button>
        <Button variant="secondary" onClick={testFootballAPI} disabled={running}>
          Test Football API
        </Button>
        <Button variant="secondary" onClick={testSyncOdds} disabled={running}>
          Sync Odds
        </Button>
        <Button variant="secondary" onClick={testSyncScores} disabled={running}>
          Sync Scores
        </Button>
        <Button variant="secondary" onClick={testImportLeague} disabled={running}>
          Importar Liga Activa
        </Button>
        <Button variant="primary" onClick={testImportEplDemo} disabled={running}>
          Demo EPL (import + odds)
        </Button>
      </div>

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
