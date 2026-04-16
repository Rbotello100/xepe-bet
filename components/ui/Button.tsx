import { clsx } from 'clsx'
import { type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantStyles: Record<Variant, string> = {
  primary: 'bg-[var(--accent)] text-slate-900 font-semibold hover:bg-[var(--accent-hover)] shadow-[0_0_20px_rgba(0,230,118,0.35)] hover:shadow-[0_0_30px_rgba(0,230,118,0.5)]',
  secondary: 'bg-slate-700 text-slate-200 hover:bg-slate-600',
  danger: 'bg-red-500 text-white hover:bg-red-600',
  ghost: 'text-slate-300 hover:bg-slate-800',
  outline: 'border border-slate-600 text-slate-300 hover:bg-slate-800',
}

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        'disabled:opacity-50 disabled:pointer-events-none',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
