'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'

const NAV_ITEMS = [
  { href: '/', label: 'Partidos', icon: '⚽' },
  { href: '/bets', label: 'Apostar', icon: '🎰' },
  { href: '/trivia', label: 'Trivia', icon: '🧠' },
  { href: '/leaderboard', label: 'Ranking', icon: '🏆' },
  { href: '/dashboard', label: 'Perfil', icon: '👤' },
] as const

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-700 bg-slate-900/95 backdrop-blur md:hidden">
      <div className="flex items-center justify-around">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex flex-col items-center gap-0.5 px-3 py-2 text-xs transition-colors min-h-[44px] min-w-[44px] justify-center',
                isActive ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <span className="text-lg">{icon}</span>
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
