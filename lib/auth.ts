import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

/**
 * Get the current user and profile. Redirects to /login if not authenticated.
 * Use in any page that requires auth.
 */
export async function requireAuth(): Promise<{ userId: string; profile: Profile }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  return { userId: user.id, profile: profile as unknown as Profile }
}

/**
 * Get the current user and profile without requiring auth.
 * Returns null if not authenticated.
 */
export async function getOptionalAuth(): Promise<{ userId: string; profile: Profile } | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  return { userId: user.id, profile: profile as unknown as Profile }
}
