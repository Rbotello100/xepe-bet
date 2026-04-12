import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { createServerClient } from '@/lib/supabase/server'
import { MatchResolver } from '@/features/admin/components/MatchResolver'
import { ScoringConfigForm } from '@/features/admin/components/ScoringConfig'
import { TriviaManager } from '@/features/admin/components/TriviaManager'
import { syncOddsManual } from '@/features/admin/actions'
import type { MatchWithTeams, ScoringConfig } from '@/lib/types'

export default async function AdminPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/')

  // Get live/recent matches to resolve
  const { data: matches } = await supabase
    .from('matches')
    .select('*, home_team:teams!home_team_id(*), away_team:teams!away_team_id(*)')
    .in('status', ['live', 'scheduled', 'open'])
    .order('starts_at')
    .limit(20)

  // Scoring config
  const { data: scoringConfig } = await supabase.from('scoring_config').select('*').single()

  // Stats
  const { count: totalUsers } = await supabase.from('profiles').select('id', { count: 'exact', head: true })
  const { count: totalBets } = await supabase.from('bets').select('id', { count: 'exact', head: true })
  const { count: totalPredictions } = await supabase.from('predictions').select('id', { count: 'exact', head: true })

  return (
    <>
      <Header user={null} />
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-white">Panel Admin</h1>

        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center">
            <p className="text-xs text-slate-400">Usuarios</p>
            <p className="text-xl font-bold text-white">{totalUsers ?? 0}</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs text-slate-400">Predicciones</p>
            <p className="text-xl font-bold text-white">{totalPredictions ?? 0}</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs text-slate-400">Apuestas</p>
            <p className="text-xl font-bold text-white">{totalBets ?? 0}</p>
          </Card>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Sync Odds</h2>
          <form action={async () => { 'use server'; await syncOddsManual() }}>
            <Button type="submit" variant="secondary">Sincronizar odds ahora</Button>
          </form>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Resolver Partidos</h2>
          <div className="space-y-3">
            {(matches ?? []).map(match => (
              <MatchResolver key={match.id} match={match as unknown as MatchWithTeams} />
            ))}
            {(!matches || matches.length === 0) && (
              <p className="text-sm text-slate-500">No hay partidos pendientes</p>
            )}
          </div>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Configuracion de Puntos</h2>
          {scoringConfig && <ScoringConfigForm config={scoringConfig as unknown as ScoringConfig} />}
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Trivia</h2>
          <TriviaManager />
        </div>
      </div>
    </>
  )
}
