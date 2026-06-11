import { createAdminClient } from '@/lib/supabase/admin'

// =====================================================================
// Queries para el panel de observabilidad (/admin/observability)
// =====================================================================
//
// Reemplaza tools externas tipo Sentry/Datadog con queries directas a la
// DB. Suficiente para uso interno hasta 1k users — para mas, considerar
// agregar Sentry encima.

export interface AlertItem {
  severity: 'critical' | 'high' | 'medium'
  title: string
  detail: string
  count?: number
}

// ---------------------------------------------------------------------
// 1. ALERTAS (solo aparecen si hay issues — deberian estar vacias en
// estado normal). Cada alerta es accionable.
// ---------------------------------------------------------------------
export async function getAlerts(): Promise<AlertItem[]> {
  const admin = createAdminClient()
  const alerts: AlertItem[] = []

  // a) Diff balance vs ledger (signup tx existe → debe ser 0 por user)
  // LIMIT explicito alto: el default Supabase es 1000 rows. Con +300 users
  // jugando, credit_transactions crece rapido y sin limit las tx mas recientes
  // se truncan → falso descuadre. Mismo patron que seed-extra-markets.mjs.
  const { data: profilesAll } = await admin.from('profiles').select('id, credits').limit(10000)
  const { data: txAll } = await admin.from('credit_transactions').select('user_id, amount').limit(500000)

  const ledgerByUser = new Map<string, number>()
  for (const t of txAll ?? []) {
    ledgerByUser.set(t.user_id, (ledgerByUser.get(t.user_id) ?? 0) + Number(t.amount))
  }
  let descuadrados = 0
  let diffTotal = 0
  for (const p of profilesAll ?? []) {
    const ledger = ledgerByUser.get(p.id) ?? 0
    const diff = Number(p.credits) - ledger
    if (Math.abs(diff) > 0.01) {
      descuadrados++
      diffTotal += diff
    }
  }
  if (descuadrados > 0) {
    alerts.push({
      severity: 'critical',
      title: 'Descuadre balance vs ledger',
      detail: `${descuadrados} user(s) con diff > $0.01. Total diff: $${diffTotal.toFixed(2)}`,
      count: descuadrados,
    })
  }

  // b) Bets pending en matches finished (settlement no corrió)
  const { data: betsHuerfanas } = await admin
    .from('bets')
    .select('id, match:matches!match_id(status)')
    .eq('status', 'pending')
  const huerfanasBets = (betsHuerfanas ?? []).filter((b) => {
    const m = b.match as unknown as { status: string } | { status: string }[] | null
    const status = Array.isArray(m) ? m[0]?.status : m?.status
    return status === 'finished'
  }).length
  if (huerfanasBets > 0) {
    alerts.push({
      severity: 'critical',
      title: 'Bets pending con match finished',
      detail: `${huerfanasBets} bet(s) sin resolver. Disparar /api/cron/sync-scores manualmente o resolveMatch admin.`,
      count: huerfanasBets,
    })
  }

  // c) Predictions sin resolver con match finished
  const { data: predsHuerfanas } = await admin
    .from('predictions')
    .select('id, match:matches!match_id(status)')
    .is('is_correct', null)
  const huerfanasPreds = (predsHuerfanas ?? []).filter((p) => {
    const m = p.match as unknown as { status: string } | { status: string }[] | null
    const status = Array.isArray(m) ? m[0]?.status : m?.status
    return status === 'finished'
  }).length
  if (huerfanasPreds > 0) {
    alerts.push({
      severity: 'high',
      title: 'Predicciones sin resolver',
      detail: `${huerfanasPreds} predicciones con match finished sin liquidar.`,
      count: huerfanasPreds,
    })
  }

  // d) Sesiones casino active hace > 1h (huérfanas — user abandonó sin trigger refund)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const [{ count: minesOrf }, { count: penaltyOrf }] = await Promise.all([
    admin.from('mines_sessions').select('id', { count: 'exact', head: true })
      .eq('status', 'active').lt('created_at', oneHourAgo),
    admin.from('penalty_sessions').select('id', { count: 'exact', head: true })
      .eq('status', 'active').lt('created_at', oneHourAgo),
  ])
  const totalOrf = (minesOrf ?? 0) + (penaltyOrf ?? 0)
  if (totalOrf > 0) {
    alerts.push({
      severity: 'medium',
      title: 'Sesiones casino activas huérfanas',
      detail: `${minesOrf ?? 0} mines + ${penaltyOrf ?? 0} penalty activas hace +1h sin cerrar.`,
      count: totalOrf,
    })
  }

  // e) Cron sin actividad: si el ultimo ai_feed AI tiene > 1h, el cron de IA
  // probablemente fallo. Templates cron NO escribe a ai_feed con source='ai',
  // asi que esto solo checkea el cron Anthropic.
  const { data: lastAiFeed } = await admin
    .from('ai_feed')
    .select('created_at')
    .filter('metadata->>source', 'eq', 'ai')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastAiFeed) {
    const ageMs = Date.now() - new Date(lastAiFeed.created_at).getTime()
    const ageMin = Math.round(ageMs / 60000)
    // El cron corre cada 30 min — alerta si > 90 min sin update
    if (ageMin > 90) {
      alerts.push({
        severity: 'high',
        title: 'Relator (IA) sin generar feed',
        detail: `Ultimo mensaje IA hace ${ageMin} min. Revisar workflow relator-cron o Anthropic API.`,
      })
    }
  }

  // f) Sync scores cron: si la ultima usage de /scores tiene > 6h y hay
  // matches con score_sync_attempts > 0, hay problema.
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  const { count: scoreSyncRecent } = await admin
    .from('odds_api_usage')
    .select('id', { count: 'exact', head: true })
    .eq('endpoint', 'scores')
    .gte('created_at', sixHoursAgo)
  if ((scoreSyncRecent ?? 0) === 0) {
    const { count: anyScoreSync } = await admin
      .from('odds_api_usage')
      .select('id', { count: 'exact', head: true })
      .eq('endpoint', 'scores')
    if ((anyScoreSync ?? 0) > 0) {
      alerts.push({
        severity: 'medium',
        title: 'Sync scores cron sin actividad reciente',
        detail: 'Ninguna llamada a /scores en las ultimas 6h. Revisar workflow sync-scores-cron.',
      })
    }
  }

  return alerts
}

