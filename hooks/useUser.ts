'use client'

import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { createBrowserClient } from '@/lib/supabase/client'

/**
 * Devuelve el userId del session actual o null si no hay session.
 * Re-renderiza automaticamente cuando el user logea/desloga gracias a
 * onAuthStateChange. Util para hooks como useParlay que necesitan scoper
 * data por usuario en localStorage.
 */
export function useUser(): string | null {
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const supa = createBrowserClient()
    let mounted = true

    supa.auth.getUser().then(({ data }: { data: { user: { id: string } | null } }) => {
      if (mounted) setUserId(data.user?.id ?? null)
    })

    const { data: sub } = supa.auth.onAuthStateChange((_event: string, session: Session | null) => {
      if (mounted) setUserId(session?.user?.id ?? null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return userId
}
