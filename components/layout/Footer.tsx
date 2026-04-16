import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-[var(--card-border)] bg-[var(--background)] py-6 mt-auto">
      <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
        <p>
          Mundial Betting · Hackathon World Cup Xepelin 2026 · Solo creditos virtuales, sin dinero real.
        </p>
        <nav className="flex items-center gap-4">
          <Link href="/terms" className="hover:text-[var(--foreground)] transition-colors">
            Terminos
          </Link>
          <Link href="/privacy" className="hover:text-[var(--foreground)] transition-colors">
            Privacidad
          </Link>
        </nav>
      </div>
    </footer>
  )
}
