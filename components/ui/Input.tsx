import { clsx } from 'clsx'
import { type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-sm text-slate-400">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={clsx(
          'w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100',
          'placeholder:text-slate-500',
          'focus:border-[var(--casino-red)] focus:outline-none focus:ring-1 focus:ring-[var(--casino-red)]',
          error && 'border-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
