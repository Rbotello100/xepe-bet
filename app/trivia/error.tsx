'use client'

import { SectionErrorBoundary } from '@/components/error/SectionErrorBoundary'

export default function TriviaError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SectionErrorBoundary
      section="trivia"
      error={error}
      reset={reset}
      title="No pudimos cargar trivia"
    />
  )
}
