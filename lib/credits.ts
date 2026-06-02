'use server'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Operaciones de creditos con audit trail.
 * TODO cambio de creditos en la app DEBE pasar por estas funciones.
 *
 * Las RPCs v2 (add/deduct_credits_atomic) hacen UPDATE de balance + INSERT
 * en credit_transactions en una sola transaccion PL/pgSQL. Si el audit falla
 * (por constraint, RLS, lo que sea), TODA la TX revierte — cero estados
 * incoherentes entre balance y trail.
 *
 * Tambien aplican caps a nivel SQL: MAX_GRANT=$50K por TX, MAX_BALANCE=$1M
 * total por user.
 */

type TransactionType = 'signup' | 'bet' | 'win' | 'cash_out' | 'trivia' | 'parlay' | 'refund' | 'casino_bet' | 'casino_win'

interface CreditResult {
  success: boolean
  newBalance: number
  error?: string
}

/**
 * Suma creditos al user. Falla si amount <= 0, > 50K, o si el nuevo balance
 * superaria el cap de $1M. Idempotente solo en sentido de "no race con otros
 * UPDATE concurrentes" — si la llamas 2 veces, suma 2 veces.
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
    p_type: type,
    p_description: description,
    p_reference_id: referenceId ?? null,
  })

  if (error || !data || data.length === 0) {
    return { success: false, newBalance: 0, error: error?.message ?? 'Error al acreditar' }
  }

  const result = data[0] as { success: boolean; new_balance: number }
  if (!result.success) {
    return {
      success: false,
      newBalance: result.new_balance ?? 0,
      error: 'No se pudo acreditar (monto fuera de rango o balance excede limite)',
    }
  }

  return { success: true, newBalance: result.new_balance }
}

/**
 * Resta creditos al user. Falla si amount <= 0, > 50K, o si no hay saldo.
 */
export async function deductCredits(
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
  const { data, error } = await admin.rpc('deduct_credits_atomic', {
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_description: description,
    p_reference_id: referenceId ?? null,
  })

  if (error || !data || data.length === 0) {
    return { success: false, newBalance: 0, error: error?.message ?? 'Error al descontar' }
  }

  const result = data[0] as { success: boolean; new_balance: number }
  if (!result.success) {
    return {
      success: false,
      newBalance: result.new_balance ?? 0,
      error: 'Creditos insuficientes',
    }
  }

  return { success: true, newBalance: result.new_balance }
}

export async function getBalance(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('credits').eq('id', userId).single()
  return data?.credits ?? 0
}
