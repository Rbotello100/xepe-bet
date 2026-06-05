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

function readStorage(): ParlayLeg[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

// Cada componente que usa este hook tiene su propio useState local. Antes,
// `addLeg`/`removeLeg` calculaban el next a partir de `prev` del closure
// React — lo que provocaba que un MatchCard B no viera las legs agregadas
// por MatchCard A y terminara pisando el localStorage al hacer set. El fix:
// leer SIEMPRE de localStorage como source of truth antes de mutar, y que
// todas las instancias del hook escuchen `parlay-updated` para sincronizar
// su estado React local.
export function useParlay() {
  const [legs, setLegs] = useState<ParlayLeg[]>([])

  useEffect(() => {
    const sync = () => setLegs(readStorage())
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener('parlay-updated', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('parlay-updated', sync)
    }
  }, [])

  const addLeg = useCallback((leg: ParlayLeg) => {
    const current = readStorage()
    if (current.some(l => l.matchId === leg.matchId)) return
    const next = [...current, leg]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setLegs(next)
    notifyParlayUpdate()
  }, [])

  const removeLeg = useCallback((matchId: string) => {
    const current = readStorage()
    const next = current.filter(l => l.matchId !== matchId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setLegs(next)
    notifyParlayUpdate()
  }, [])

  const clearAll = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '[]')
    setLegs([])
    notifyParlayUpdate()
  }, [])

  const totalOdds = legs.reduce((acc, leg) => acc * leg.odds, 1)

  return { legs, addLeg, removeLeg, clearAll, totalOdds }
}
