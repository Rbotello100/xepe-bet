'use client'

import { SectionErrorBoundary } from '@/components/error/SectionErrorBoundary'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SectionErrorBoundary
      section="admin"
      error={error}
      reset={reset}
      title="Error en panel admin"
    />
  )
}
