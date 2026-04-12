import { createServerClient } from '@/lib/supabase/server'
import type { Prediction } from '@/lib/types'

export async function getUserPredictions(userId: string): Promise<Prediction[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('predictions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Prediction[]
}

export async function getUserPredictionForMatch(userId: string, matchId: string): Promise<Prediction | null> {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('predictions')
    .select('*')
    .eq('user_id', userId)
    .eq('match_id', matchId)
    .single()

  return (data as Prediction) ?? null
}

export async function getMatchPredictions(matchId: string): Promise<(Prediction & { profile: { display_name: string; avatar_url: string | null } })[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('predictions')
    .select('*, profile:profiles!user_id(display_name, avatar_url)')
    .eq('match_id', matchId)

  if (error) throw new Error(error.message)
  return (data ?? []) as never
}
