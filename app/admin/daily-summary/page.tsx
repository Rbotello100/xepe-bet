import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { createServerClient } from '@/lib/supabase/server'
import { getRecentSummaries, buildDailySummary } from '@/features/admin/daily-summary/queries'
import { CopyButton } from '@/features/admin/daily-summary/CopyButton'

export const dynamic = 'force-dynamic'

export default async function DailySummaryPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('is_admin, display_name, avatar_url, credits').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/')

  const summaries = await getRecentSummaries(7)

  // Si la tabla esta vacia, generamos uno on-the-fly para ayer y otro para
  // hoy hasta ahora — asi el admin tiene algo que copiar incluso antes que
  // corra el cron por primera vez.
  let preview: { day: string; content: string } | null = null
  if (summaries.length === 0) {
    const yesterday = new Date()
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const s = await buildDailySummary(yesterday)
    preview = { day: yesterday.toISOString().slice(0, 10), content: s.content }
  }

  const todaySoFar = await buildDailySummary(new Date())

  return (
    <>
      <Header user={profile as any} />
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-strong">Resumen diario</h1>
          <p className="text-sm text-muted mt-1">
            El cron <code className="text-cyan">/api/cron/daily-summary</code> escribe aca cada manana
            (8 AM Chile) el resumen del dia anterior listo para enviar al grupo de Slack.
          </p>
        </div>

        {/* Hoy hasta ahora — siempre live */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-strong">Hoy hasta ahora (live)</h2>
            <CopyButton text={todaySoFar.content} />
          </div>
          <pre className="whitespace-pre-wrap rounded-md border border-card-border bg-sunken p-4 text-xs leading-relaxed text-foreground">
            {todaySoFar.content}
          </pre>
        </Card>

        {/* Preview cuando aun no hay summaries guardados */}
        {preview && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-strong">Ayer ({preview.day}) · preview en vivo</h2>
              <CopyButton text={preview.content} />
            </div>
            <pre className="whitespace-pre-wrap rounded-md border border-card-border bg-sunken p-4 text-xs leading-relaxed text-foreground">
              {preview.content}
            </pre>
          </Card>
        )}

        {/* Historial guardado */}
        {summaries.map(s => (
          <Card key={s.day}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-bold text-strong">{s.day}</h2>
                <p className="text-[10px] text-subtle">Guardado {new Date(s.created_at).toLocaleString('es-CL')}</p>
              </div>
              <CopyButton text={s.content} />
            </div>
            <pre className="whitespace-pre-wrap rounded-md border border-card-border bg-sunken p-4 text-xs leading-relaxed text-foreground">
              {s.content}
            </pre>
          </Card>
        ))}
      </div>
    </>
  )
}
