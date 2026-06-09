// Iconos vectoriales de los simbolos del nuevo Slots. Se renderizan inline
// (sin assets externos). Los 5 simbolos solidos son un solo path con
// fill="currentColor" — el color del icono viene del `ink` definido en el
// SYMBOLS map del SlotsGame, aplicado via style/className al SVG.
//
// `balon` es caso especial: dos tonos fijos (cuerpo #F4F8FF, costuras
// #0B1020) para que siempre se lea como pelota independiente del fondo
// del tile.
//
// viewBox 0 0 64 64. El className controla tamano (62% del tile en la
// composicion final).

export type SymbolId = 'copa' | 'balon' | 'botin' | 'arco' | 'silbato' | 'banderin'

const PATHS: Record<Exclude<SymbolId, 'balon'>, string> = {
  copa: 'M20 12H44V20C44 30 38.5 36 32 36C25.5 36 20 30 20 20Z M20 15C12 15 10 18.5 10 22C10 25.8 13.5 29 20 29V25.6C15.6 25.6 13.4 23.8 13.4 22C13.4 20 15.6 18.4 20 18.4Z M44 15C52 15 54 18.5 54 22C54 25.8 50.5 29 44 29V25.6C48.4 25.6 50.6 23.8 50.6 22C50.6 20 48.4 18.4 44 18.4Z M29 36H35V46H29Z M23 46H41L43.5 51H20.5Z M18 50.5H46V55H18Z',
  botin: 'M11 36C11 29 15 24.5 23 24L25.3 12.7L30.7 13.5L29.7 23.7C31.4 25 33.2 25.5 35.8 25.8C43.8 26.6 48.8 29.5 49.8 34.7C50.2 36.9 48.5 38.5 46 38.5H14C12.5 38.5 11 37.5 11 36Z M16.1 41.5a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0Z M25.4 42a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0Z M34.7 42a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0Z M44.1 41.5a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0Z',
  arco: 'M11 51V17H53V51H49.5V20.5H14.5V51Z M24 21H26.5V49H24Z M37.5 21H40V49H37.5Z M15 33H49V35.5H15Z M27 41a5 5 0 1 0 10 0a5 5 0 1 0 -10 0Z',
  silbato: 'M11 27.5H26.74A13 13 0 1 1 26.74 40.5H11A3 3 0 0 1 8 37.5V30.5A3 3 0 0 1 11 27.5Z M40 30a4 4 0 1 0 0 8a4 4 0 1 0 0 -8Z M19 7a5 5 0 1 0 0 10a5 5 0 1 0 -10 0Z M19 12.5a2.4 2.4 0 1 0 0 4.8a2.4 2.4 0 1 0 0 -4.8Z',
  banderin: 'M28 9H31V53H28Z M31 11L52 18L31 25Z M22 53H42V56H22Z',
}

export function SlotIcon({ id, className }: { id: SymbolId; className?: string }) {
  if (id === 'balon') {
    return (
      <svg viewBox="0 0 64 64" className={className}>
        <circle cx="32" cy="32" r="20" fill="#F4F8FF" />
        <path d="M32 23.7 39.9 29.4 36.9 38.7 27.1 38.7 24.1 29.4Z" fill="#0B1020" />
        <path
          d="M32 23.7V12M39.9 29.4 51 25.8M36.9 38.7 43.8 48.2M27.1 38.7 20.2 48.2M24.1 29.4 13 25.8"
          stroke="#0B1020"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="32" cy="32" r="20" fill="none" stroke="#0B1020" strokeWidth="1.8" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 64 64" className={className} fill="currentColor" fillRule="evenodd">
      <path d={PATHS[id]} />
    </svg>
  )
}
