'use client'

import { useState } from 'react'

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: usar el viejo execCommand (algunos webviews lo necesitan)
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="rounded-md border border-card-border bg-sunken px-3 py-1.5 text-xs font-semibold text-strong hover:bg-card-border transition-colors"
    >
      {copied ? '✓ Copiado' : 'Copiar para Slack'}
    </button>
  )
}
