'use client'

import { useEffect, useRef, useState } from 'react'
import { RelatorAvatar } from './RelatorAvatar'
import type { AIFeedPost } from '@/features/ai-feed/queries'

// kind del ai_feed -> presentacion visual
const CATS: Record<AIFeedPost['kind'], { tag: string; color: string; bar: string }> = {
  summary:  { tag: 'DATO',        color: 'text-accent-deep', bar: 'var(--color-accent-deep)' },
  flash:    { tag: 'HIT DEL DIA', color: 'text-win',         bar: 'var(--color-win)' },
  analysis: { tag: 'FLUJO',       color: 'text-cyan',        bar: 'var(--color-cyan)' },
  trivia:   { tag: 'TRIVIA',      color: 'text-gold',        bar: 'var(--color-gold)' },
}

// Resalta numeros / % / montos dentro del texto plano del ai_feed.
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(\$?\d[\d.,]*%?|x\d[\d.,]*)/g)
  return (
    <>
      {parts.map((p, i) =>
        /^\$?\d|^x\d/.test(p)
          ? <b key={i} className="font-bold text-accent-deep">{p}</b>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

interface RelatorProps {
  messages: AIFeedPost[]
  /** modo discreto: menos peso visual (default true) */
  quiet?: boolean
}

export function Relator({ messages, quiet = true }: RelatorProps) {
  const [visible, setVisible] = useState<AIFeedPost[]>(() => messages.slice(0, 6))
  const [typing, setTyping] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const cursor = useRef(messages.length)

  // Re-sync si cambian los mensajes del server
  useEffect(() => {
    setVisible(messages.slice(0, 6))
    cursor.current = messages.length
  }, [messages])

  // Stream: cada ~5.2s entra un mensaje nuevo (rota el array fuente)
  useEffect(() => {
    if (messages.length === 0) return
    let t: ReturnType<typeof setTimeout>
    let sp: ReturnType<typeof setTimeout>
    const loop = () => {
      setTyping(true)
      t = setTimeout(() => {
        const next = messages[cursor.current % messages.length]
        cursor.current += 1
        setVisible((prev) => [{ ...next, id: next.id + '-' + cursor.current }, ...prev].slice(0, 8))
        setTyping(false)
        setSpeaking(true)
        clearTimeout(sp)
        sp = setTimeout(() => setSpeaking(false), 2400)
        t = setTimeout(loop, 5200)
      }, 1300)
    }
    t = setTimeout(loop, 4000)
    return () => { clearTimeout(t); clearTimeout(sp) }
  }, [messages])

  const talking = typing || speaking

  if (messages.length === 0) return null

  return (
    <section className="flex h-[520px] flex-col overflow-hidden rounded-lg border border-card-border bg-card">
      {/* header */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-card-border px-4 py-3.5">
        <RelatorAvatar talking={talking} />
        <div>
          <p className="text-[15px] font-bold text-strong">El Relator</p>
          <p className="font-mono text-xs text-accent-deep">
            {talking ? 'relatando en vivo…' : 'en vivo · tirando numeros'}
          </p>
        </div>
      </div>

      {/* stream */}
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3.5">
        {typing && (
          <div className="flex w-fit items-center gap-1.5 rounded-md bg-sunken px-4 py-3.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-accent-deep"
                style={{ animation: `typing 1.2s ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
        )}
        {visible.map((m) => {
          const c = CATS[m.kind]
          return (
            <div
              key={m.id}
              className={
                quiet
                  ? 'border-l-2 py-0.5 pl-3'
                  : 'rounded-[4px_14px_14px_14px] border border-card-border bg-sunken px-3 py-2.5'
              }
              style={{
                borderLeftColor: quiet ? c.bar : undefined,
                animation: 'msg-in .4s ease',
              }}
            >
              <div className={`mb-1 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.06em] ${c.color}`}>
                {c.tag}
              </div>
              <p className={`text-[13px] leading-snug ${quiet ? 'text-muted' : 'text-foreground'}`}>
                <Highlighted text={m.content} />
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
