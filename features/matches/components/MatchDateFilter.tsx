'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useTransition } from 'react'

export type DateFilter = 'hoy' | 'manana' | 'semana' | 'todos'

interface Counts {
  hoy: number
  manana: number
  semana: number
  todos: number
}

interface Props {
  counts: Counts
  active: DateFilter
}

const TABS: Array<{ id: DateFilter; label: string }> = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'manana', label: 'Mañana' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'todos', label: 'Todos' },
]

/**
 * Tabs de filtro por fecha. Actualiza ?date=... en la URL y deja que el
 * Server Component padre re-renderice la lista filtrada.
 *
 * Usamos useTransition para que el click no bloquee el UI mientras
 * Next.js fetcha el nuevo render del Server Component.
 */
export function MatchDateFilter({ counts, active }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const goTo = (id: DateFilter) => {
    const params = new URLSearchParams(searchParams.toString())
    if (id === 'hoy') params.delete('date') // hoy es el default
    else params.set('date', id)
    const qs = params.toString()
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname)
    })
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-xl border border-card-border bg-card p-1.5">
      {TABS.map(t => {
        const isActive = active === t.id
        const count = counts[t.id]
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => goTo(t.id)}
            disabled={isPending}
            className={`flex flex-1 min-w-[80px] items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? 'bg-accent text-background shadow-[0_2px_10px_color-mix(in_oklab,var(--color-accent)_35%,transparent)]'
                : 'text-muted hover:bg-sunken hover:text-foreground'
            } ${isPending ? 'opacity-60 cursor-wait' : ''}`}
          >
            <span>{t.label}</span>
            <span
              className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-bold ${
                isActive ? 'bg-background/25 text-background' : 'bg-sunken text-subtle'
              }`}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
