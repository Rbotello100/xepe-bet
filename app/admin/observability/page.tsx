import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { createServerClient } from '@/lib/supabase/server'
import {
  getAlerts,
  getOpsMetrics,
  getFinancialMetrics,
  getCronStatus,
  getCostMetrics,
  getSecurityMetrics,
  getErrorMetrics,
} from '@/features/admin/observability/queries'

const ADMIN_EMAILS = ['rodrigo.botello@xepelin.com']

// Revalidate cada 30s — el panel siempre muestra datos relativamente frescos
// sin saturar la DB con re-renders. Pulsar F5 fuerza fresh.
export const revalidate = 30

function fmt(n: number) {
  return n.toLocaleString('es-CL')
}
function dollars(n: number) {
  return '$' + fmt(Math.round(n))
}
function ago(d: string | null) {
  if (!d) return '—'
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60000)
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ${min % 60}min`
  return `${Math.floor(h / 24)}d`
}

export default async function ObservabilityPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  if (!ADMIN_EMAILS.includes(user.email ?? '')) {
    return (
      <>
        <Header user={null} />
        <div className="mx-auto max-w-2xl px-4 py-6">
          <Card className="text-center py-8 space-y-2">
            <p className="text-3xl">🔒</p>
            <p className="text-white font-medium">Acceso restringido</p>
          </Card>
        </div>
      </>
    )
  }

  const [alerts, ops, fin, crons, costs, sec, errs] = await Promise.all([
    getAlerts(),
    getOpsMetrics(),
    getFinancialMetrics(),
    getCronStatus(),
    getCostMetrics(),
    getSecurityMetrics(),
    getErrorMetrics(),
  ])

  return (
    <>
      <Header user={null} active="/admin/observability" />
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-5">

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-strong">Observabilidad</h1>
          <span className="text-xs text-subtle">Auto-refresh c/30s · {new Date().toLocaleTimeString('es-CL')}</span>
        </div>

        {/* 1. ALERTS — solo si hay */}
        {alerts.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-danger">🚨 Alertas activas ({alerts.length})</h2>
            {alerts.map((a, i) => (
              <Card key={i} className={`border-l-4 ${
                a.severity === 'critical' ? 'border-l-red-500 bg-red-500/5'
                : a.severity === 'high' ? 'border-l-orange-500 bg-orange-500/5'
                : 'border-l-yellow-500 bg-yellow-500/5'
              }`}>
                <p className="font-bold text-strong">{a.title}{a.count != null && ` (${a.count})`}</p>
                <p className="text-sm text-muted">{a.detail}</p>
              </Card>
            ))}
          </section>
        )}

        {alerts.length === 0 && (
          <Card className="border-l-4 border-l-win bg-win/5">
            <p className="font-bold text-win">✓ Sistema sin alertas</p>
            <p className="text-sm text-muted">Todos los checks de integridad pasaron.</p>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* 2. OPS METRICS */}
          <Card>
            <h3 className="text-sm font-bold text-strong mb-3">📊 Actividad</h3>
            <dl className="space-y-1.5 text-sm">
              <Row label="Users totales" value={fmt(ops.totalUsers)} />
              <Row label="Activos 24h" value={fmt(ops.activeUsers24h)} highlight={ops.activeUsers24h > 0} />
              <Row label="Bets totales" value={fmt(ops.totalBets)} />
              <Row label="Bets pending" value={fmt(ops.betsPending)} />
              <Row label="Bets hoy" value={fmt(ops.betsHoy)} />
              <Row label="Parlays totales" value={fmt(ops.totalParlays)} />
              <Row label="Predicciones 24h" value={fmt(ops.predictions24h)} />
              <Row label="Trivia 24h" value={fmt(ops.trivia24h)} />
              <Row label="Casino sesiones 24h" value={fmt(ops.casinoSessions24h)} />
            </dl>
          </Card>

          {/* 3. FINANCIAL */}
          <Card>
            <h3 className="text-sm font-bold text-strong mb-3">💰 Auditoría financiera</h3>
            <dl className="space-y-1.5 text-sm">
              <Row label="Créditos en circulación" value={dollars(fin.totalCreditsCirculation)} />
              <Row label="Ledger total" value={dollars(fin.totalLedger)} />
              <Row label="Diff balance vs ledger" value={dollars(fin.diff)} highlight={Math.abs(fin.diff) > 0.5} danger={Math.abs(fin.diff) > 0.5} />
            </dl>
            <div className="mt-4">
              <p className="text-xs uppercase text-subtle mb-1.5">Transactions 24h por tipo</p>
              <ul className="space-y-0.5 text-xs">
                {fin.txByType.slice(0, 8).map(t => (
                  <li key={t.type} className="flex justify-between text-muted">
                    <span>{t.type} ({t.count})</span>
                    <span className={`font-mono ${t.total > 0 ? 'text-win' : 'text-danger'}`}>{t.total > 0 ? '+' : ''}{fmt(Math.round(t.total))}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          {/* 4. CRONS */}
          <Card>
            <h3 className="text-sm font-bold text-strong mb-3">⚡ Crons</h3>
            <ul className="space-y-2 text-sm">
              {crons.map(c => (
                <li key={c.name} className="flex justify-between items-center">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${c.healthy ? 'bg-win' : 'bg-danger'}`} />
                    <span className="text-foreground">{c.name}</span>
                  </span>
                  <span className="font-mono text-xs text-muted">{ago(c.lastRun)}</span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-subtle mt-2">Verde = última ejec dentro del rango esperado</p>
          </Card>

          {/* 5. COSTS */}
          <Card>
            <h3 className="text-sm font-bold text-strong mb-3">💵 Costos (30d)</h3>
            <dl className="space-y-1.5 text-sm">
              <Row label="Anthropic estimado" value={'~' + dollars(costs.anthropicEstimatedMonthly)} />
              <Row label="Mensajes IA generados" value={fmt(costs.aiMessagesMonth)} />
              <Row label="Mensajes templates" value={fmt(costs.templateMessagesMonth)} />
              <Row label="Odds API créditos usados" value={fmt(costs.oddsApiCreditsMonth)} />
              <Row label="Odds API restantes" value={costs.oddsApiRemaining != null ? fmt(costs.oddsApiRemaining) : '—'} />
            </dl>
          </Card>

          {/* 6. SECURITY */}
          <Card>
            <h3 className="text-sm font-bold text-strong mb-3">🔒 Seguridad</h3>
            <dl className="space-y-1.5 text-sm">
              <Row label="Sesiones abandonadas 24h" value={fmt(sec.abandonedSessions24h)} />
              <Row label="Refunds por abandono ($)" value={dollars(sec.refundsAbandoned24h)} />
              <Row label="Total refunds 24h ($)" value={dollars(sec.refundsTotal24h)} />
              <Row label="Signups hoy" value={fmt(sec.signupsHoy)} />
              <Row label="Throttle table rows" value={fmt(sec.throttleTableRows)} />
            </dl>
          </Card>

          {/* 7. WINNERS / LOSERS */}
          <Card>
            <h3 className="text-sm font-bold text-strong mb-3">🏆 Top movimientos 24h</h3>
            <p className="text-xs uppercase text-subtle mb-1.5">Ganadores</p>
            <ul className="space-y-0.5 text-xs mb-3">
              {fin.topWinners24h.length === 0 ? <li className="text-subtle">—</li> : fin.topWinners24h.map(w => (
                <li key={w.display_name} className="flex justify-between text-muted">
                  <span className="truncate max-w-[140px]">{w.display_name}</span>
                  <span className="font-mono text-win">+{fmt(w.net)}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs uppercase text-subtle mb-1.5">Perdedores</p>
            <ul className="space-y-0.5 text-xs">
              {fin.topLosers24h.length === 0 ? <li className="text-subtle">—</li> : fin.topLosers24h.map(l => (
                <li key={l.display_name} className="flex justify-between text-muted">
                  <span className="truncate max-w-[140px]">{l.display_name}</span>
                  <span className="font-mono text-danger">{fmt(l.net)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* 8. ERROR LOG */}
        <Card>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-strong">🐛 Errores</h3>
            <div className="text-xs text-muted">
              <span>24h: <span className={errs.count24h > 0 ? 'text-danger font-bold' : 'text-win'}>{errs.count24h}</span></span>
              {errs.countCritical24h > 0 && <span className="ml-3">Críticos: <span className="text-danger font-bold">{errs.countCritical24h}</span></span>}
            </div>
          </div>
          {errs.bySource24h.length > 0 && (
            <div className="mb-3">
              <p className="text-xs uppercase text-subtle mb-1">Por fuente 24h</p>
              <ul className="space-y-0.5 text-xs">
                {errs.bySource24h.map(s => (
                  <li key={s.source} className="flex justify-between text-muted">
                    <span className="font-mono">{s.source}</span>
                    <span className="font-mono">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {errs.recent.length === 0 ? (
            <p className="text-xs text-subtle">Sin errores recientes ✓</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-subtle uppercase text-[10px]">
                    <th className="text-left py-1">Cuándo</th>
                    <th className="text-left py-1">Nivel</th>
                    <th className="text-left py-1">Fuente</th>
                    <th className="text-left py-1">Mensaje</th>
                  </tr>
                </thead>
                <tbody>
                  {errs.recent.map(e => (
                    <tr key={e.id} className="border-t border-card-border">
                      <td className="py-1.5 text-muted font-mono">{ago(e.created_at)}</td>
                      <td className="py-1.5"><span className={
                        e.level === 'critical' ? 'text-danger font-bold' :
                        e.level === 'error' ? 'text-orange-400' : 'text-yellow-400'
                      }>{e.level}</span></td>
                      <td className="py-1.5 text-accent-deep font-mono">{e.source}</td>
                      <td className="py-1.5 text-muted truncate max-w-[400px]">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

      </div>
    </>
  )
}

function Row({ label, value, highlight, danger }: { label: string; value: string; highlight?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-mono ${danger ? 'text-danger font-bold' : highlight ? 'text-strong font-bold' : 'text-foreground'}`}>{value}</dd>
    </div>
  )
}
