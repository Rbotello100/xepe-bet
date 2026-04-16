export function HeroBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl mb-6 border border-[var(--card-border)] bg-gradient-to-br from-[#0F1A2E] via-[#131829] to-[#0A1F1A]">
      {/* Glow blobs */}
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[var(--accent)]/25 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-[var(--casino-cyan)]/20 blur-3xl pointer-events-none" />

      {/* Líneas de cancha — visibles */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.10] pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 400 200">
        {/* Líneas de banda */}
        <rect x="10" y="10" width="380" height="180" fill="none" stroke="white" strokeWidth="1.5" />
        {/* Línea media */}
        <line x1="200" y1="10" x2="200" y2="190" stroke="white" strokeWidth="1.5" />
        {/* Círculo central */}
        <circle cx="200" cy="100" r="28" fill="none" stroke="white" strokeWidth="1.5" />
        <circle cx="200" cy="100" r="2" fill="white" />
        {/* Áreas grandes */}
        <rect x="10" y="50" width="50" height="100" fill="none" stroke="white" strokeWidth="1.5" />
        <rect x="340" y="50" width="50" height="100" fill="none" stroke="white" strokeWidth="1.5" />
        {/* Áreas chicas */}
        <rect x="10" y="75" width="20" height="50" fill="none" stroke="white" strokeWidth="1.5" />
        <rect x="370" y="75" width="20" height="50" fill="none" stroke="white" strokeWidth="1.5" />
        {/* Arcos del área */}
        <path d="M 60 80 A 25 25 0 0 1 60 120" fill="none" stroke="white" strokeWidth="1.5" />
        <path d="M 340 80 A 25 25 0 0 0 340 120" fill="none" stroke="white" strokeWidth="1.5" />
      </svg>

      {/* Brillo dorado sutil arriba */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--casino-yellow)]/50 to-transparent" />

      <div className="relative px-6 py-8 flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--casino-cyan)] uppercase tracking-[0.3em] font-semibold mb-1 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
            FIFA World Cup
          </p>
          <h1 className="text-4xl font-black text-white leading-none tracking-tight">
            MUNDIAL <span className="text-[var(--casino-yellow)] drop-shadow-[0_0_15px_rgba(255,214,10,0.5)]">2026</span>
          </h1>
          <p className="text-sm text-slate-400 mt-2">Predice. Apuesta. Gana.</p>
        </div>
        <div className="text-6xl animate-[float_6s_ease-in-out_infinite] drop-shadow-[0_0_20px_rgba(255,214,10,0.4)]">🏆</div>
      </div>

      {/* Borde inferior con gradiente verde */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/60 to-transparent" />
    </div>
  )
}
