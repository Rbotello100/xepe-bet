'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'

export function useCredits(userId: string, initialCredits: number) {
  const [credits, setCredits] = useState(initialCredits)

  useEffect(() => {
    const supabase = createBrowserClient()
    const channel = supabase
      .channel(`credits_${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      }, (payload: { new: Record<string, unknown> }) => {
        setCredits((payload.new as { credits: number }).credits)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return credits
}
