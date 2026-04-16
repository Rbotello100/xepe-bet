'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { TRIVIA_REWARDS } from '@/lib/constants'
import { addCredits } from '@/lib/credits'

interface TriviaAnswer {
  question_id: string
  selected_option: number
  is_correct: boolean
  time_taken_ms: number
}

export async function submitTrivia(answers: TriviaAnswer[]) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  const totalQuestions = answers.length
  const correctAnswers = answers.filter(a => a.is_correct).length
  const allCorrect = correctAnswers === totalQuestions

  // Credits only if ALL correct
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

  // Save answers
  await admin.from('trivia_answers').insert(
    answers.map(a => ({
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

  revalidatePath('/trivia')
  return { success: true, correct_answers: correctAnswers, total_questions: totalQuestions, credits_earned: creditsEarned }
}
