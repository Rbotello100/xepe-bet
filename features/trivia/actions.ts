'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { TRIVIA_REWARDS } from '@/lib/constants'

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

  // Check already played today
  const today = new Date().toISOString().split('T')[0]
  const { count } = await supabase
    .from('trivia_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('completed_at', `${today}T00:00:00`)
    .lte('completed_at', `${today}T23:59:59`)

  if ((count ?? 0) > 0) return { error: 'Ya jugaste la trivia hoy' }

  const totalQuestions = answers.length
  const correctAnswers = answers.filter(a => a.is_correct).length
  const allCorrect = correctAnswers === totalQuestions

  // Credits only if ALL correct
  const creditsEarned = allCorrect
    ? (TRIVIA_REWARDS[totalQuestions as keyof typeof TRIVIA_REWARDS] ?? 0)
    : 0

  // Create session
  const { data: session, error: sessionError } = await supabase
    .from('trivia_sessions')
    .insert({
      user_id: user.id,
      total_questions: totalQuestions,
      correct_answers: correctAnswers,
      credits_earned: creditsEarned,
    })
    .select('id')
    .single()

  if (sessionError) return { error: 'Error al guardar trivia' }

  // Save answers
  await supabase.from('trivia_answers').insert(
    answers.map(a => ({
      session_id: session.id,
      question_id: a.question_id,
      selected_option: a.selected_option,
      is_correct: a.is_correct,
      time_taken_ms: a.time_taken_ms,
    }))
  )

  // Award credits if earned
  if (creditsEarned > 0) {
    const { data: profile } = await supabase.from('profiles').select('credits').eq('id', user.id).single()
    if (profile) {
      await supabase.from('profiles').update({ credits: profile.credits + creditsEarned }).eq('id', user.id)
    }
  }

  // Activity feed
  await supabase.from('activity_feed').insert({
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
