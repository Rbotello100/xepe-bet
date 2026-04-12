'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { resolveMatch } from '@/features/admin/actions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import type { MatchWithTeams } from '@/lib/types'

interface MatchResolverProps {
  match: MatchWithTeams
}

export function MatchResolver({ match }: MatchResolverProps) {
  const [homeScore, setHomeScore] = useState('')
  const [awayScore, setAwayScore] = useState('')

  const [state, formAction, isPending] = useActionState(
    async () => {
      return resolveMatch(match.id, parseInt(homeScore), parseInt(awayScore))
    },
    null
  )

  return (
    <Card className="space-y-3">
      <p className="text-sm font-medium text-white">
        {match.home_team.flag} {match.home_team.name} vs {match.away_team.name} {match.away_team.flag}
      </p>

      <div className="flex items-center gap-3">
        <Input
          type="number"
          min="0"
          value={homeScore}
          onChange={e => setHomeScore(e.target.value)}
          placeholder="Local"
        />
        <span className="text-slate-500">-</span>
        <Input
          type="number"
          min="0"
          value={awayScore}
          onChange={e => setAwayScore(e.target.value)}
          placeholder="Visita"
        />
      </div>

      <form action={formAction}>
        <Button type="submit" variant="danger" disabled={isPending || !homeScore || !awayScore} className="w-full">
          {isPending ? 'Resolviendo...' : 'Resolver partido'}
        </Button>
      </form>

      {state?.error && <p className="text-xs text-red-400">{state.error}</p>}
      {state?.success && <p className="text-xs text-emerald-400">Partido resuelto</p>}
    </Card>
  )
}
