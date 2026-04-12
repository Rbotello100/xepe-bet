'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatOdds } from '@/lib/utils/format'
import type { ParlayLeg } from '@/hooks/useParlay'

const STORAGE_KEY = 'mundial-parlay'

export function ParlayIndicator() {
  const [legs, setLegs] = useState<ParlayLeg[]>([])

  useEffect(() => {
    // Read initial
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) try { setLegs(JSON.parse(stored)) } catch { /* */ }

    // Listen for changes from other components
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        try { setLegs(JSON.parse(e.newValue ?? '[]')) } catch { /* */ }
      }
    }

    // Also poll every 500ms since StorageEvent doesn't fire within same tab
    const interval = setInterval(() => {
      const current = localStorage.getItem(STORAGE_KEY)
      try { setLegs(JSON.parse(current ?? '[]')) } catch { /* */ }
    }, 500)

    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
      clearInterval(interval)
    }
  }, [])

  if (legs.length === 0) return null

  const totalOdds = legs.reduce((acc, leg) => acc * leg.odds, 1)

  return (
    <Link href="/parlay">
      <div className="fixed bottom-16 md:bottom-4 left-4 right-4 z-40 mx-auto max-w-2xl">
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/50 bg-emerald-500/10 backdrop-blur-sm px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
              {legs.length}
            </span>
            <div>
              <p className="text-sm font-medium text-white">
                {legs.length} {legs.length === 1 ? 'seleccion' : 'selecciones'}
              </p>
              <p className="text-xs text-emerald-400">
                Odds total: x{formatOdds(totalOdds)}
              </p>
            </div>
          </div>
          <span className="text-sm font-medium text-emerald-400">Ver parlay &rarr;</span>
        </div>
      </div>
    </Link>
  )
}
