'use client'

import { SectionErrorBoundary } from '@/components/error/SectionErrorBoundary'

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SectionErrorBoundary
      section="login"
      error={error}
      reset={reset}
      title="No pudimos cargar el login"
    />
  )
}
