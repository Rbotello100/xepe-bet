import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminTestPanel } from './AdminTestPanel'

// Only these emails can access the test panel
const ADMIN_EMAILS = ['rodrigo.botello@xepelin.com']

export default async function AdminTestPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Check if user email is in the admin list
  if (!ADMIN_EMAILS.includes(user.email ?? '')) {
    return (
      <>
        <Header user={null} />
        <div className="mx-auto max-w-2xl px-4 py-6">
          <Card className="text-center py-8 space-y-2">
            <p className="text-3xl">🔒</p>
            <p className="text-white font-medium">Acceso restringido</p>
            <p className="text-sm text-slate-400">Solo administradores designados pueden acceder</p>
            <p className="text-xs text-slate-600">{user.email}</p>
          </Card>
        </div>
      </>
    )
  }

  // Auto-assign admin role if not already
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profile && !profile.is_admin) {
    await admin.from('profiles').update({ is_admin: true }).eq('id', user.id)
  }

  // Get system stats
  const { count: totalTeams } = await admin.from('teams').select('id', { count: 'exact', head: true })
  const { count: totalMatches } = await admin.from('matches').select('id', { count: 'exact', head: true })
  const { count: totalUsers } = await admin.from('profiles').select('id', { count: 'exact', head: true })
  const { count: totalPredictions } = await admin.from('predictions').select('id', { count: 'exact', head: true })
  const { count: totalBets } = await admin.from('bets').select('id', { count: 'exact', head: true })
  const { count: totalTrivia } = await admin.from('trivia_questions').select('id', { count: 'exact', head: true })

  // Get matches with missing odds
  const { count: matchesNoOdds } = await admin
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .is('odds_home', null)

  return (
    <>
      <Header user={profile ? { ...profile, total_points: profile.total_points ?? 0 } : null} />
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Panel de Testing</h1>
          <p className="text-sm text-slate-400 mt-1">Admin: {user.email}</p>
        </div>

        {/* System stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center">
            <p className="text-xs text-slate-400">Equipos</p>
            <p className="text-xl font-bold text-white">{totalTeams ?? 0}</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs text-slate-400">Partidos</p>
            <p className="text-xl font-bold text-white">{totalMatches ?? 0}</p>
          </Card>
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
          <Card className="text-center">
            <p className="text-xs text-slate-400">Preguntas Trivia</p>
            <p className="text-xl font-bold text-white">{totalTrivia ?? 0}</p>
          </Card>
        </div>

        {/* Warnings */}
        {(matchesNoOdds ?? 0) > 0 && (
          <Card className="border-amber-500/50 bg-amber-500/10">
            <p className="text-sm text-amber-400">
              {matchesNoOdds} partidos sin odds -- usa "Sync Odds" para obtenerlos
            </p>
          </Card>
        )}

        <AdminTestPanel />
      </div>
    </>
  )
}
