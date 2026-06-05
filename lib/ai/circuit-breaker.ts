// Circuit breaker para Anthropic con estado persistente en DB.
//
// Antes el estado vivia in-memory por instancia de Vercel function — si Vercel
// spineaba N instancias, cada una llevaba su propio contador y la coordinacion
// era cero. Ahora la tabla `circuit_state` (1 row por circuito) actua como
// fuente compartida: todas las instancias leen y escriben el mismo estado.
//
// Trade-off: 1 SELECT extra antes de cada llamada a Anthropic (~5ms en
// pooler). Aceptable para un cron que dispara cada 30 min.

import { createAdminClient } from '@/lib/supabase/admin'

const CIRCUIT_NAME = 'anthropic'
const THRESHOLD = 3                  // 3 fallos consecutivos abre
const OPEN_DURATION_MS = 5 * 60_000  // abierto 5 min, luego half-open

interface CircuitRow {
  name: string
  opened_at: string | null
  consecutive_failures: number
}

async function readState(): Promise<CircuitRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('circuit_state')
    .select('name, opened_at, consecutive_failures')
    .eq('name', CIRCUIT_NAME)
    .maybeSingle()
  return data
}

export async function isCircuitOpen(): Promise<boolean> {
  const state = await readState()
  if (!state || !state.opened_at) return false
  const elapsed = Date.now() - new Date(state.opened_at).getTime()
  if (elapsed >= OPEN_DURATION_MS) return false  // half-open
  return true
}

export async function recordSuccess(): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('circuit_state')
    .update({
      consecutive_failures: 0,
      opened_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('name', CIRCUIT_NAME)
}

export async function recordFailure(): Promise<void> {
  const admin = createAdminClient()
  const state = await readState()
  const newFails = (state?.consecutive_failures ?? 0) + 1
  const shouldOpen = newFails >= THRESHOLD
  await admin
    .from('circuit_state')
    .update({
      consecutive_failures: newFails,
      opened_at: shouldOpen ? new Date().toISOString() : state?.opened_at ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('name', CIRCUIT_NAME)
  if (shouldOpen) {
    console.warn(`[claude circuit-breaker] OPEN after ${newFails} fails`)
  }
}

export async function circuitStatus(): Promise<{ open: boolean; failures: number; openedAt: string | null }> {
  const state = await readState()
  return {
    open: await isCircuitOpen(),
    failures: state?.consecutive_failures ?? 0,
    openedAt: state?.opened_at ?? null,
  }
}
