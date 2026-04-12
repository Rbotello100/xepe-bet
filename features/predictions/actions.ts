'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { PredictionInput } from './types'

export async function savePrediction(input: PredictionInput) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // Validate match exists and is not locked
  const { data: match } = await supabase
    .from('matches')
    .select('starts_at, status')
    .eq('id', input.match_id)
    .single()

  if (!match) return { error: 'Partido no encontrado' }

  const startsAt = new Date(match.starts_at)
  const lockTime = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000)
  if (new Date() >= lockTime) {
    return { error: 'Las predicciones estan cerradas para este partido' }
  }

  const { error } = await supabase
    .from('predictions')
    .upsert({
      user_id: user.id,
      match_id: input.match_id,
      predicted_winner: input.predicted_winner,
      predicted_home_score: input.predicted_home_score,
      predicted_away_score: input.predicted_away_score,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,match_id' })

  if (error) return { error: error.message }

  // Activity feed
  await supabase.from('activity_feed').insert({
    user_id: user.id,
    action_type: 'prediction',
    description: `hizo una prediccion`,
    metadata: { match_id: input.match_id, pick: input.predicted_winner },
  })

  revalidatePath('/')
  return { success: true }
}