// ---------------------------------------------------------------------
// 2. METRICAS OPERATIVAS
// ---------------------------------------------------------------------
export interface OpsMetrics {
  totalUsers: number
  activeUsers24h: number
  totalBets: number
  betsPending: number
  betsHoy: number
  totalParlays: number
  predictions24h: number
  trivia24h: number
  casinoSessions24h: number
}

export async function getOpsMetrics(): Promise<OpsMetrics> {
  const admin = createAdminClient()
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [
    { count: totalUsers },
    { count: totalBets },
    { count: betsPending },
    { count: betsHoy },
    { count: totalParlays },
    { count: predictions24h },
    { count: trivia24h },
    { count: casinoSessions24h },
    { data: activeBetsUsers },
    { data: activeCasinoUsers },
  ] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    admin.from('bets').select('id', { count: 'exact', head: true }),
    admin.from('bets').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('bets').select('id', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
    admin.from('parlays').select('id', { count: 'exact', head: true }),
    admin.from('predictions').select('id', { count: 'exact', head: true }).gte('created_at', dayAgo),
    admin.from('trivia_sessions').select('id', { count: 'exact', head: true }).gte('created_at', dayAgo),
    admin.from('casino_sessions').select('id', { count: 'exact', head: true }).gte('created_at', dayAgo),
    admin.from('bets').select('user_id').gte('created_at', dayAgo).limit(50000),
    admin.from('casino_sessions').select('user_id').gte('created_at', dayAgo).limit(50000),
  ])

  const activeSet = new Set<string>()
  for (const r of activeBetsUsers ?? []) activeSet.add(r.user_id)
  for (const r of activeCasinoUsers ?? []) activeSet.add(r.user_id)

  return {
    totalUsers: totalUsers ?? 0,
    activeUsers24h: activeSet.size,
    totalBets: totalBets ?? 0,
    betsPending: betsPending ?? 0,
    betsHoy: betsHoy ?? 0,
    totalParlays: totalParlays ?? 0,
    predictions24h: predictions24h ?? 0,
    trivia24h: trivia24h ?? 0,
    casinoSessions24h: casinoSessions24h ?? 0,
  }
}

// ---------------------------------------------------------------------
// 3. AUDITORIA FINANCIERA
// ---------------------------------------------------------------------
export interface FinancialMetrics {
  totalCreditsCirculation: number
  totalLedger: number
  diff: number
  txByType: { type: string; count: number; total: number }[]
  topWinners24h: { display_name: string; net: number }[]
  topLosers24h: { display_name: string; net: number }[]
}

