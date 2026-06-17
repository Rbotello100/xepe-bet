import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { createAdminClient } from '@/lib/supabase/admin'
import { addCredits } from '@/lib/credits'
import { logError } from '@/lib/log/error'

// Mesada diaria: $500 a todos los users una vez por dia.
// Idempotente via reference_id = `allowance-${YYYY-MM-DD}-${userId}` →
// el UNIQUE partial index en credit_transactions(user_id, type, reference_id)
// bloquea doble pago si el cron se reintenta.
//
// El cap MAX_BALANCE de $1M en add_credits_atomic ya frena el credito a
// quien ya este al tope.
export const maxDuration = 60

const ALLOWANCE_AMOUNT = 500

async function handler(request: Request) {
  const unauthorized = verifyCronAuth(request)
  if (unauthorized) return unauthorized

  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC

  // Trae todos los profiles (no usamos auth.admin.listUsers — necesitamos
  // solo los que tienen profile creado, que es el universo real de jugadores)
  const profiles: { id: string }[] = []
  let offset = 0
  while (true) {
    const { data, error } = await admin.from('profiles').select('id').range(offset, offset + 999)
    if (error) {
      void logError('daily-allowance.list', error, undefined, 'error')
      return NextResponse.json({ error: 'No se pudieron listar profiles' }, { status: 500 })
    }
    if (!data?.length) break
    profiles.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }

  let paid = 0
  let already = 0
  let failed = 0

  for (const p of profiles) {
    const refId = `allowance-${today}-${p.id}`
    const result = await addCredits(p.id, ALLOWANCE_AMOUNT, 'allowance', 'Mesada diaria Xepe Bet', refId)
    if (!result.success) {
      // addCredits ya loguea a error_log. Aca contamos.
      failed++
    } else {
      // Para distinguir between "pago nuevo" vs "ya estaba pagado" miramos
      // si el ref_id existe — addCredits no retorna ese dato, asi que
      // chequeamos directo.
      const { data: tx } = await admin
        .from('credit_transactions')
        .select('created_at')
        .eq('user_id', p.id)
        .eq('type', 'allowance')
        .eq('reference_id', refId)
        .maybeSingle()
      // Si la tx existe y se creó en los ultimos 5s, fue este run. Caso
      // contrario, addCredits salio por idempotency check.
      if (tx?.created_at) {
        const ageSec = (Date.now() - new Date(tx.created_at).getTime()) / 1000
        if (ageSec < 5) paid++
        else already++
      } else {
        already++
      }
    }
  }

  return NextResponse.json({
    day: today,
    amount: ALLOWANCE_AMOUNT,
    total_profiles: profiles.length,
    paid,
    already_paid: already,
    failed,
  })
}

export const GET = handler
export const POST = handler
