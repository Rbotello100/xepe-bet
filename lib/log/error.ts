'use server'

import { createAdminClient } from '@/lib/supabase/admin'

type Level = 'warn' | 'error' | 'critical'

/**
 * Loguea errores a `public.error_log`. Reemplaza Sentry para uso interno.
 *
 * Fire-and-forget: nunca throwea (catch interno). Si la insercion falla,
 * cae a console.error para que al menos quede en Vercel logs.
 *
 * Uso tipico desde un catch block:
 *
 *   try {
 *     await placeBet(...)
 *   } catch (err) {
 *     void logError('bets.placeBet', err, { user_id, bet_id })
 *     return { error: 'No se pudo procesar la apuesta' }
 *   }
 *
 * Source naming convention: <modulo>.<funcion> en lowerCamelCase.
 */
export async function logError(
  source: string,
  err: unknown,
  metadata?: Record<string, unknown>,
  level: Level = 'error',
): Promise<void> {
  try {
    const message = err instanceof Error
      ? `${err.name}: ${err.message}`
      : typeof err === 'string'
      ? err
      : JSON.stringify(err)

    // Truncar mensaje a 2000 chars (suficiente para stack trace recortado).
    const truncated = message.slice(0, 2000)
    const stack = err instanceof Error ? err.stack?.slice(0, 4000) : undefined

    const admin = createAdminClient()
    await admin.from('error_log').insert({
      source,
      level,
      message: truncated,
      metadata: {
        ...(metadata ?? {}),
        ...(stack ? { stack } : {}),
      },
    })
  } catch (loggingErr) {
    // Si fallar loguear, al menos console.error para Vercel logs.
    console.error('[logError fallback]', source, err, 'logging error:', loggingErr)
  }
}