export async function getFinancialMetrics(): Promise<FinancialMetrics> {
  const admin = createAdminClient()
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [{ data: profiles }, { data: allTx }, { data: tx24h }] = await Promise.all([
    admin.from('profiles').select('credits').limit(10000),
    // LIMIT alto: default Supabase 1000 trunca y rompe el sum del ledger.
    admin.from('credit_transactions').select('amount').limit(500000),
    admin.from('credit_transactions').select('user_id, type, amount, profile:profiles!user_id(display_name)').gte('created_at', dayAgo).limit(50000),
  ])

  const totalCredits = (profiles ?? []).reduce((acc, p) => acc + Number(p.credits ?? 0), 0)
  const totalLedger = (allTx ?? []).reduce((acc, t) => acc + Number(t.amount ?? 0), 0)

  // Agregar transactions 24h por type
  const byType = new Map<string, { count: number; total: number }>()
  for (const t of tx24h ?? []) {
    const cur = byType.get(t.type) ?? { count: 0, total: 0 }
    cur.count++
    cur.total += Number(t.amount)
    byType.set(t.type, cur)
  }
  const txByType = [...byType.entries()]
    .map(([type, v]) => ({ type, ...v }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))

  // Net per user 24h
  type ProfileJoined = { display_name: string } | { display_name: string }[] | null
  const netByUser = new Map<string, { name: string; net: number }>()
  for (const t of tx24h ?? []) {
    const profRaw = t.profile as unknown as ProfileJoined
    const prof = Array.isArray(profRaw) ? profRaw[0] : profRaw
    const name = prof?.display_name ?? '?'
    const cur = netByUser.get(t.user_id) ?? { name, net: 0 }
    cur.net += Number(t.amount)
    netByUser.set(t.user_id, cur)
  }
  const sorted = [...netByUser.values()].sort((a, b) => b.net - a.net)
  const topWinners24h = sorted.filter(u => u.net > 0).slice(0, 5).map(u => ({ display_name: u.name, net: Math.round(u.net) }))
  const topLosers24h = [...sorted].reverse().filter(u => u.net < 0).slice(0, 5).map(u => ({ display_name: u.name, net: Math.round(u.net) }))

  return {
    totalCreditsCirculation: Math.round(totalCredits),
    totalLedger: Math.round(totalLedger),
    diff: Math.round((totalCredits - totalLedger) * 100) / 100,
    txByType,
    topWinners24h,
    topLosers24h,
  }
}

// ---------------------------------------------------------------------
// 4. CRONS / SISTEMA
// ---------------------------------------------------------------------
export interface CronStatus {
  name: string
  lastRun: string | null
  ageMin: number | null
  expectedFreqMin: number
  healthy: boolean
}

