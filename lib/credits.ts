'use server'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Unified credit operations with audit trail.
 * EVERY credit change in the app MUST go through these functions.
 */

type TransactionType = 'signup' | 'bet' | 'win' | 'cash_out' | 'trivia' | 'parlay' | 'refund' | 'casino_bet' | 'casino_win'

interface CreditResult {
  success: boolean
  newBalance: number
  error?: string
}

/**
 * Deduct credits from user. Fails if insufficient.
 */
export async function deductCredits(
  userId: string,
  amount: number,
  type: TransactionType,
  description: string,
  referenceId?: string
): Promise<CreditResult> {
  const admin = createAdminClient()

  const { data: profile } = await admin.from('profiles').select('credits').eq('id', userId).single()
  if (!profile) return { success: false, newBalance: 0, error: 'Perfil no encontrado' }
  if (profile.credits < amount) return { success: false, newBalance: profile.credits, error: 'Creditos insuficientes' }

  const newBalance = Math.round((profile.credits - amount) * 100) / 100

  const { error } = await admin.from('profiles').update({ credits: newBalance }).eq('id', userId)
  if (error) return { success: false, newBalance: profile.credits, error: 'Error al descontar' }

  // Log transaction
  await admin.from('credit_transactions').insert({
    user_id: userId,
    amount: -amount,
    type,
    balance_after: newBalance,
    reference_id: referenceId ?? null,
    description,
  }).then(() => {}, () => {})

  return { success: true, newBalance }
}

/**
 * Add credits to user.
 */
export async function addCredits(
  userId: string,
  amount: number,
  type: TransactionType,
  description: string,
  referenceId?: string
): Promise<CreditResult> {
  const admin = createAdminClient()

  const { data: profile } = await admin.from('profiles').select('credits').eq('id', userId).single()
  if (!profile) return { success: false, newBalance: 0, error: 'Perfil no encontrado' }

  const newBalance = Math.round((profile.credits + amount) * 100) / 100

  const { error } = await admin.from('profiles').update({ credits: newBalance }).eq('id', userId)
  if (error) return { success: false, newBalance: profile.credits, error: 'Error al acreditar' }

  // Log transaction
  await admin.from('credit_transactions').insert({
    user_id: userId,
    amount: +amount,
    type,
    balance_after: newBalance,
    reference_id: referenceId ?? null,
    description,
  }).then(() => {}, () => {})

  return { success: true, newBalance }
}

/**
 * Get current balance.
 */
export async function getBalance(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('credits').eq('id', userId).single()
  return data?.credits ?? 0
}
