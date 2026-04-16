'use client'

import { useActionState } from 'react'
import { savePrediction } from '@/features/predictions/actions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import type { MatchWithTeams, Prediction } from '@/lib/types'
import { clsx } from 'clsx'
import { useState } from 'react'

interface PredictionFormProps {
  match: MatchWithTeams
  existingPrediction?: Prediction | null
  locked: boolean
}

type FormState = { success?: boolean; error?: string } | null

export function PredictionForm({ match, existingPrediction, locked }: PredictionFormProps) {
  const [selectedWinner, setSelectedWinner] = useState<'home' | 'draw' | 'away' | null>(
    existingPrediction?.predicted_winner ?? null
  )
  const [homeScore, setHomeScore] = useState(existingPrediction?.predicted_home_score?.toString() ?? '')
  const [awayScore, setAwayScore] = useState(existingPrediction?.predicted_away_score?.toString() ?? '')

  const [state, formAction, isPending] = useActionState(
    async (_prev: FormState) => {
      if (!selectedWinner) return { error: 'Selecciona un resultado' }
      const result = await savePrediction({
        match_id: match.id,
        predicted_winner: selectedWinner,
        predicted_home_score: homeScore ? parseInt(homeScore) : null,
        predicted_away_score: awayScore ? parseInt(awayScore) : null,
      })
      return result
    },
    null
  )

  if (locked) {
    return (
      <Card className="text-center text-slate-500 text-sm py-6">
        Predicciones cerradas para este partido
        {existingPrediction && (
          <p className="mt-2 text-[var(--casino-yellow)]">
            Tu prediccion: {existingPrediction.predicted_winner}
            {existingPrediction.predicted_home_score != null && (
              <> ({existingPrediction.predicted_home_score}-{existingPrediction.predicted_away_score})</>
            )}
          </p>
        )}
      </Card>
    )
  }

  return (
    <Card className="space-y-4">
      <p className="text-sm font-medium text-slate-300">Tu prediccion</p>

      <div className="flex gap-2">
        {(['home', 'draw', 'away'] as const).map(pick => (
          <button
            key={pick}
            type="button"
            onClick={() => setSelectedWinner(pick)}
            className={clsx(
              'flex-1 rounded-lg border px-3 py-3 text-center transition-all min-h-[44px]',
              selectedWinner === pick
                ? 'border-[var(--casino-red)] bg-[var(--casino-red)]/20 text-[var(--casino-yellow)]'
                : 'border-slate-600 bg-slate-700/50 text-slate-400 hover:border-slate-500'
            )}
          >
            <span className="block text-xs">
              {pick === 'home' ? match.home_team.name : pick === 'away' ? match.away_team.name : 'Empate'}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Input
          label="Goles local"
          type="number"
          min="0"
          max="20"
          value={homeScore}
          onChange={e => setHomeScore(e.target.value)}
          placeholder="0"
        />
        <span className="text-slate-500 mt-5">-</span>
        <Input
          label="Goles visita"
          type="number"
          min="0"
          max="20"
          value={awayScore}
          onChange={e => setAwayScore(e.target.value)}
          placeholder="0"
        />
      </div>

      <form action={formAction}>
        <Button type="submit" disabled={isPending || !selectedWinner} className="w-full">
          {isPending ? 'Guardando...' : existingPrediction ? 'Actualizar prediccion' : 'Guardar prediccion'}
        </Button>
      </form>

      {state && 'error' in state && state.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state && 'success' in state && state.success && <p className="text-sm text-[var(--casino-teal)]">Prediccion guardada</p>}
    </Card>
  )
}
