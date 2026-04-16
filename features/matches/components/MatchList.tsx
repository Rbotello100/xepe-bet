import { createServerClient } from '@/lib/supabase/server'
import { MatchCard } from './MatchCard'
import type { MatchWithTeams } from '@/lib/types'

export async function MatchList() {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('matches')
    .select('*, home_team:teams!home_team_id(*), away_team:teams!away_team_id(*)')
    .order('starts_at')

  if (error) {
    return (
      <div className="py-12 text-center text-red-400">
        <p>Error al cargar partidos</p>
        <p className="text-xs text-slate-500 mt-1">{error.message}</p>
      </div>
    )
  }

  const matches = (data ?? []) as unknown as MatchWithTeams[]

  if (matches.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500">
        <p className="text-lg">No hay partidos disponibles</p>
        <p className="text-sm mt-1">Los partidos apareceran cuando se sincronicen los datos</p>
      </div>
    )
  }

  // Group matches by group_name. 'X' is the demo group (Premier League),
  // rendered first with a special label. Mundial groups A-L come after.
  const allGroups = [...new Set(matches.map(m => m.group_name).filter(Boolean))] as string[]
  const demoGroups = allGroups.filter(g => g === 'X')
  const mundialGroups = allGroups.filter(g => g !== 'X').sort()
  const groups = [...demoGroups, ...mundialGroups]

  return (
    <div className="space-y-6">
      {groups.map(group => {
        const groupMatches = matches.filter(m => m.group_name === group)
        const isDemo = group === 'X'
        return (
          <div key={group}>
            <h2
              className={`text-sm font-semibold mb-2 uppercase tracking-wider ${
                isDemo ? 'text-[var(--casino-yellow)]' : 'text-slate-400'
              }`}
            >
              {isDemo ? '⚽ Premier League (Demo)' : `Grupo ${group}`}
            </h2>
            <div className="space-y-2">
              {groupMatches.map(match => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
