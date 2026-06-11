import Link from 'next/link'
import Image from 'next/image'

interface HeaderProps {
  user?: { display_name: string; avatar_url: string | null; credits: number; total_points: number } | null
  active?: string
}

// Predicciones: oculto del UI por decision de producto. La pagina /predictions
// y todo el feature (predictions table, PredictionForm, OthersPredictions,
// settlement en sync/scores, scoring de total_points) quedan en el repo por
// si se reactiva. Para volver a habilitarlo: descomentar la entry de NAV.
const NAV = [
  { label: 'Partidos', href: '/' },
  { label: 'Fixture', href: '/fixture' },
  { label: 'Ranking', href: '/leaderboard' },
  // { label: 'Predicciones', href: '/predictions' },
  { label: 'Apuestas', href: '/bets' },
  { label: 'Trivia', href: '/trivia' },
  { label: 'Casino', href: '/casino' },
]

export function Header({ user, active = '/' }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-card-border bg-[color-mix(in_oklab,var(--color-background)_80%,transparent)] backdrop-blur-[14px]">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-8 px-6">
        {/* LOGO XEPEBET — imagen real en public/xepebet-logo.png */}
        <Link href="/" className="flex items-center" aria-label="Xepe Bet">
          <Image
            src="/xepebet-logo.png"
            alt="Xepe Bet"
            width={144}
            height={36}
            priority
            className="h-9 w-auto"
          />
        </Link>

        {/* NAV */}
        <nav className="mr-auto hidden gap-1.5 md:flex">
          {NAV.map((n) => {
            const isActive = active === n.href
            // Solo mostrar links protegidos si hay user
            if (!user && (n.href === '/predictions' || n.href === '/bets' || n.href === '/trivia' || n.href === '/casino')) {
              return null
            }
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-full px-3.5 py-[7px] text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent-soft text-strong'
                    : 'text-muted hover:bg-card hover:text-foreground'
                }`}
              >
                {n.label}
              </Link>
            )
          })}
        </nav>

        {/* WALLET + AVATAR (o boton login) */}
        <div className="flex items-center gap-3.5">
          {user ? (
            <>
              <div className="hidden whitespace-nowrap text-right leading-tight sm:block">
                <p className="text-sm font-bold text-gold">
                  {user.total_points.toLocaleString('es-CL')} pts
                </p>
                <p className="font-mono text-xs text-muted">
                  ${user.credits.toLocaleString('es-CL')}
                </p>
              </div>
              {user.avatar_url ? (
                <div className="h-[38px] w-[38px] overflow-hidden rounded-full">
                  <img
                    src={user.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="grid h-[38px] w-[38px] place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-accent),var(--color-accent-deep))] text-[15px] font-bold text-background">
                  {user.display_name[0]}
                </div>
              )}
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-background hover:bg-accent-hover"
            >
              Iniciar sesion
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
