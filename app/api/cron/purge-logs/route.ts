import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronAuth } from '@/lib/auth/cron'
import { logError } from '@/lib/log/error'

export const maxDuration = 30

/**
 * Cron semanal que dispara la RPC `purge_old_logs()` para borrar:
 *  - error_log mas viejo que 30 dias
 *  - activity_feed mas viejo que 90 dias
 *
 * Llamado por .github/workflows/log-purge-cron.yml con Bearer CRON_SECRET.
 *
 * No es bloqueante: si falla, la app sigue funcionando, solo que las tablas
 * crecen 1 semana extra. El proximo run lo recupera (cleanup es idempotente).
 */
async function handler(request: Request) {
  const unauthorized = verifyCronAuth(request)
  if (unauthorized) return unauthorized

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('purge_old_logs')

  if (error) {
    await logError('cron.purgeLogs', error, {}, 'error')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const result = data?.[0] ?? { errors_purged: 0, activity_purged: 0 }
  return NextResponse.json({
    errors_purged: Number(result.errors_purged ?? 0),
    activity_purged: Number(result.activity_purged ?? 0),
  })
}

export const GET = handler
export const POST = handler
