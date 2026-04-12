'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'

export function useRealtime<T>(table: string, initialData: T[]) {
  const [data, setData] = useState(initialData)

  useEffect(() => {
    const supabase = createBrowserClient()
    const channel = supabase
      .channel(`${table}_changes`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
        if (payload.eventType === 'INSERT') {
          setData(prev => [payload.new as T, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setData(prev => prev.map(item =>
            (item as Record<string, unknown>).id === (payload.new as Record<string, unknown>).id
              ? payload.new as T
              : item
          ))
        } else if (payload.eventType === 'DELETE') {
          setData(prev => prev.filter(item =>
            (item as Record<string, unknown>).id !== (payload.old as Record<string, unknown>).id
          ))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [table])

  return data
}
