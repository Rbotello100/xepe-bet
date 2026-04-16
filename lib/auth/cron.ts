import { NextResponse } from 'next/server'

/**
 * Valida el header Authorization Bearer contra CRON_SECRET.
 * Devuelve null si OK, o NextResponse con 401 si falla.
 *
 * Uso en cualquier route handler:
 *   const unauthorized = verifyCronAuth(request)
 *   if (unauthorized) return unauthorized
 */
export function verifyCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET no configurado en el servidor' },
      { status: 500 }
    )
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  return null
}
