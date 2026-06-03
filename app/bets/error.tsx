'use client'

import { SectionErrorBoundary } from '@/components/error/SectionErrorBoundary'

export default function BetsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SectionErrorBoundary
      section="bets"
      error={error}
      reset={reset}
      title="No pudimos cargar las apuestas"
    />
  )
}
