'use client'

import { SectionErrorBoundary } from '@/components/error/SectionErrorBoundary'

export default function PredictionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SectionErrorBoundary
      section="predictions"
      error={error}
      reset={reset}
      title="No pudimos cargar las predicciones"
    />
  )
}
