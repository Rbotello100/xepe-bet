/**
 * Avatar SVG del Relator (locutor con auriculares + microfono).
 * Animaciones (boca, parpadeo, cabeceo) viven en app/globals.css.
 * Sin deps externas: solo CSS + Tailwind v4 tokens.
 */

interface RelatorAvatarProps {
  talking?: boolean
}

export function RelatorAvatar({ talking = false }: RelatorAvatarProps) {
  return (
    <span
      className={`relator-avatar relative grid h-10 w-10 place-items-center overflow-visible rounded-full border border-card-border bg-sunken ${
        talking ? 'is-talking' : ''
      }`}
    >
      <svg viewBox="0 0 48 48" className="h-[34px] w-[34px]" aria-hidden="true">
        <g className="r-head">
          {/* banda de auriculares */}
          <path
            d="M11 22 A13 13 0 0 1 37 22"
            fill="none"
            stroke="var(--color-accent-deep)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          {/* ear cups */}
          <rect x="8" y="20" width="5" height="9.5" rx="2.5" fill="var(--color-accent-deep)" />
          <rect x="35" y="20" width="5" height="9.5" rx="2.5" fill="var(--color-accent-deep)" />
          {/* cara */}
          <rect
            x="14"
            y="14"
            width="20"
            height="22"
            rx="9"
            fill="color-mix(in oklab, var(--color-accent) 24%, var(--color-background))"
            stroke="var(--color-accent)"
            strokeWidth="1.5"
          />
          {/* ojos (parpadean) */}
          <circle className="r-eye" cx="20.5" cy="23" r="1.8" fill="var(--color-accent-deep)" />
          <circle className="r-eye" cx="28" cy="23" r="1.8" fill="var(--color-accent-deep)" />
          {/* boca (se mueve al hablar) */}
          <rect
            className="r-mouth"
            x="19.5"
            y="28"
            width="9"
            height="4.6"
            rx="2.3"
            fill="var(--color-accent-deep)"
          />
          {/* brazo del microfono + espuma */}
          <path
            d="M35 25 Q33.5 33 28 34.3"
            fill="none"
            stroke="var(--color-accent-deep)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="27" cy="34.6" r="2.6" fill="var(--color-accent)" />
        </g>
      </svg>
      {/* dot "en vivo" */}
      <span
        className="absolute -bottom-px -right-px h-[11px] w-[11px] rounded-full border-2 border-card bg-win"
        style={{ animation: 'live-pulse 2s infinite' }}
      />
    </span>
  )
}
