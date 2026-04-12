'use client'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <Card className="w-full max-w-sm text-center space-y-4">
        <p className="text-3xl">😵</p>
        <h2 className="text-lg font-bold text-white">Algo salio mal</h2>
        <p className="text-sm text-slate-400">{error.message || 'Error inesperado'}</p>
        <Button onClick={reset} className="w-full">Intentar de nuevo</Button>
      </Card>
    </div>
  )
}
