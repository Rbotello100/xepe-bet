import { NextResponse } from 'next/server'
import { syncFinishedScores } from '@/lib/sync/scores'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Wrapper admin-only de syncFinishedScores.
 * Permite al admin panel disparar el sync sin exponer CRON_SECRET al cliente.
 */
export async function POST() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const result = await syncFinishedScores()
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
