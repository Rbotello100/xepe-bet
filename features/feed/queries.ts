import { createServerClient } from '@/lib/supabase/server'
import type { FeedEntry } from '@/lib/types'

export async function getRecentActivity(limit = 20): Promise<FeedEntry[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('activity_feed')
    .select('*, profile:profiles!user_id(display_name, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return []
  return (data ?? []) as unknown as FeedEntry[]
}
