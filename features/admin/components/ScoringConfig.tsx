'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { updateScoringConfig } from '@/features/admin/actions'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import type { ScoringConfig } from '@/lib/types'

interface ScoringConfigFormProps {
  config: ScoringConfig
}

export function ScoringConfigForm({ config }: ScoringConfigFormProps) {
  const [winner, setWinner] = useState(config.correct_winner_points.toString())
  const [exact, setExact] = useState(config.exact_score_points.toString())
  const [diff, setDiff] = useState(config.correct_goal_diff_points.toString())

  const [state, formAction, isPending] = useActionState(
    async () => {
      return updateScoringConfig({
        correct_winner_points: parseInt(winner),
        exact_score_points: parseInt(exact),
        correct_goal_diff_points: parseInt(diff),
      })
    },
    null
  )

  return (
    <Card className="space-y-3">
      <p className="text-sm font-medium text-white">Configurar Puntos</p>
      <Input label="Ganador correcto" type="number" value={winner} onChange={e => setWinner(e.target.value)} />
      <Input label="Marcador exacto" type="number" value={exact} onChange={e => setExact(e.target.value)} />
      <Input label="Diferencia de goles correcta" type="number" value={diff} onChange={e => setDiff(e.target.value)} />
      <form action={formAction}>
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? 'Guardando...' : 'Guardar configuracion'}
        </Button>
      </form>
      {state?.error && <p className="text-xs text-red-400">{state.error}</p>}
      {state?.success && <p className="text-xs text-[var(--casino-teal)]">Configuracion guardada</p>}
    </Card>
  )
}
