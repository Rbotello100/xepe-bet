'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { TRIVIA_REWARDS } from '@/lib/constants'
import { generateRelatorMessage } from '@/lib/relator/generate-message'
import { addCredits } from '@/lib/credits'

/**
 * Respuesta recibida del cliente: SOLO la opcion seleccionada y tiempo.
 * El server calcula is_correct contra la DB — si el cliente manda un campo
 * 'is_correct' igual se ignora. De esta forma no se puede falsificar premios.
 */
interface TriviaAnswerInput {
  question_id: string
  selected_option: number
  time_taken_ms: number
}

export async function submitTrivia(answers: TriviaAnswerInput[]) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  if (!Array.isArray(answers) || answers.length === 0) {
    return { error: 'Respuestas invalidas' }
  }

  const admin = createAdminClient()

  // 1. Cargar correct_option de cada pregunta DESDE LA DB, no del cliente
  const questionIds = answers.map(a => a.question_id)
  const { data: questions, error: qError } = await admin
    .from('trivia_questions')
    .select('id, correct_option')
    .in('id', questionIds)

  if (qError || !questions) return { error: 'Error al validar respuestas' }

  // 2. Mapear id → correct_option para lookup O(1)
  const correctMap = new Map<string, number>()
  for (const q of questions) correctMap.set(q.id, q.correct_option)

  // 3. Validar cada respuesta server-side
  const validatedAnswers = answers.map(a => {
    const correct = correctMap.get(a.question_id)
    return {
      question_id: a.question_id,
      selected_option: a.selected_option,
      is_correct: correct !== undefined && a.selected_option === correct,
      time_taken_ms: a.time_taken_ms,
    }
  })

  // Si alguna pregunta no existe en DB, rechazar toda la sesion (previene inyeccion)
  const invalidQuestion = validatedAnswers.find(a => !correctMap.has(a.question_id))
  if (invalidQuestion) return { error: 'Pregunta invalida' }

  const totalQuestions = validatedAnswers.length
  const correctAnswers = validatedAnswers.filter(a => a.is_correct).length
  const allCorrect = correctAnswers === totalQuestions

  const creditsEarned = allCorrect
    ? (TRIVIA_REWARDS[totalQuestions as keyof typeof TRIVIA_REWARDS] ?? 0)
    : 0

  // Create session — el UNIQUE constraint (user_id, DATE(completed_at)) bloquea race conditions
  const { data: session, error: sessionError } = await admin
    .from('trivia_sessions')
    .insert({
      user_id: user.id,
      total_questions: totalQuestions,
      correct_answers: correctAnswers,
      credits_earned: creditsEarned,
    })
    .select('id')
    .single()

  if (sessionError) {
    // Postgres error 23505 = unique_violation → ya jugó hoy
    if (sessionError.code === '23505') return { error: 'Ya jugaste la trivia hoy' }
    return { error: 'Error al guardar trivia' }
  }

  // Save answers (con is_correct calculado server-side)
  await admin.from('trivia_answers').insert(
    validatedAnswers.map(a => ({
      session_id: session.id,
      question_id: a.question_id,
      selected_option: a.selected_option,
      is_correct: a.is_correct,
      time_taken_ms: a.time_taken_ms,
    }))
  )

  // Award credits if earned (with audit trail)
  if (creditsEarned > 0) {
    await addCredits(user.id, creditsEarned, 'trivia', `Trivia perfecta ${correctAnswers}/${totalQuestions}`)
  }

  // Activity feed
  await admin.from('activity_feed').insert({
    user_id: user.id,
    action_type: 'trivia',
    description: allCorrect
      ? `completo la trivia perfecta y gano $${creditsEarned}`
      : `respondio ${correctAnswers}/${totalQuestions} en la trivia`,
    metadata: { correct: correctAnswers, total: totalQuestions, credits: creditsEarned },
  })

  // Relator: trivia perfecta es narrable
  if (allCorrect) {
    void generateRelatorMessage({
      kind: 'flash',
      userId: user.id,
      context: `{user} acaba de hacer una trivia perfecta ${correctAnswers}/${totalQuestions} y se llevó $${creditsEarned}.`,
    })
  }

  revalidatePath('/trivia')
  return { success: true, correct_answers: correctAnswers, total_questions: totalQuestions, credits_earned: creditsEarned }
}
