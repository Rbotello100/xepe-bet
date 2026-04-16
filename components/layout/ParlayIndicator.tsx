'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatOdds } from '@/lib/utils/format'
import type { ParlayLeg } from '@/hooks/useParlay'

const STORAGE_KEY = 'mundial-parlay'

export function ParlayIndicator() {
  const [legs, setLegs] = useState<ParlayLeg[]>([])

  useEffect(() => {
    const read = () => {
      try { setLegs(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')) } catch { /* */ }
    }
    read()
    window.addEventListener('storage', read)
    window.addEventListener('parlay-updated', read)
    return () => {
      window.removeEventListener('storage', read)
      window.removeEventListener('parlay-updated', read)
    }
  }, [])

  if (legs.length === 0) return null

  const totalOdds = legs.reduce((acc, leg) => acc * leg.odds, 1)

  return (
    <Link href="/parlay">
      <div className="fixed bottom-16 md:bottom-4 left-4 right-4 z-40 mx-auto max-w-2xl">
        <div className="flex items-center justify-between rounded-xl border border-[var(--casino-red)]/50 bg-[var(--casino-red)]/10 backdrop-blur-sm px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--casino-red)] text-xs font-bold text-white">
              {legs.length}
            </span>
            <div>
              <p className="text-sm font-medium text-white">
                {legs.length} {legs.length === 1 ? 'seleccion' : 'selecciones'}
              </p>
              <p className="text-xs text-[var(--casino-yellow)]">
                Odds total: x{formatOdds(totalOdds)}
              </p>
            </div>
          </div>
          <span className="text-sm font-medium text-[var(--casino-yellow)]">Ver parlay &rarr;</span>
        </div>
      </div>
    </Link>
  )
}
