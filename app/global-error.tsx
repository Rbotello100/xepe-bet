'use client'

import { useEffect } from 'react'
import { logClientError } from '@/lib/log/client-error-action'

/**
 * Ultimo recurso de Next.js: corre cuando el root layout o un Server Component
 * del shell falla. Reemplaza completamente <html> y <body>, por eso no puede
 * usar el layout ni componentes que dependan de el (Header, providers, etc).
 *
 * Mantenemos solo HTML + estilos inline mínimos. El objetivo es que el user
 * vea ALGO (no pantalla blanca) y pueda reintentar o volver al inicio.
 *
 * Se loguea como `client.global-root` con severidad critical en error_log
 * — si esto se dispara, algo grande rompio.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    void logClientError({
      section: 'global-root',
      message: error.message || 'unknown_global_error',
      digest: error.digest,
      stack: error.stack,
      pathname: typeof window !== 'undefined' ? window.location.pathname : undefined,
    })
  }, [error])

  return (
    <html lang="es">
      <body style={{
        margin: 0,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
        padding: '1rem',
      }}>
        <div style={{
          maxWidth: '24rem',
          width: '100%',
          textAlign: 'center',
          padding: '2rem',
          borderRadius: '0.75rem',
          background: '#1e293b',
          border: '1px solid #334155',
        }}>
          <p style={{ fontSize: '2rem', margin: 0 }}>💥</p>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginTop: '1rem', marginBottom: '0.5rem' }}>
            Error critico
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: 0 }}>
            La app no pudo cargar. Ya se registró el error.
          </p>
          {error.digest && (
            <p style={{ fontSize: '0.625rem', color: '#475569', fontFamily: 'monospace', marginTop: '0.75rem' }}>
              ref: {error.digest}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button
              onClick={reset}
              style={{
                flex: 1,
                padding: '0.5rem 1rem',
                background: '#00e676',
                color: '#0f172a',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reintentar
            </button>
            <button
              onClick={() => { window.location.href = '/' }}
              style={{
                flex: 1,
                padding: '0.5rem 1rem',
                background: 'transparent',
                color: '#e2e8f0',
                border: '1px solid #475569',
                borderRadius: '0.5rem',
                cursor: 'pointer',
              }}
            >
              Ir al inicio
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
