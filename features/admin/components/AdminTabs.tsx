'use client'

import { useState, type ReactNode } from 'react'

export interface Tab {
  id: string
  label: string
  badge?: number | null
  content: ReactNode
}

interface AdminTabsProps {
  tabs: Tab[]
  defaultTab?: string
}

export function AdminTabs({ tabs, defaultTab }: AdminTabsProps) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id)

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-800">
        {tabs.map(t => {
          const isActive = t.id === active
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-b-2 border-[var(--accent)] font-medium text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
              {t.badge !== null && t.badge !== undefined && t.badge > 0 && (
                <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] text-amber-400">
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tabs.map(t => (
        <div key={t.id} className={t.id === active ? '' : 'hidden'}>
          {t.content}
        </div>
      ))}
    </div>
  )
}
