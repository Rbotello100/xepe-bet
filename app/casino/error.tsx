'use client'

import { SectionErrorBoundary } from '@/components/error/SectionErrorBoundary'

export default function CasinoError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SectionErrorBoundary
      section="casino"
      error={error}
      reset={reset}
      title="El casino se cayo"
    />
  )
}
