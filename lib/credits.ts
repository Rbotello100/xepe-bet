'use server'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Unified credit operations with audit trail.
 * EVERY credit change in the app MUST go through these functions.
 *
 * Los UPDATES de balance son atomicos via Postgres functions (ver
 * supabase/migrations-atomic-credits-v1.sql). Cero race conditions entre
 * requests paralelos del mismo user.
 */

type TransactionType = 'signup' | 'bet' | 'win' | 'cash_out' | 'trivia' | 'parlay' | 'refund' | 'casino_bet' | 'casino_win'

interface CreditResult {
  success: boolean
  newBalance: number
  error?: string
}

/**
 * Deduct credits from user. Fails if insufficient or amount <= 0.
 * Atomic: no race conditions.
 */
export async function deductCredits(
  userId: string,
  amount: number,
  type: TransactionType,
  description: string,
  referenceId?: string
): Promise<CreditResult> {
  // Validacion de entrada — protege contra montos negativos/NaN
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, newBalance: 0, error: 'Monto invalido' }
  }

  const admin = createAdminClient()

  const { data, error } = await admin.rpc('deduct_credits_atomic', {
    p_user_id: userId,
    p_amount: amount,
  })

  if (error || !data || data.length === 0) {
    return { success: false, newBalance: 0, error: 'Error al descontar' }
  }

  const result = data[0] as { success: boolean; new_balance: number }
  if (!result.success) {
    return { success: false, newBalance: result.new_balance ?? 0, error: 'Creditos insuficientes' }
  }

  // Log transaction — fire and forget (si falla el log no revertimos, es audit)
  await admin.from('credit_transactions').insert({
    user_id: userId,
    amount: -amount,
    type,
    balance_after: result.new_balance,
    reference_id: referenceId ?? null,
    description,
  }).then(() => {}, () => {})

  return { success: true, newBalance: result.new_balance }
}

/**
 * Add credits to user. Atomic.
 */
export async function addCredits(
  userId: string,
  amount: number,
  type: TransactionType,
  description: string,
  referenceId?: string
): Promise<CreditResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, newBalance: 0, error: 'Monto invalido' }
  }

  const admin = createAdminClient()

  const { data, error } = await admin.rpc('add_credits_atomic', {
    p_user_id: userId,
    p_amount: amount,
  })

  if (error || !data || data.length === 0) {
    return { success: false, newBalance: 0, error: 'Error al acreditar' }
  }

  const result = data[0] as { success: boolean; new_balance: number }
  if (!result.success) {
    return { success: false, newBalance: 0, error: 'Perfil no encontrado' }
  }

  await admin.from('credit_transactions').insert({
    user_id: userId,
    amount: +amount,
    type,
    balance_after: result.new_balance,
    reference_id: referenceId ?? null,
    description,
  }).then(() => {}, () => {})

  return { success: true, newBalance: result.new_balance }
}

/**
 * Get current balance.
 */
export async function getBalance(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('credits').eq('id', userId).single()
  return data?.credits ?? 0
}
