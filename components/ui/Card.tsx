import { clsx } from 'clsx'
import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: boolean
}

export function Card({ className, padding = true, children, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-slate-700 bg-slate-800',
        padding && 'p-4',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
