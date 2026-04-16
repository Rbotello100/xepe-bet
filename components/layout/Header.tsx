import Link from 'next/link'

interface HeaderProps {
  user?: { display_name: string; avatar_url: string | null; credits: number; total_points: number } | null
}

export function Header({ user }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-700 bg-slate-900/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-white">
          <span>Mundial 2026</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm text-slate-400">
          <Link href="/" className="hover:text-white transition-colors">Partidos</Link>
          <Link href="/leaderboard" className="hover:text-white transition-colors">Ranking</Link>
          {user && (
            <>
              <Link href="/predictions" className="hover:text-white transition-colors">Predicciones</Link>
              <Link href="/bets" className="hover:text-white transition-colors">Apuestas</Link>
              <Link href="/trivia" className="hover:text-white transition-colors">Trivia</Link>
              <Link href="/casino" className="hover:text-white transition-colors">Casino</Link>
            </>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3 text-sm">
              <div className="text-right hidden sm:block">
                <p className="text-[var(--casino-yellow)] font-semibold">{user.total_points} pts</p>
                <p className="text-slate-500 text-xs">${user.credits.toLocaleString()}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-slate-700 overflow-hidden">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">
                    {user.display_name[0]}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-[var(--casino-red)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
            >
              Iniciar sesion
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