export async function getCronStatus(): Promise<CronStatus[]> {
  const admin = createAdminClient()

  const [aiLastRes, templateLastRes, scoresLastRes, oddsLastRes] = await Promise.all([
    admin.from('ai_feed').select('created_at')
      .filter('metadata->>source', 'eq', 'ai')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('ai_feed').select('created_at')
      .filter('metadata->>source', 'eq', 'template')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('odds_api_usage').select('created_at')
      .eq('endpoint', 'scores')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('odds_api_usage').select('created_at')
      .eq('endpoint', 'odds')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  function age(t: string | null | undefined): number | null {
    if (!t) return null
    return Math.round((Date.now() - new Date(t).getTime()) / 60000)
  }

  const aiAge = age(aiLastRes.data?.created_at)
  const tplAge = age(templateLastRes.data?.created_at)
  const scoresAge = age(scoresLastRes.data?.created_at)
  const oddsAge = age(oddsLastRes.data?.created_at)

  return [
    { name: 'Relator (IA)', lastRun: aiLastRes.data?.created_at ?? null, ageMin: aiAge, expectedFreqMin: 30, healthy: aiAge !== null && aiAge < 90 },
    { name: 'Relator (templates)', lastRun: templateLastRes.data?.created_at ?? null, ageMin: tplAge, expectedFreqMin: 15, healthy: tplAge !== null && tplAge < 45 },
    { name: 'Sync scores', lastRun: scoresLastRes.data?.created_at ?? null, ageMin: scoresAge, expectedFreqMin: 240, healthy: scoresAge === null || scoresAge < 480 },
    { name: 'Sync odds', lastRun: oddsLastRes.data?.created_at ?? null, ageMin: oddsAge, expectedFreqMin: 1440, healthy: oddsAge === null || oddsAge < 2880 },
  ]
}

// ---------------------------------------------------------------------
// 5. COSTOS
// ---------------------------------------------------------------------
export interface CostMetrics {
  anthropicEstimatedMonthly: number   // USD
  oddsApiCreditsMonth: number
  oddsApiRemaining: number | null
  aiMessagesMonth: number
  templateMessagesMonth: number
}

export async function getCostMetrics(): Promise<CostMetrics> {
  const admin = createAdminClient()
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [aiCount, tplCount, usageRes, lastUsageRes] = await Promise.all([
    admin.from('ai_feed').select('id', { count: 'exact', head: true })
      .filter('metadata->>source', 'eq', 'ai').gte('created_at', monthAgo),
    admin.from('ai_feed').select('id', { count: 'exact', head: true })
      .filter('metadata->>source', 'eq', 'template').gte('created_at', monthAgo),
    admin.from('odds_api_usage').select('credits_used').gte('created_at', monthAgo),
    admin.from('odds_api_usage').select('remaining').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const aiMsgs = aiCount.count ?? 0
  const tplMsgs = tplCount.count ?? 0
  const oddsUsage = usageRes.data
  const lastUsageRow = lastUsageRes.data as { remaining: number | null } | null

  // Estimacion Anthropic: cada mensaje IA ~600 tokens output + ~2k input.
  // Haiku 4.5: $1/MTok input, $5/MTok output. Por mensaje: ~$0.005.
  // Cada llamada al cron genera ~6 mensajes pero usa 1 call (input 2k, output 1.5k) → $0.01
  // Hooks on-event (placeBet/cashout): cada uno es 1 call con 1 mensaje → $0.005
  // Conservador: total messages_ai × $0.005
  const anthropicEstimate = aiMsgs * 0.005

  const oddsCreditsMonth = (oddsUsage ?? []).reduce((acc, r) => acc + (r.credits_used ?? 0), 0)

  return {
    anthropicEstimatedMonthly: Math.round(anthropicEstimate * 100) / 100,
    oddsApiCreditsMonth: oddsCreditsMonth,
    oddsApiRemaining: lastUsageRow?.remaining ?? null,
    aiMessagesMonth: aiMsgs,
    templateMessagesMonth: tplMsgs,
  }
}

// ---------------------------------------------------------------------
// 6. SEGURIDAD
// ---------------------------------------------------------------------
export interface SecurityMetrics {
  abandonedSessions24h: number
  refundsAbandoned24h: number
  refundsTotal24h: number
  signupsHoy: number
  throttleTableRows: number
}

export async function getSecurityMetrics(): Promise<SecurityMetrics> {
  const admin = createAdminClient()
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [
    { count: minesAbandoned },
    { count: penaltyAbandoned },
    { data: refundsAbandoned },
    { data: refundsAll },
    { count: signupsHoy },
    { count: throttleRows },
  ] = await Promise.all([
    admin.from('mines_sessions').select('id', { count: 'exact', head: true })
      .eq('status', 'abandoned').gte('created_at', dayAgo),
    admin.from('penalty_sessions').select('id', { count: 'exact', head: true })
      .eq('status', 'abandoned').gte('created_at', dayAgo),
    admin.from('credit_transactions').select('amount')
      .eq('type', 'refund').like('description', '%abandonado%').gte('created_at', dayAgo),
    admin.from('credit_transactions').select('amount')
      .eq('type', 'refund').gte('created_at', dayAgo),
    admin.from('credit_transactions').select('id', { count: 'exact', head: true })
      .eq('type', 'signup').gte('created_at', todayStart.toISOString()),
    admin.from('bet_throttle').select('user_id', { count: 'exact', head: true }),
  ])

  const refundAbsAbandoned = (refundsAbandoned ?? []).reduce((acc, r) => acc + Number(r.amount), 0)
  const refundAbsTotal = (refundsAll ?? []).reduce((acc, r) => acc + Number(r.amount), 0)

  return {
    abandonedSessions24h: (minesAbandoned ?? 0) + (penaltyAbandoned ?? 0),
    refundsAbandoned24h: Math.round(refundAbsAbandoned),
    refundsTotal24h: Math.round(refundAbsTotal),
    signupsHoy: signupsHoy ?? 0,
    throttleTableRows: throttleRows ?? 0,
  }
}

// ---------------------------------------------------------------------
// 7. ERRORES — tabla error_log alimentada por lib/log/error.ts
// ---------------------------------------------------------------------
export interface ErrorRow {
  id: string
  source: string
  level: 'warn' | 'error' | 'critical'
  message: string
  created_at: string
}

export interface ErrorMetrics {
  count24h: number
  countCritical24h: number
  bySource24h: { source: string; count: number }[]
  recent: ErrorRow[]
}

export async function getErrorMetrics(): Promise<ErrorMetrics> {
  const admin = createAdminClient()
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [{ data: recent }, { data: all24h }, { count: countCritical }] = await Promise.all([
    admin.from('error_log')
      .select('id, source, level, message, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    admin.from('error_log').select('source').gte('created_at', dayAgo),
    admin.from('error_log').select('id', { count: 'exact', head: true })
      .eq('level', 'critical').gte('created_at', dayAgo),
  ])

  const bySource = new Map<string, number>()
  for (const r of all24h ?? []) {
    bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1)
  }

  return {
    count24h: all24h?.length ?? 0,
    countCritical24h: countCritical ?? 0,
    bySource24h: [...bySource.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    recent: (recent ?? []) as ErrorRow[],
  }
}
