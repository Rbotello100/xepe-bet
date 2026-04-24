import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { createServerClient } from '@/lib/supabase/server'
import { MatchResolver } from '@/features/admin/components/MatchResolver'
import { ScoringConfigForm } from '@/features/admin/components/ScoringConfig'
import { TriviaManager } from '@/features/admin/components/TriviaManager'
import { HealthCheckPanel } from '@/features/admin/components/HealthCheckPanel'
import { ApiUsagePanel } from '@/features/admin/components/ApiUsagePanel'
import { AdminTabs, type Tab } from '@/features/admin/components/AdminTabs'
import { getHealthChecks, getOddsApiUsage } from '@/features/admin/actions'
import type { MatchWithTeams, ScoringConfig } from '@/lib/types'

export default async function AdminPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/')

  const [matchesRes, scoringConfigRes, usersCount, betsCount, predictionsCount, parlaysCount, health, apiUsage] = await Promise.all([
    supabase
      .from('matches')
      .select('*, home_team:teams!home_team_id(*), away_team:teams!away_team_id(*)')
      .in('status', ['live', 'scheduled', 'open'])
      .order('starts_at')
      .limit(20),
    supabase.from('scoring_config').select('*').single(),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('bets').select('id', { count: 'exact', head: true }),
    supabase.from('predictions').select('id', { count: 'exact', head: true }),
    supabase.from('parlays').select('id', { count: 'exact', head: true }),
    getHealthChecks(),
    getOddsApiUsage(30),
  ])

  const matches = matchesRes.data ?? []
  const scoringConfig = scoringConfigRes.data
  const healthData = 'error' in health ? null : health
  const apiData = 'error' in apiUsage ? null : apiUsage

  const totalIssues = healthData
    ? healthData.orphan_parlays.length +
      healthData.legs_without_match.length +
      healthData.bets_pending_finished_match.length +
      healthData.matches_finished_no_score.length +
      healthData.bets_pending_old.length
    : 0

  const tabs: Tab[] = [
    {
      id: 'overview',
      label: 'Overview',
      content: (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Usuarios" value={usersCount.count ?? 0} />
            <Stat label="Predicciones" value={predictionsCount.count ?? 0} />
            <Stat label="Apuestas" value={betsCount.count ?? 0} />
            <Stat label="Parlays" value={parlaysCount.count ?? 0} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="Créditos Odds API"
              value={apiData?.last_remaining ?? '—'}
              tone={
                apiData?.last_remaining !== null && apiData?.last_remaining !== undefined && apiData.last_remaining < 50
                  ? 'danger'
                  : apiData?.last_remaining !== null && apiData?.last_remaining !== undefined && apiData.last_remaining < 150
                  ? 'warn'
                  : 'ok'
              }
            />
            <Stat label="Gastados hoy" value={apiData?.credits_today ?? 0} />
            <Stat
              label="Inconsistencias"
              value={totalIssues}
              tone={totalIssues === 0 ? 'ok' : 'warn'}
            />
          </div>
        </div>
      ),
    },
    {
      id: 'health',
      label: 'Health Check',
      badge: totalIssues,
      content: healthData ? (
        <HealthCheckPanel initial={healthData} />
      ) : (
        <p className="text-sm text-red-400">Error cargando health check</p>
      ),
    },
    {
      id: 'api',
      label: 'API Usage',
      content: apiData ? (
        <ApiUsagePanel initial={apiData} />
      ) : (
        <p className="text-sm text-red-400">Error cargando uso de API</p>
      ),
    },
    {
      id: 'resolve',
      label: 'Resolver Partidos',
      badge: matches.length,
      content: (
        <div className="space-y-3">
          {matches.length === 0 ? (
            <p className="text-sm text-slate-500">No hay partidos pendientes</p>
          ) : (
            matches.map(match => (
              <MatchResolver key={match.id} match={match as unknown as MatchWithTeams} />
            ))
          )}
        </div>
      ),
    },
    {
      id: 'config',
      label: 'Config',
      content: (
        <div className="space-y-6">
          <div>
            <h2 className="mb-3 text-lg font-semibold text-white">Puntos</h2>
            {scoringConfig && <ScoringConfigForm config={scoringConfig as unknown as ScoringConfig} />}
          </div>
          <div>
            <h2 className="mb-3 text-lg font-semibold text-white">Trivia</h2>
            <TriviaManager />
          </div>
        </div>
      ),
    },
  ]

  return (
    <>
      <Header user={null} />
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-white">Panel Admin</h1>
        <AdminTabs tabs={tabs} defaultTab="overview" />
      </div>
    </>
  )
}

type Tone = 'ok' | 'warn' | 'danger' | 'neutral'

function Stat({ label, value, tone = 'neutral' }: { label: string; value: number | string; tone?: Tone }) {
  const colors: Record<Tone, string> = {
    ok: 'text-[var(--casino-teal)]',
    warn: 'text-amber-400',
    danger: 'text-red-400',
    neutral: 'text-white',
  }
  return (
    <Card className="text-center">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-xl font-bold ${colors[tone]}`}>{value}</p>
    </Card>
  )
}
