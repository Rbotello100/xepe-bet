'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { logClientError } from '@/lib/log/client-error-action'

/**
 * Fallback que renderizan los `error.tsx` por seccion (App Router de Next.js).
 *
 * Diseno:
 * - Loguea al `error_log` automaticamente al montar (fire-and-forget).
 *   El digest de Next.js permite cruzar este error con el de server logs.
 * - Mantiene el shell de la app (los error.tsx por seccion preservan layout).
 * - Da 2 acciones: reset (re-render del segmento) + volver al home.
 * - Mensaje al user es generico — no exponemos stacks ni internals.
 *
 * Los `error.tsx` que lo usan le pasan `section` para que el log identifique
 * donde rompio (casino, bets, match, etc.).
 */
interface Props {
  section: string
  error: Error & { digest?: string }
  reset: () => void
  title?: string
}

export function SectionErrorBoundary({ section, error, reset, title }: Props) {
  useEffect(() => {
    void logClientError({
      section,
      message: error.message || 'unknown_client_error',
      digest: error.digest,
      stack: error.stack,
      pathname: typeof window !== 'undefined' ? window.location.pathname : undefined,
    })
  }, [section, error])

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <Card className="text-center space-y-4">
        <p className="text-3xl">😵</p>
        <h2 className="text-lg font-bold text-white">
          {title ?? 'Algo se rompio aca'}
        </h2>
        <p className="text-sm text-slate-400">
          Ya registramos el error. Probá de nuevo, y si sigue fallando volvé al inicio.
        </p>
        {error.digest && (
          <p className="text-[10px] text-slate-600 font-mono">ref: {error.digest}</p>
        )}
        <div className="flex gap-2 pt-2">
          <Button onClick={reset} className="flex-1">Reintentar</Button>
          <Button
            variant="outline"
            onClick={() => { window.location.href = '/' }}
            className="flex-1"
          >
            Ir al inicio
          </Button>
        </div>
      </Card>
    </div>
  )
}
