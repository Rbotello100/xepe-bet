'use client'

import { SectionErrorBoundary } from '@/components/error/SectionErrorBoundary'

export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SectionErrorBoundary
      section="onboarding"
      error={error}
      reset={reset}
      title="No pudimos cargar el onboarding"
    />
  )
}
