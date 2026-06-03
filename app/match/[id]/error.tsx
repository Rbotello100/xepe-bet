'use client'

import { SectionErrorBoundary } from '@/components/error/SectionErrorBoundary'

export default function MatchError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SectionErrorBoundary
      section="match"
      error={error}
      reset={reset}
      title="No pudimos cargar el partido"
    />
  )
}
