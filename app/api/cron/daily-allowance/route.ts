import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { createAdminClient } from '@/lib/supabase/admin'
import { addCredits } from '@/lib/credits'
import { logError } from '@/lib/log/error'

// =====================================================================
// MESADA DIARIA — A PRUEBA DE BALAS
// =====================================================================
// Tira $500 a todos los users una vez por dia.
//
// Defensa en profundidad:
//
// 1. IDEMPOTENCIA por reference_id = `allowance-${chileDate}-${userId}`
//    + UNIQUE partial index en credit_transactions(user_id, type, reference_id)
//    → Si el cron corre dos veces (Vercel + GH Actions), el segundo no paga.
//
// 2. PRE-FETCH: en vez de pegarle a addCredits para los 165 users (con su
//    idempotency check interno), traemos todas las allowance del dia DE UNA
//    y filtramos en memoria. Reduce 165 queries a 1.
//
// 3. BATCHES PARALELOS (10 en paralelo) → 17 batches para 165 users en
//    ~3s en vez de ~30s secuencial. Bajo el limite Vercel maxDuration=60s
//    con margen 20x.
//
// 4. RETRY CON BACKOFF: hasta 3 intentos por user para errores transitorios
//    de RPC (pgBouncer recycle, network blip). NO se reintenta cuando el
//    error es "balance excede limite" — eso es un cap legitimo, no un fallo.
//
// 5. TIME BUDGET: si llevamos >55s en el handler, abortamos limpio
//    devolviendo lo procesado para que el proximo run (Vercel fallback o
//    workflow_dispatch manual) complete el resto.
//
// 6. AUDIT TRAIL: incluso si el run es OK, escribe el resumen a error_log
//    con source='daily-allowance.run' (level=info via metadata). Esto deja
//    huella para /admin/observability incluso cuando todo salio bien.
//
// 7. CHILE DATE en el reference_id (no UTC) → la "mesada del lunes" siempre
//    es lunes en Chile, no importa la hora UTC en que corra.
// =====================================================================

export const maxDuration = 60

const ALLOWANCE_AMOUNT = 500
const BATCH_SIZE = 10
const MAX_RETRIES = 3
const RETRY_BASE_MS = 200
const TIME_BUDGET_MS = 55_000  // 5s antes del Vercel cutoff

function chileDate(): string {
  // UTC-4, sin DST en 2026
  return new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function isCapError(error: string | undefined): boolean {
  if (!error) return false
  const e = error.toLowerCase()
  return e.includes('balance') || e.includes('limite') || e.includes('cap') || e.includes('fuera de rango')
}

async function payOneWithRetry(
  userId: string,
  refId: string,
): Promise<{ status: 'paid' | 'capped' | 'failed'; error?: string }> {
  let lastError: string | undefined
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await addCredits(userId, ALLOWANCE_AMOUNT, 'allowance', 'Mesada diaria Xepe Bet', refId)
    if (result.success) return { status: 'paid' }
    lastError = result.error
    // Cap legitimo — no reintentar
    if (isCapError(result.error)) return { status: 'capped', error: result.error }
    // Backoff exponencial suave: 200, 400, 800 ms
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt - 1)))
    }
  }
  return { status: 'failed', error: lastError }
}

async function handler(request: Request) {
  const unauthorized = verifyCronAuth(request)
  if (unauthorized) return unauthorized

  const startedAt = Date.now()
  const day = chileDate()
  const admin = createAdminClient()

  // ----- 1. Profiles (con paginacion) -----
  const profiles: { id: string }[] = []
  let offset = 0
  while (true) {
    const { data, error } = await admin.from('profiles').select('id').range(offset, offset + 999)
    if (error) {
      void logError('daily-allowance.listProfiles', error, { day }, 'error')
      return NextResponse.json({ error: 'No se pudieron listar profiles', day }, { status: 500 })
    }
    if (!data?.length) break
    profiles.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }

  // ----- 2. Pre-fetch existing allowance tx para hoy -----
  // Una sola query: trae todos los reference_id ya pagados hoy → set en memoria.
  // Beneficio: evitamos 165 idempotency checks individuales dentro de addCredits.
  const alreadyPaid = new Set<string>()
  let offset2 = 0
  while (true) {
    const { data, error } = await admin
      .from('credit_transactions')
      .select('user_id')
      .eq('type', 'allowance')
      .like('reference_id', `allowance-${day}-%`)
      .range(offset2, offset2 + 999)
    if (error) {
      void logError('daily-allowance.preFetch', error, { day }, 'error')
      // No fallar — addCredits tiene su propio idempotency check como fallback.
      break
    }
    if (!data?.length) break
    for (const r of data) alreadyPaid.add(r.user_id)
    if (data.length < 1000) break
    offset2 += 1000
  }

  const needsPay = profiles.filter(p => !alreadyPaid.has(p.id))

  // ----- 3. Batches paralelos -----
  const counts = { paid: 0, capped: 0, failed: 0, aborted: 0 }
  const failedIds: string[] = []
  const cappedIds: string[] = []

  for (let i = 0; i < needsPay.length; i += BATCH_SIZE) {
    // Time budget check antes de cada batch
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      counts.aborted = needsPay.length - i
      void logError(
        'daily-allowance.timeBudget',
        `Cortado por budget. Quedan ${counts.aborted} sin procesar.`,
        { day, processed: i, total: needsPay.length },
        'warn',
      )
      break
    }

    const batch = needsPay.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(p => payOneWithRetry(p.id, `allowance-${day}-${p.id}`).then(r => ({ id: p.id, ...r })))
    )
    for (const r of results) {
      if (r.status === 'paid') counts.paid++
      else if (r.status === 'capped') { counts.capped++; cappedIds.push(r.id) }
      else { counts.failed++; failedIds.push(r.id) }
    }
  }

  // ----- 4. Audit trail (siempre, incluso si todo OK) -----
  const summary = {
    day,
    amount: ALLOWANCE_AMOUNT,
    total_profiles: profiles.length,
    already_paid: alreadyPaid.size,
    needs_pay: needsPay.length,
    paid: counts.paid,
    capped: counts.capped,
    failed: counts.failed,
    aborted: counts.aborted,
    elapsed_ms: Date.now() - startedAt,
    failed_ids: failedIds.slice(0, 50),  // cap para no inflar el log
    capped_ids: cappedIds.slice(0, 50),
  }
  // Si hay fallos: error level. Si solo capped: warn. Si todo OK: info via warn.
  const level = counts.failed > 0 ? 'error' : counts.capped > 0 || counts.aborted > 0 ? 'warn' : 'warn'
  void logError(
    counts.failed > 0 ? 'daily-allowance.partialFailure' : 'daily-allowance.run',
    counts.failed > 0 ? `${counts.failed} users no pudieron acreditarse` : 'OK',
    summary,
    level,
  )

  return NextResponse.json(summary)
}

export const GET = handler
export const POST = handler
