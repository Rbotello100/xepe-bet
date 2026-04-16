import { createServerClient } from '@/lib/supabase/server'

export interface AIFeedPost {
  id: string
  kind: 'summary' | 'flash' | 'analysis' | 'trivia'
  content: string
  created_at: string
}

/** Lee los posts activos del feed de IA, mas recientes primero. */
export async function getActiveFeedPosts(limit = 10): Promise<AIFeedPost[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('ai_feed')
    .select('id, kind, content, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as AIFeedPost[]
}
