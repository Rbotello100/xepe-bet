'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import type { FeedEntry } from '@/lib/types'

const ACTION_ICONS = {
  prediction: '🔮',
  bet: '🎰',
  cash_out: '💰',
  trivia: '🧠',
  parlay: '🎯',
  achievement: '🏆',
}

interface ActivityFeedProps {
  initialEntries: FeedEntry[]
}

export function ActivityFeed({ initialEntries }: ActivityFeedProps) {
  const [entries, setEntries] = useState(initialEntries)

  useEffect(() => {
    const supabase = createBrowserClient()
    const channel = supabase
      .channel('activity_feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_feed' }, (payload: { new: Record<string, unknown> }) => {
        setEntries(prev => [payload.new as unknown as FeedEntry, ...prev].slice(0, 30))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  if (entries.length === 0) {
    return <p className="text-sm text-slate-500 text-center py-4">Sin actividad reciente</p>
  }

  return (
    <div className="space-y-2">
      {entries.map(entry => (
        <div key={entry.id} className="flex items-start gap-3 rounded-lg bg-slate-800/50 px-3 py-2">
          <span className="text-lg mt-0.5">{ACTION_ICONS[entry.action_type] ?? '📌'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-300">
              <span className="font-medium text-white">{entry.profile?.display_name ?? 'Usuario'}</span>
              {' '}{entry.description}
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              {new Date(entry.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
