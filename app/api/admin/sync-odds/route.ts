import { NextResponse } from 'next/server'
import { syncMatchOdds } from '@/lib/sync/odds'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Wrapper admin-only de syncMatchOdds.
 * Permite al admin panel disparar el sync sin exponer CRON_SECRET al cliente.
 * Accepts optional ?sport=soccer_epl to override the default sport key.
 */
export async function POST(request: Request) {
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
    const url = new URL(request.url)
    const sport = url.searchParams.get('sport') ?? undefined
    const result = await syncMatchOdds(sport)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
