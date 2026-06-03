'use client'

import { SectionErrorBoundary } from '@/components/error/SectionErrorBoundary'

export default function ParlayError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SectionErrorBoundary
      section="parlay"
      error={error}
      reset={reset}
      title="No pudimos cargar el parlay"
    />
  )
}
