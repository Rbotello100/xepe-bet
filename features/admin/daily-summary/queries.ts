import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Agrega TODAS las metricas de un dia (00:00 Chile a 24:00 Chile) y devuelve
 * el mensaje formateado listo para copiar al Slack mas el metadata crudo.
 *
 * Chile = UTC-4 (en Mundial 2026 no aplica horario de verano).
 */
export interface DailySummary {
  content: string
  metadata: Record<string, unknown>
}

const CHILE_OFFSET_HOURS = 4

function chileDay(date: Date): { start: string; end: string; label: string } {
  // Inicio del dia Chile = el dia a las 00:00 CL = ese dia a las 04:00 UTC
  const utcStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), CHILE_OFFSET_HOURS, 0, 0, 0))
  const utcEnd = new Date(utcStart.getTime() + 24 * 60 * 60 * 1000)
  // label = YYYY-MM-DD del dia Chile (mismo numero que date.UTC porque
  // todavia es ese dia en Chile a las 4 UTC)
  return {
    start: utcStart.toISOString(),
    end: utcEnd.toISOString(),
    label: utcStart.toISOString().slice(0, 10),
  }
}

async function paginate<T>(query: () => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = []
  let offset = 0
  while (true) {
    const { data, error } = await query().range(offset, offset + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }
  return out
}

export async function buildDailySummary(targetDate: Date): Promise<DailySummary> {
  const admin = createAdminClient()
  const { start, end, label } = chileDay(targetDate)

  // ---- BETS ----
  const bets = await paginate<any>(() =>
    admin.from('bets').select('user_id, amount, status, potential_payout').gte('created_at', start).lt('created_at', end)
  )
  const wonBets = bets.filter(b => b.status === 'won').length
  const lostBets = bets.filter(b => b.status === 'lost').length
  const pendingBets = bets.filter(b => b.status === 'pending').length
  const betsVol = bets.reduce((s, b) => s + Number(b.amount || 0), 0)
  const betsPayouts = bets.filter(b => b.status === 'won').reduce((s, b) => s + Number(b.potential_payout || 0), 0)

  // ---- PARLAYS ----
  const parlays = await paginate<any>(() =>
    admin.from('parlays').select('user_id, amount, status, potential_payout').gte('created_at', start).lt('created_at', end)
  )
  const wonPar = parlays.filter(p => p.status === 'won').length
  const lostPar = parlays.filter(p => p.status === 'lost').length
  const parlaysVol = parlays.reduce((s, p) => s + Number(p.amount || 0), 0)
  const parlaysPayouts = parlays.filter(p => p.status === 'won').reduce((s, p) => s + Number(p.potential_payout || 0), 0)

  // ---- CASINO ----
  const cas = await paginate<any>(() =>
    admin.from('casino_sessions').select('user_id, game, bet_amount, win_amount, net_amount').gte('created_at', start).lt('created_at', end)
  )
  const byGame: Record<string, { count: number; bet: number; win: number; net: number }> = {}
  for (const g of ['slots', 'mines', 'penalty']) {
    const rows = cas.filter(c => c.game === g)
    byGame[g] = {
      count: rows.length,
      bet: rows.reduce((s, x) => s + Number(x.bet_amount || 0), 0),
      win: rows.reduce((s, x) => s + Number(x.win_amount || 0), 0),
      net: rows.reduce((s, x) => s + Number(x.net_amount || 0), 0),
    }
  }
  const casinoNet = cas.reduce((s, x) => s + Number(x.net_amount || 0), 0)

  // ---- TRIVIA ----
  const tri = await paginate<any>(() =>
    admin.from('trivia_sessions').select('user_id, correct_answers, total_questions').gte('completed_at', start).lt('completed_at', end)
  )
  const triPerfect = tri.filter(t => t.correct_answers === t.total_questions).length

  // ---- ACTIVE USERS ----
  const active = new Set<string>()
  for (const r of [...bets, ...parlays, ...cas, ...tri]) active.add(r.user_id)

  // ---- BIGGEST WINS ----
  const { data: bigBetData } = await admin
    .from('bets').select('user_id, potential_payout, amount').eq('status', 'won')
    .gte('created_at', start).lt('created_at', end)
    .order('potential_payout', { ascending: false }).limit(1)
  const { data: bigParData } = await admin
    .from('parlays').select('user_id, potential_payout, amount, total_odds').eq('status', 'won')
    .gte('created_at', start).lt('created_at', end)
    .order('potential_payout', { ascending: false }).limit(1)
  const { data: bigCasData } = await admin
    .from('casino_sessions').select('user_id, game, bet_amount, win_amount, net_amount')
    .gte('created_at', start).lt('created_at', end).gt('net_amount', 0)
    .order('net_amount', { ascending: false }).limit(1)

  // ---- BALANCES (estado actual, NO del dia) ----
  const [{ count: totalUsers }, { count: zeroUsers }, { count: lowUsers }] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('credits', 0),
    admin.from('profiles').select('id', { count: 'exact', head: true }).lt('credits', 1000),
  ])
  const pctLow = totalUsers ? ((lowUsers ?? 0) / totalUsers * 100).toFixed(1) : '0'

  // ---- LOOKUP NOMBRES ----
  const userIds = [bigBetData?.[0]?.user_id, bigParData?.[0]?.user_id, bigCasData?.[0]?.user_id].filter(Boolean) as string[]
  const { data: profsForBig } = userIds.length
    ? await admin.from('profiles').select('id, display_name').in('id', userIds)
    : { data: [] }
  const nameOf = (id: string | undefined) => profsForBig?.find(p => p.id === id)?.display_name ?? 'Anonimo'

  // ---- FORMAT ----
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`
  const dayLabel = label.split('-').reverse().slice(0, 2).join('-')  // DD-MM
  const lines: string[] = []
  lines.push(`🏆 *Xepe Bet — Resumen del dia ${dayLabel}*`)
  lines.push('')
  lines.push(`📊 *Participacion*`)
  lines.push(`• *${active.size} usuarios activos* (de ${totalUsers ?? 0} totales)`)
  lines.push(`• ${tri.length} sesiones de trivia · ${triPerfect} perfectas 🧠`)
  lines.push('')
  lines.push(`⚽ *Apuestas deportivas*`)
  lines.push(`• ${bets.length} singles · ${fmt(betsVol)} apostados · ${wonBets} ganadas / ${lostBets} perdidas / ${pendingBets} pendientes`)
  lines.push(`• ${parlays.length} parlays · ${fmt(parlaysVol)} apostados · ${wonPar} ganados / ${lostPar} perdidos`)
  lines.push(`• Pagado a winners: *${fmt(betsPayouts + parlaysPayouts)}*`)
  lines.push('')
  lines.push(`🎰 *Casino*`)
  lines.push(`• ${cas.length} jugadas — neto ${casinoNet >= 0 ? `+${fmt(casinoNet)} a la casa` : `${fmt(Math.abs(casinoNet))} a favor de los jugadores 🎉`}`)
  lines.push(`• Slots: ${byGame.slots.count} · neto ${byGame.slots.net >= 0 ? '+' : ''}${fmt(byGame.slots.net)}`)
  lines.push(`• Mines: ${byGame.mines.count} · neto ${byGame.mines.net >= 0 ? '+' : ''}${fmt(byGame.mines.net)}`)
  lines.push(`• Penales: ${byGame.penalty.count} · neto ${byGame.penalty.net >= 0 ? '+' : ''}${fmt(byGame.penalty.net)}`)
  lines.push('')

  const hasBig = bigBetData?.[0] || bigParData?.[0] || bigCasData?.[0]
  if (hasBig) {
    lines.push(`🔥 *Jugadas destacadas*`)
    if (bigBetData?.[0]) lines.push(`• 🎯 Mejor single: *${nameOf(bigBetData[0].user_id)}* — ${fmt(bigBetData[0].amount)} → ${fmt(bigBetData[0].potential_payout)}`)
    if (bigParData?.[0]) lines.push(`• 🎲 Mejor parlay: *${nameOf(bigParData[0].user_id)}* — ${fmt(bigParData[0].amount)} → ${fmt(bigParData[0].potential_payout)}`)
    if (bigCasData?.[0]) {
      const game = { slots: 'Slots', mines: 'Mines', penalty: 'Penales' }[bigCasData[0].game as string] ?? bigCasData[0].game
      lines.push(`• 🎰 Mejor casino: *${nameOf(bigCasData[0].user_id)}* en ${game} — ${fmt(bigCasData[0].bet_amount)} → ${fmt(bigCasData[0].win_amount)}`)
    }
    lines.push('')
  }

  lines.push(`⚠️ *Balance critico*`)
  lines.push(`• *${lowUsers ?? 0} usuarios bajo $1.000* (${pctLow}% de los registrados)`)
  lines.push(`• De esos, ${zeroUsers ?? 0} ya estan en $0`)

  return {
    content: lines.join('\n'),
    metadata: {
      active: active.size,
      totalUsers: totalUsers ?? 0,
      bets: { count: bets.length, vol: betsVol, won: wonBets, lost: lostBets, pending: pendingBets, payouts: betsPayouts },
      parlays: { count: parlays.length, vol: parlaysVol, won: wonPar, lost: lostPar, payouts: parlaysPayouts },
      casino: { ...byGame, totalCount: cas.length, net: casinoNet },
      trivia: { sessions: tri.length, perfect: triPerfect },
      balances: { totalUsers, zeroUsers, lowUsers, pctLow },
    },
  }
}

export async function getRecentSummaries(limit = 7) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('daily_summaries')
    .select('day, content, created_at')
    .order('day', { ascending: false })
    .limit(limit)
  return data ?? []
}
