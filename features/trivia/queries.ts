import { createServerClient } from '@/lib/supabase/server'
import type { TriviaQuestion } from './types'

export async function getDailyTrivia(count = 5): Promise<TriviaQuestion[]> {
  const supabase = await createServerClient()

  // Get random questions -- Supabase doesn't have RANDOM(), so we fetch more and shuffle
  const { data, error } = await supabase
    .from('trivia_questions')
    .select('id, question, options, correct_option, difficulty, category')
    .limit(count * 3)

  if (error || !data) return []

  // Shuffle and take `count`
  const shuffled = data.sort(() => Math.random() - 0.5).slice(0, count)
  return shuffled as TriviaQuestion[]
}

export async function canPlayToday(userId: string): Promise<boolean> {
  const supabase = await createServerClient()
  const today = new Date().toISOString().split('T')[0]

  const { count } = await supabase
    .from('trivia_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('completed_at', `${today}T00:00:00`)
    .lte('completed_at', `${today}T23:59:59`)

  return (count ?? 0) === 0
}
