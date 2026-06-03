'use server'

import { createServerClient } from '@/lib/supabase/server'
import { logError } from './error'

/**
 * Server Action que los error boundaries (client components) usan para
 * persistir el error en `error_log`. Los boundaries de Next.js corren en
 * el cliente, asi que no pueden importar logError directamente.
 *
 * Captura: userId si hay session, mensaje, digest (server-side hash de Next.js),
 * stack y la seccion afectada. Sin esto los crashes en React quedan invisibles
 * para el panel de observabilidad.
 */
export async function logClientError(params: {
  section: string
  message: string
  digest?: string
  stack?: string
  pathname?: string
}): Promise<void> {
  let userId: string | undefined
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id
  } catch {
    // Si no podemos leer la session no es bloqueante — logueamos igual.
  }

  await logError(
    `client.${params.section}`,
    params.message,
    {
      userId,
      digest: params.digest,
      stack: params.stack,
      pathname: params.pathname,
    },
    'error',
  )
}
