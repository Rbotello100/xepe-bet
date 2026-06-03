// Circuit breaker simple para Anthropic.
//
// Estado in-memory por instancia de Vercel function. Si en menos de
// WINDOW_MS hay >= THRESHOLD fallas consecutivas, abre el circuito por
// OPEN_DURATION_MS. Cualquier llamada durante ese tiempo retorna inmediato
// con error sin pegar a Anthropic — evita el pile-up cuando la API esta
// degradada.
//
// Limitacion: el estado vive solo en la instancia actual de la serverless
// function. Si Vercel spinea N instancias, cada una tiene su propio breaker.
// Para una plataforma con baja concurrencia (cron cada 15-30 min) es OK:
// cada cron golpea ~1-2 instancias.

const THRESHOLD = 3                  // 3 fallos consecutivos abre
const OPEN_DURATION_MS = 5 * 60_000  // abierto 5 min, luego half-open

let consecutiveFailures = 0
let openedAt: number | null = null

export function isCircuitOpen(): boolean {
  if (openedAt === null) return false
  const elapsed = Date.now() - openedAt
  if (elapsed >= OPEN_DURATION_MS) {
    // Half-open: permite el proximo intento. Si falla, vuelve a abrir.
    return false
  }
  return true
}

export function recordSuccess(): void {
  consecutiveFailures = 0
  openedAt = null
}

export function recordFailure(): void {
  consecutiveFailures++
  if (consecutiveFailures >= THRESHOLD) {
    openedAt = Date.now()
    console.warn(`[claude circuit-breaker] OPEN after ${consecutiveFailures} fails`)
  }
}

export function circuitStatus(): { open: boolean; failures: number; openedAt: number | null } {
  return { open: isCircuitOpen(), failures: consecutiveFailures, openedAt }
}
