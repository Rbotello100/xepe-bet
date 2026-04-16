'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import type { AIFeedPost } from '@/features/ai-feed/queries'

const ROTATION_MS = 6000

const KIND_META: Record<AIFeedPost['kind'], { icon: string; label: string; color: string }> = {
  summary:  { icon: '📰', label: 'Resumen',  color: 'text-[var(--casino-cyan)]' },
  flash:    { icon: '⚡', label: 'Flash',    color: 'text-[var(--casino-yellow)]' },
  analysis: { icon: '📊', label: 'Analisis', color: 'text-[var(--accent)]' },
  trivia:   { icon: '🎲', label: 'Trivia',   color: 'text-[var(--casino-teal)]' },
}

export function AIFeedWidget({ posts }: { posts: AIFeedPost[] }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (posts.length <= 1) return
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % posts.length)
    }, ROTATION_MS)
    return () => clearInterval(id)
  }, [posts.length])

  if (posts.length === 0) return null

  const current = posts[index]
  const meta = KIND_META[current.kind]

  return (
    <div className="mb-4 rounded-xl border border-[var(--card-border)] bg-gradient-to-r from-slate-900/60 to-slate-800/40 p-3 backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none mt-0.5" aria-hidden="true">
          {meta.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={clsx('text-[10px] font-bold uppercase tracking-wider', meta.color)}>
              {meta.label}
            </span>
            <span className="text-[10px] text-slate-500">· Relator IA</span>
          </div>
          <p className="text-sm text-slate-200 leading-snug line-clamp-2">
            {current.content}
          </p>
        </div>

        {/* Progress dots */}
        {posts.length > 1 && (
          <div className="flex flex-col gap-1 pt-1" aria-hidden="true">
            {posts.map((_, i) => (
              <span
                key={i}
                className={clsx(
                  'w-1 h-1 rounded-full transition-colors',
                  i === index ? 'bg-[var(--accent)]' : 'bg-slate-600',
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
