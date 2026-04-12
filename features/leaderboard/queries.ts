import { createServerClient } from '@/lib/supabase/server'

export interface LeaderboardEntry {
  id: string
  display_name: string
  avatar_url: string | null
  total_points: number
  credits: number
}

export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, total_points, credits')
    .order('total_points', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []) as LeaderboardEntry[]
}

export async function getUserRank(userId: string): Promise<number> {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .order('total_points', { ascending: false })

  if (!data) return 0
  const index = data.findIndex(p => p.id === userId)
  return index >= 0 ? index + 1 : 0
}
