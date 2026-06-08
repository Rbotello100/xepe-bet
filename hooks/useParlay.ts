'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUser } from './useUser'

export interface ParlayLeg {
  matchId: string
  matchLabel: string
  pick: string
  pickLabel: string
  odds: number
}

const STORAGE_PREFIX = 'mundial-parlay-'

// Dispatch diferido para evitar "setState during render" cuando otros componentes
// escuchan el evento y hacen setState sincrono.
function notifyParlayUpdate() {
  if (typeof window === 'undefined') return
  queueMicrotask(() => window.dispatchEvent(new CustomEvent('parlay-updated')))
}

const VALID_PICKS = new Set(['home', 'draw', 'away', '1', 'X', '2'])

// Acepta solo legs con shape valido. Antes de este filtro, un leg con `pick`
// corrupto (legacy, version vieja del codigo) hacia que placeParlay tirara
// "Pick invalido en alguna seleccion" sin chance de fixearlo desde el UI.
// Si detectamos un leg invalido lo descartamos silenciosamente y rescribimos
// el storage sin el — el user ve la talonera limpia y puede armar de nuevo.
function isValidLeg(l: unknown): l is ParlayLeg {
  if (!l || typeof l !== 'object') return false
  const x = l as Record<string, unknown>
  return typeof x.matchId === 'string'
    && typeof x.matchLabel === 'string'
    && typeof x.pick === 'string'
    && VALID_PICKS.has(x.pick)
    && typeof x.pickLabel === 'string'
    && typeof x.odds === 'number'
    && Number.isFinite(x.odds)
    && x.odds > 1
}

function readStorage(key: string): ParlayLeg[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '[]')
    if (!Array.isArray(raw)) return []
    const valid = raw.filter(isValidLeg)
    // Si encontramos legs corruptos, reescribimos el storage limpio para que
    // futuras lecturas no paguen el costo del filter ni vuelvan a fallar.
    if (valid.length !== raw.length) {
      try { localStorage.setItem(key, JSON.stringify(valid)) } catch { /* ignore */ }
    }
    return valid
  } catch {
    return []
  }
}

// Borra parlay keys de OTROS users que hayan quedado en este device. Garantiza
// que login de B no muestre la parlay que dejo A. Tambien limpia la legacy key
// 'mundial-parlay' (sin sufijo) que usaban versiones anteriores del codigo.
function cleanupForeignParlays(currentKey: string) {
  if (typeof window === 'undefined') return
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k) continue
    if (k === 'mundial-parlay') toRemove.push(k)
    else if (k.startsWith(STORAGE_PREFIX) && k !== currentKey) toRemove.push(k)
  }
  for (const k of toRemove) localStorage.removeItem(k)
}

/**
 * Hook para manejar la parlay del usuario actual.
 *
 * Por que esta scoped por user: si dos usuarios comparten el mismo browser
 * (puesto compartido, kiosko, etc), user B no debe ver la parlay que dejo
 * user A. Cada uno tiene su propia key `mundial-parlay-<uuid>`.
 *
 * Por que las ops leen siempre de localStorage como source of truth: cada
 * componente que llama useParlay() tiene su propio useState aislado, asi que
 * "prev" del closure de setState podria estar stale. Leemos del storage
 * directamente para evitar pisar cambios de otra instancia. Las instancias
 * escuchan `parlay-updated` para sincronizar su estado React local.
 */
export function useParlay() {
  const userId = useUser()
  const storageKey = useMemo(() => (userId ? STORAGE_PREFIX + userId : null), [userId])
  const [legs, setLegs] = useState<ParlayLeg[]>([])

  useEffect(() => {
    if (!storageKey) {
      setLegs([])
      return
    }
    cleanupForeignParlays(storageKey)
    const sync = () => setLegs(readStorage(storageKey))
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener('parlay-updated', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('parlay-updated', sync)
    }
  }, [storageKey])

  const addLeg = useCallback((leg: ParlayLeg) => {
    if (!storageKey) return
    const current = readStorage(storageKey)
    if (current.some(l => l.matchId === leg.matchId)) return
    const next = [...current, leg]
    localStorage.setItem(storageKey, JSON.stringify(next))
    setLegs(next)
    notifyParlayUpdate()
  }, [storageKey])

  const removeLeg = useCallback((matchId: string) => {
    if (!storageKey) return
    const current = readStorage(storageKey)
    const next = current.filter(l => l.matchId !== matchId)
    localStorage.setItem(storageKey, JSON.stringify(next))
    setLegs(next)
    notifyParlayUpdate()
  }, [storageKey])

  const clearAll = useCallback(() => {
    if (!storageKey) return
    localStorage.setItem(storageKey, '[]')
    setLegs([])
    notifyParlayUpdate()
  }, [storageKey])

  const totalOdds = legs.reduce((acc, leg) => acc * leg.odds, 1)

  return { legs, addLeg, removeLeg, clearAll, totalOdds }
}
