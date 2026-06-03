'use client'

import { SectionErrorBoundary } from '@/components/error/SectionErrorBoundary'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SectionErrorBoundary
      section="dashboard"
      error={error}
      reset={reset}
      title="No pudimos cargar el dashboard"
    />
  )
}
