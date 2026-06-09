'use client'

import { SectionErrorBoundary } from '@/components/error/SectionErrorBoundary'

export default function FixtureError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SectionErrorBoundary
      section="fixture"
      error={error}
      reset={reset}
      title="No pudimos cargar el cuadro"
    />
  )
}
