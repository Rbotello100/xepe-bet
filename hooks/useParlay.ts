'use client'

import { useState, useEffect, useCallback } from 'react'

export interface ParlayLeg {
  matchId: string
  matchLabel: string
  pick: string
  pickLabel: string
  odds: number
}

const STORAGE_KEY = 'mundial-parlay'

// Dispatch diferido para evitar "setState during render" cuando otros componentes
// escuchan el evento y hacen setState sincrono.
function notifyParlayUpdate() {
  if (typeof window === 'undefined') return
  queueMicrotask(() => window.dispatchEvent(new CustomEvent('parlay-updated')))
}

export function useParlay() {
  const [legs, setLegs] = useState<ParlayLeg[]>([])

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try { setLegs(JSON.parse(stored)) } catch { /* ignore */ }
    }
  }, [])

  const persist = useCallback((newLegs: ParlayLeg[]) => {
    setLegs(newLegs)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newLegs))
    notifyParlayUpdate()
  }, [])

  const addLeg = useCallback((leg: ParlayLeg) => {
    setLegs(prev => {
      if (prev.some(l => l.matchId === leg.matchId)) return prev
      const next = [...prev, leg]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
    notifyParlayUpdate()
  }, [])

  const removeLeg = useCallback((matchId: string) => {
    setLegs(prev => {
      const next = prev.filter(l => l.matchId !== matchId)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
    notifyParlayUpdate()
  }, [])

  const clearAll = useCallback(() => {
    persist([])
  }, [persist])

  const totalOdds = legs.reduce((acc, leg) => acc * leg.odds, 1)

  return { legs, addLeg, removeLeg, clearAll, totalOdds }
}
