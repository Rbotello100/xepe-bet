'use client'

import { useEffect, useRef, useState } from 'react'
import { playSlots } from '@/features/casino/actions'
import { SlotIcon, type SymbolId } from './SlotIcon'

// =====================================================================
// SLOTS — motor de rodillos clasicos (handoff design v2, 2026-06-08)
// =====================================================================
// Estrategia:
//  - El shell (.machine, result bar, boton, paytable) se renderiza en JSX
//    estandar de React.
//  - Los rodillos (.reels) se manipulan IMPERATIVAMENTE via DOM:
//    innerHTML + classList + style.transform. Esto es deliberado:
//    el motor del prototipo es imperativo (kick con reflow forzado,
//    timeouts deterministicos, clonado de winlines, particulas). Forzarlo
//    al modelo declarativo de React introduce bugs sutiles de timing.
//  - Cleanup completo de timers/intervals en unmount.
//  - NO se usa requestAnimationFrame en ningun lado (handoff explicito).
//    Razones: rAF se throttlea en segundo plano y el countUp + el
//    completion timer del spin terminarian colgados si el user cambia
//    de tab a mitad del giro.
//  - El grid del resultado viene SIEMPRE del Server Action. El cliente
//    NUNCA inventa simbolos.

interface SymbolMeta {
  name: string
  pay: number
  tile: string
  glow: string
  ink: string
  weight: number
}

const SYMBOLS_DATA: Record<SymbolId, SymbolMeta> = {
  copa:     { name: 'La Copa',     pay: 8000, tile: '#F4B740', glow: '#FFD479', ink: '#2A1B05', weight: 1 },
  balon:    { name: 'El Balón',    pay: 1500, tile: '#56C7F0', glow: '#8FE0FF', ink: '#072A3A', weight: 2 },
  botin:    { name: 'El Botín',    pay: 300,  tile: '#9B6BFF', glow: '#C6A8FF', ink: '#FFFFFF', weight: 3 },
  arco:     { name: 'El Arco',     pay: 70,   tile: '#19B584', glow: '#5BE3B6', ink: '#053428', weight: 4 },
  silbato:  { name: 'El Silbato',  pay: 18,   tile: '#46506E', glow: '#9AA4C8', ink: '#E7EBFB', weight: 6 },
  banderin: { name: 'El Banderín', pay: 10,   tile: '#F0617C', glow: '#FF93A6', ink: '#3A0712', weight: 7 },
}

const IDS: SymbolId[] = ['copa', 'balon', 'botin', 'arco', 'silbato', 'banderin']

// Pool de aparicion para los tiles "filler" del rodillo visual. Frecuencia
// ponderada por `weight`. NO afecta el resultado real del giro — ese viene
// del backend con sus propios weights ([4,8,13,19,25,31]). Esto solo controla
// que se vea mientras gira.
const POOL: SymbolId[] = IDS.flatMap(id => Array(SYMBOLS_DATA[id].weight).fill(id))
const rndSym = (): SymbolId => POOL[Math.floor(Math.random() * POOL.length)]

const PITCH = 117                    // sincronizar con --pitch en CSS
const FILLER = 16                    // tiles de "spin-through"
const TRAIL = 3                      // tiles extra para overshoot del rebote
const EASE = 'cubic-bezier(.16,1.28,.4,1)'
const BASE_DUR = 1.05                // duracion col 0 (segundos)
const STAGGER = 0.22                 // +0.22s por columna

// SVG paths inline para usar via innerHTML (no podemos usar renderToStaticMarkup
// porque importar react-dom/server en un client component rompe en el browser).
// Esto duplica los paths de SlotIcon.tsx pero es la unica forma de construir
// 75 tiles por giro sin pagar el costo de hidratar 75 React components.
const SYMBOL_SVG: Record<SymbolId, string> = {
  copa: '<svg viewBox="0 0 64 64" width="100%" height="100%" fill="currentColor" fill-rule="evenodd"><path d="M20 12H44V20C44 30 38.5 36 32 36C25.5 36 20 30 20 20Z M20 15C12 15 10 18.5 10 22C10 25.8 13.5 29 20 29V25.6C15.6 25.6 13.4 23.8 13.4 22C13.4 20 15.6 18.4 20 18.4Z M44 15C52 15 54 18.5 54 22C54 25.8 50.5 29 44 29V25.6C48.4 25.6 50.6 23.8 50.6 22C50.6 20 48.4 18.4 44 18.4Z M29 36H35V46H29Z M23 46H41L43.5 51H20.5Z M18 50.5H46V55H18Z"/></svg>',
  balon: '<svg viewBox="0 0 64 64" width="100%" height="100%"><circle cx="32" cy="32" r="20" fill="#F4F8FF"/><path d="M32 23.7 39.9 29.4 36.9 38.7 27.1 38.7 24.1 29.4Z" fill="#0B1020"/><path d="M32 23.7V12M39.9 29.4 51 25.8M36.9 38.7 43.8 48.2M27.1 38.7 20.2 48.2M24.1 29.4 13 25.8" stroke="#0B1020" stroke-width="2.6" stroke-linecap="round" fill="none"/><circle cx="32" cy="32" r="20" fill="none" stroke="#0B1020" stroke-width="1.8"/></svg>',
  botin: '<svg viewBox="0 0 64 64" width="100%" height="100%" fill="currentColor" fill-rule="evenodd"><path d="M11 36C11 29 15 24.5 23 24L25.3 12.7L30.7 13.5L29.7 23.7C31.4 25 33.2 25.5 35.8 25.8C43.8 26.6 48.8 29.5 49.8 34.7C50.2 36.9 48.5 38.5 46 38.5H14C12.5 38.5 11 37.5 11 36Z M16.1 41.5a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0Z M25.4 42a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0Z M34.7 42a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0Z M44.1 41.5a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0Z"/></svg>',
  arco: '<svg viewBox="0 0 64 64" width="100%" height="100%" fill="currentColor" fill-rule="evenodd"><path d="M11 51V17H53V51H49.5V20.5H14.5V51Z M24 21H26.5V49H24Z M37.5 21H40V49H37.5Z M15 33H49V35.5H15Z M27 41a5 5 0 1 0 10 0a5 5 0 1 0 -10 0Z"/></svg>',
  silbato: '<svg viewBox="0 0 64 64" width="100%" height="100%" fill="currentColor" fill-rule="evenodd"><path d="M11 27.5H26.74A13 13 0 1 1 26.74 40.5H11A3 3 0 0 1 8 37.5V30.5A3 3 0 0 1 11 27.5Z M40 30a4 4 0 1 0 0 8a4 4 0 1 0 0 -8Z M19 7a5 5 0 1 0 0 10a5 5 0 1 0 0 -10Z M19 12.5a2.4 2.4 0 1 0 0 4.8a2.4 2.4 0 1 0 0 -4.8Z"/></svg>',
  banderin: '<svg viewBox="0 0 64 64" width="100%" height="100%" fill="currentColor" fill-rule="evenodd"><path d="M28 9H31V53H28Z M31 11L52 18L31 25Z M22 53H42V56H22Z"/></svg>',
}
const ICONS_HTML = SYMBOL_SVG

function tileHTML(symId: SymbolId, trow?: number): string {
  const s = SYMBOLS_DATA[symId]
  const attr = trow != null ? ` data-trow="${trow}"` : ''
  return `<div class="slots-tile" data-sym="${symId}" style="--tcol:${s.tile};--tglow:${s.glow}"${attr}>
    <div class="slots-tile__icon" style="color:${s.ink}; filter: drop-shadow(0 2px 3px rgba(0,0,0,.28))">${ICONS_HTML[symId]}</div>
  </div>`
}

// Convierte el grid lineal del Server Action (row-major, 9 elementos) a la
// estructura [col][row] que el motor de rodillos necesita.
//   server[0..2] = fila 0
//   server[3..5] = fila 1
//   server[6..8] = fila 2
function gridToColRow(linear: string[]): SymbolId[][] {
  const out: SymbolId[][] = [[], [], []]
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) {
      out[c][r] = linear[r * 3 + c] as SymbolId
    }
  }
  return out
}

// Convierte winLines del server (array de filas linales tipo [0,1,2]) en
// numeros de fila (0,1,2) para el motor de animacion.
function winLinesToRows(winLines: number[][] | null | undefined): number[] {
  if (!winLines) return []
  return winLines.map(line => Math.floor(line[0] / 3))
}

// =====================================================================
// CSS — keyframes + clases especificas del motor. Lo inyectamos via
// dangerouslySetInnerHTML porque las animaciones usan custom properties
// (--tcol, --tglow, --pitch) que cambian por tile y no se pueden expresar
// limpio en Tailwind.
// =====================================================================
const SLOTS_CSS = `
.slots-root { --tile:104px; --gap:13px; --pitch:117px; --gold:#F4B740; }
@media (max-width:560px){ .slots-root { --tile:84px; --gap:11px; --pitch:95px; } }

.slots-machine { position:relative; margin:0 auto; width:max-content;
  background:linear-gradient(180deg, #0c1126, #0a0f22);
  border:1px solid var(--card-border, #26304F); border-radius:22px;
  padding:18px;
  box-shadow:inset 0 2px 30px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.02); }
.slots-machine.is-spinning { animation:slotsMachHum .42s ease-in-out infinite; }
.slots-machine.is-stop { animation:slotsMachThunk .26s cubic-bezier(.3,1.6,.5,1); }
@keyframes slotsMachHum { 0%,100% { transform:translateY(0); } 50% { transform:translateY(.6px); } }
@keyframes slotsMachThunk { 0% { transform:translateY(-2.5px) scale(1.006); } 100% { transform:translateY(0) scale(1); } }

.slots-reels { display:flex; gap:var(--gap); position:relative; z-index:1; }
.slots-reel { width:var(--tile); height:calc(var(--tile)*3 + var(--gap)*2); overflow:hidden; border-radius:14px; position:relative; }
.slots-reel::before, .slots-reel::after { content:''; position:absolute; left:0; right:0; height:34px; z-index:3; pointer-events:none; }
.slots-reel::before { top:0; background:linear-gradient(180deg, rgba(8,11,26,.92), transparent); }
.slots-reel::after { bottom:0; background:linear-gradient(0deg, rgba(8,11,26,.92), transparent); }
.slots-strip { display:flex; flex-direction:column; gap:var(--gap); will-change:transform; }
.slots-reel.blur .slots-strip { filter:blur(2.4px) brightness(1.08); }

.slots-tile { width:var(--tile); height:var(--tile); border-radius:18px; flex:0 0 auto;
  display:grid; place-items:center; position:relative; overflow:hidden;
  background:linear-gradient(157deg, color-mix(in oklab, var(--tcol) 90%, #fff 10%), color-mix(in oklab, var(--tcol) 72%, #000 28%));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), inset 0 -10px 22px rgba(0,0,0,.22), 0 4px 12px rgba(0,0,0,.28); }
.slots-tile::after { content:''; position:absolute; inset:0; background:radial-gradient(70% 55% at 50% 18%, rgba(255,255,255,.18), transparent 70%); pointer-events:none; }
.slots-tile__icon { width:62%; height:62%; display:grid; place-items:center; position:relative; z-index:1; }
.slots-tile__icon svg { width:100%; height:100%; display:block; }

.slots-tile.win { animation:slotsTileWin .9s ease-in-out infinite; }
@keyframes slotsTileWin {
  0%,100% { box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 0 0 3px var(--tglow), 0 0 26px 4px color-mix(in oklab, var(--tglow) 80%, transparent); }
  50%     { box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 0 0 3px var(--tglow), 0 0 40px 10px color-mix(in oklab, var(--tglow) 95%, transparent); }
}
.slots-reels.dim .slots-tile:not(.win) { filter:saturate(.5) brightness(.62); transition:filter .3s; }

.slots-winline { position:absolute; left:10px; right:10px; z-index:4; height:5px; border-radius:99px; pointer-events:none;
  background:linear-gradient(90deg, transparent, var(--gold), #fff, var(--gold), transparent);
  box-shadow:0 0 16px 3px color-mix(in oklab, var(--gold) 75%, transparent);
  opacity:0; transform:scaleX(.2); transform-origin:center; }
.slots-winline.show { animation:slotsLineIn .5s cubic-bezier(.2,1.3,.4,1) forwards, slotsLineGlow 1.4s ease-in-out .5s infinite; }
@keyframes slotsLineIn { to { opacity:1; transform:scaleX(1); } }
@keyframes slotsLineGlow { 0%,100% { opacity:.85; } 50% { opacity:1; } }

.slots-fx { position:absolute; inset:0; z-index:6; pointer-events:none; overflow:visible; }
.slots-coin { position:absolute; left:50%; top:50%; width:22px; height:22px; margin:-11px 0 0 -11px; will-change:transform, opacity; }
.slots-coin svg { width:100%; height:100%; display:block; }
@keyframes slotsCoinFly {
  0%   { transform:translate(0,0) scale(.3) rotate(0deg); opacity:0; }
  12%  { opacity:1; }
  60%  { opacity:1; }
  100% { transform:translate(var(--cx), var(--cy)) scale(1) rotate(var(--cr)); opacity:0; }
}

.slots-btn { position:relative; white-space:nowrap; font-weight:800; letter-spacing:.01em;
  color:#0A0E22; padding:17px 54px; border:none; border-radius:16px; cursor:pointer;
  background:linear-gradient(135deg, color-mix(in oklab, var(--color-accent) 80%, white), var(--color-accent, #00E676));
  box-shadow:0 8px 26px color-mix(in oklab, var(--color-accent, #00E676) 50%, transparent), inset 0 1px 0 rgba(255,255,255,.4);
  transition:transform .08s ease, box-shadow .2s, filter .2s; font-size:18px; }
.slots-btn:hover { filter:brightness(1.05); }
.slots-btn:active { transform:translateY(2px) scale(.98); }
.slots-btn:disabled { cursor:not-allowed; filter:grayscale(.4) brightness(.8); box-shadow:none; }
.slots-btn.is-spinning { animation:slotsBtnPulse .5s ease-in-out infinite; }
@keyframes slotsBtnPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(.975); } }
`

const COIN_SVG = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#F4B740"/><circle cx="12" cy="12" r="11" fill="none" stroke="#C98A12" stroke-width="1.4"/><circle cx="12" cy="12" r="7.5" fill="none" stroke="#FFE7A8" stroke-width="1.3"/><path d="M12 7.5v9M9.6 9.7h3.6a1.7 1.7 0 0 1 0 3.4H10.5a1.7 1.7 0 0 0 0 3.4h3.9" stroke="#8A5A06" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`

interface ResultState {
  message: string
  subtitle: string
  isWin: boolean
}

export function SlotsGame({ credits }: { credits: number }) {
  const reelsRef = useRef<HTMLDivElement | null>(null)
  const machineRef = useRef<HTMLDivElement | null>(null)
  const fxRef = useRef<HTMLDivElement | null>(null)

  // Trackers de TODOS los timers para cleanup en unmount. Sin esto, si el user
  // navega afuera a mitad de giro, los setTimeout del stop kick + finish + las
  // monedas terminan llamando setState sobre un componente desmontado.
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([])
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<ResultState | null>(null)
  const [displayCredits, setDisplayCredits] = useState(credits)

  const clearAllTimers = () => {
    for (const t of timeoutsRef.current) clearTimeout(t)
    for (const iv of intervalsRef.current) clearInterval(iv)
    timeoutsRef.current = []
    intervalsRef.current = []
    if (spinTimerRef.current) {
      clearTimeout(spinTimerRef.current)
      spinTimerRef.current = null
    }
  }

  const pushTimeout = (id: ReturnType<typeof setTimeout>) => timeoutsRef.current.push(id)
  const pushInterval = (id: ReturnType<typeof setInterval>) => intervalsRef.current.push(id)

  // Build inicial: arma los 3 rodillos con tiles aleatorios estaticos.
  useEffect(() => {
    if (!reelsRef.current) return
    reelsRef.current.innerHTML = ''
    for (let c = 0; c < 3; c++) {
      const reel = document.createElement('div')
      reel.className = 'slots-reel'
      const strip = document.createElement('div')
      strip.className = 'slots-strip'
      let html = ''
      for (let r = 0; r < 3; r++) html += tileHTML(rndSym())
      strip.innerHTML = html
      strip.style.transform = 'translateY(0)'
      reel.appendChild(strip)
      reelsRef.current.appendChild(reel)
    }
    return () => clearAllTimers()
  }, [])

  // Sync del wallet display si el server cambio los creditos (revalidatePath
  // dispara este re-render). Solo sobrescribimos cuando NO estamos animando
  // un countUp — sino piso la animacion en curso.
  useEffect(() => {
    if (!spinning && intervalsRef.current.length === 0) {
      setDisplayCredits(credits)
    }
  }, [credits, spinning])

  const showWinline = (row: number, payoutTotal: number) => {
    if (!machineRef.current) return
    const machine = machineRef.current
    const tile = parseFloat(getComputedStyle(machine).getPropertyValue('--tile') || '104')
    const gap = parseFloat(getComputedStyle(machine).getPropertyValue('--gap') || '13')
    const pad = 18
    const y = pad + row * (tile + gap) + tile / 2 - 2.5
    const lineEl = document.createElement('div')
    lineEl.className = 'slots-winline'
    lineEl.style.top = y + 'px'
    machine.appendChild(lineEl)
    // Force reflow para que la transicion arranque correctamente
    void lineEl.offsetWidth
    lineEl.classList.add('show')
    // Marcamos solo el primer winline para usar payoutTotal en log/debug.
    if (payoutTotal === 0) lineEl.style.display = 'none'
  }

  const coinBurst = (total: number) => {
    if (!fxRef.current) return
    const fx = fxRef.current
    const n = Math.min(34, 14 + Math.round(Math.log10(total + 1) * 7))
    for (let i = 0; i < n; i++) {
      const coin = document.createElement('div')
      coin.className = 'slots-coin'
      coin.innerHTML = COIN_SVG
      const ang = Math.random() * Math.PI * 2
      const dist = 90 + Math.random() * 170
      const cx = Math.cos(ang) * dist
      const cy = Math.sin(ang) * dist - 60 // sesgo hacia arriba
      coin.style.setProperty('--cx', cx.toFixed(0) + 'px')
      coin.style.setProperty('--cy', cy.toFixed(0) + 'px')
      coin.style.setProperty('--cr', (Math.random() * 720 - 360).toFixed(0) + 'deg')
      const dur = 0.7 + Math.random() * 0.55
      coin.style.animation = `slotsCoinFly ${dur.toFixed(2)}s cubic-bezier(.2,.7,.3,1) ${(Math.random() * 0.12).toFixed(2)}s forwards`
      fx.appendChild(coin)
      pushTimeout(setTimeout(() => coin.remove(), (dur + 0.3) * 1000))
    }
  }

  const clearWinFx = () => {
    if (!reelsRef.current || !machineRef.current || !fxRef.current) return
    reelsRef.current.classList.remove('dim')
    reelsRef.current.querySelectorAll('.slots-tile.win').forEach(t => t.classList.remove('win'))
    machineRef.current.querySelectorAll('.slots-winline').forEach(l => l.remove())
    fxRef.current.innerHTML = ''
  }

  // Contador del wallet sin requestAnimationFrame. setInterval 16ms = ~60fps,
  // pero a diferencia de rAF NO se throttlea cuando la tab esta en background.
  // Fallback explicito al valor final cuando termina k=1.
  const countUp = (from: number, to: number, ms: number) => {
    const t0 = performance.now()
    const iv = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms)
      const eased = 1 - Math.pow(1 - k, 3)
      setDisplayCredits(Math.round(from + (to - from) * eased))
      if (k >= 1) {
        clearInterval(iv)
        setDisplayCredits(to)
        intervalsRef.current = intervalsRef.current.filter(x => x !== iv)
      }
    }, 16)
    pushInterval(iv)
  }

  const finishSpin = (
    targetColRow: SymbolId[][],
    winRows: number[],
    winSymbols: SymbolId[],
    payout: number,
    free: boolean,
  ) => {
    if (!machineRef.current || !reelsRef.current) return
    machineRef.current.classList.remove('is-spinning')
    setSpinning(false)

    if (winRows.length === 0) {
      setResult({
        message: free ? 'Giro gratis: sin premio.' : 'Sin premio. ¡Intentá de nuevo!',
        subtitle: '',
        isWin: false,
      })
      return
    }

    // Atenuamos tiles no ganadoras y resaltamos cada tile que pertenece a
    // alguna fila ganadora. Iteramos winRows para clonar la barra winline.
    reelsRef.current.classList.add('dim')
    const reels = reelsRef.current.children
    for (const row of winRows) {
      for (let c = 0; c < reels.length; c++) {
        const reel = reels[c] as HTMLElement
        const tile = reel.querySelector(`.slots-tile[data-trow="${row}"]`) as HTMLElement | null
        if (tile) tile.classList.add('win')
      }
      showWinline(row, payout)
    }
    coinBurst(payout)

    const subtitleParts = winSymbols.map(s => `${SYMBOLS_DATA[s].name} ×3`)
    const hasJackpot = winSymbols.includes('copa')
    const moneyLabel = `$${payout.toLocaleString('es-CL')}`
    setResult({
      message: hasJackpot ? `🏆 ¡JACKPOT! ¡Ganaste ${moneyLabel}!` : `¡Ganaste ${moneyLabel}!`,
      subtitle: subtitleParts.join(' · '),
      isWin: true,
    })

    countUp(displayCredits - (free ? 0 : 10), displayCredits - (free ? 0 : 10) + payout, 900)

    // Mantenemos referencia a targetColRow para evitar warnings de unused
    // (no se usa post-finishSpin pero el llamado a este func se queda).
    void targetColRow
  }

  const spin = async () => {
    if (spinning) return
    if (displayCredits < 10) {
      setResult({ message: 'Sin fichas suficientes', subtitle: '', isWin: false })
      return
    }
    if (!reelsRef.current || !machineRef.current) return

    clearWinFx()
    clearAllTimers()
    setResult({ message: 'Girando…', subtitle: '', isWin: false })
    setSpinning(true)
    machineRef.current.classList.add('is-spinning')

    // ARRANCAMOS LA ANIMACION INMEDIATAMENTE — el server resuelve en paralelo.
    // Empezamos con tiles aleatorios y un translate gigante que dura mucho.
    // Cuando llegue el resultado, paramos cada rodillo con su target real.
    const reels = Array.from(reelsRef.current.children) as HTMLElement[]
    reels.forEach(reel => {
      const strip = reel.firstElementChild as HTMLElement
      if (!strip) return
      let html = ''
      for (let i = 0; i < 30; i++) html += tileHTML(rndSym())
      strip.innerHTML = html
      strip.style.transition = 'none'
      strip.style.transform = 'translateY(0)'
      reel.classList.add('blur')
      void strip.offsetHeight
      // Pre-spin largo (10s) que SE VA A INTERRUMPIR cuando llegue el resultado.
      strip.style.transition = `transform 10s linear`
      strip.style.transform = `translateY(${-(30 - 3) * PITCH}px)`
    })

    // En paralelo, llamamos al server.
    let res: Awaited<ReturnType<typeof playSlots>>
    try {
      res = await playSlots()
    } catch (err) {
      setSpinning(false)
      reels.forEach(r => r.classList.remove('blur'))
      if (machineRef.current) machineRef.current.classList.remove('is-spinning')
      setResult({ message: 'Error de red. Reintentá.', subtitle: '', isWin: false })
      console.error('[SlotsGame] playSlots threw', err)
      return
    }

    if ('error' in res && res.error) {
      setSpinning(false)
      reels.forEach(r => r.classList.remove('blur'))
      if (machineRef.current) machineRef.current.classList.remove('is-spinning')
      setResult({ message: res.error, subtitle: '', isWin: false })
      return
    }
    if (!('grid' in res) || !res.grid) {
      setSpinning(false)
      reels.forEach(r => r.classList.remove('blur'))
      if (machineRef.current) machineRef.current.classList.remove('is-spinning')
      setResult({ message: 'Respuesta invalida del servidor', subtitle: '', isWin: false })
      return
    }

    const linearGrid = res.grid as string[]
    const target = gridToColRow(linearGrid)
    const winRows = winLinesToRows(res.winLines)
    const winSymbols = (res.winSymbols ?? []) as SymbolId[]
    const payout = res.payout ?? 0
    const free = res.free ?? false

    // Frenamos cada rodillo en su target con stagger (col 0 → 1 → 2).
    let maxDur = 0
    reels.forEach((reel, c) => {
      const strip = reel.firstElementChild as HTMLElement
      if (!strip) return

      let html = ''
      for (let i = 0; i < 3; i++) html += tileHTML(rndSym())
      for (let i = 0; i < FILLER; i++) html += tileHTML(rndSym())
      for (let r = 0; r < 3; r++) html += tileHTML(target[c][r], r) // target tiles con data-trow
      for (let i = 0; i < TRAIL; i++) html += tileHTML(rndSym())
      strip.innerHTML = html
      const targetIndex = 3 + FILLER
      const endY = -(targetIndex * PITCH)
      const dur = BASE_DUR + c * STAGGER
      maxDur = Math.max(maxDur, dur)

      // CRITICO: kick via reflow forzado. NO usar requestAnimationFrame.
      strip.style.transition = 'none'
      strip.style.transform = 'translateY(0)'
      reel.classList.add('blur')
      void strip.offsetHeight
      strip.style.transition = `transform ${dur}s ${EASE}`
      strip.style.transform = `translateY(${endY}px)`

      pushTimeout(setTimeout(() => reel.classList.remove('blur'), dur * 700))
      pushTimeout(setTimeout(() => {
        reel.classList.remove('blur')
        if (machineRef.current) {
          machineRef.current.classList.add('is-stop')
          pushTimeout(setTimeout(() => {
            if (machineRef.current) machineRef.current.classList.remove('is-stop')
          }, 260))
        }
      }, dur * 1000))
    })

    // Completar deterministico (independente de transitionend, que se throttlea).
    spinTimerRef.current = setTimeout(() => {
      finishSpin(target, winRows, winSymbols, payout, free)
      spinTimerRef.current = null
    }, maxDur * 1000 + 90)
  }

  return (
    <div className="slots-root space-y-5">
      <style dangerouslySetInnerHTML={{ __html: SLOTS_CSS }} />

      {/* Maquina */}
      <div className="flex justify-center">
        <div ref={machineRef} className="slots-machine">
          <div ref={reelsRef} className="slots-reels" />
          <div ref={fxRef} className="slots-fx" />
        </div>
      </div>

      {/* Result bar */}
      <div className={`mx-auto max-w-[520px] rounded-2xl border px-4 py-3 text-center transition-all ${
        result?.isWin
          ? 'border-[var(--casino-yellow)]/45 bg-[linear-gradient(160deg,rgba(244,183,64,.12),var(--sunken,#0E1428))]'
          : 'border-card-border bg-[var(--sunken,#0E1428)]'
      }`}>
        <p className={`text-sm font-semibold ${result?.isWin ? 'text-[var(--casino-yellow)] font-extrabold' : 'text-muted'}`}>
          {result?.message ?? 'Hacé clic en GIRAR para jugar.'}
        </p>
        {result?.subtitle && (
          <p className="mt-1 font-mono text-xs text-foreground">{result.subtitle}</p>
        )}
      </div>

      {/* Boton */}
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={spin}
          disabled={spinning}
          className={`slots-btn ${spinning ? 'is-spinning' : ''}`}
        >
          {spinning ? 'GIRANDO…' : 'GIRAR ($10)'}
        </button>
        <p className="text-xs text-subtle">
          1 giro gratis al día · Balance actual: <span className="font-mono text-accent-deep">${displayCredits.toLocaleString('es-CL')}</span>
        </p>
      </div>

      {/* Paytable */}
      <div className="mx-auto max-w-[520px]">
        <p className="text-center text-[10px] font-bold uppercase tracking-[.13em] text-subtle mb-3">
          Paga con 3 iguales en cualquier fila — pueden ganar las 3 filas a la vez
        </p>
        <div className="overflow-hidden rounded-xl border border-card-border">
          {IDS.map((id, i) => {
            const s = SYMBOLS_DATA[id]
            return (
              <div
                key={id}
                className={`flex items-center gap-3 px-4 py-2.5 ${
                  i % 2 === 0 ? 'bg-[var(--sunken,#0E1428)]' : 'bg-card'
                }`}
              >
                <div
                  className="grid h-7 w-7 place-items-center rounded-md"
                  style={{
                    background: `linear-gradient(157deg, color-mix(in oklab, ${s.tile} 90%, white 10%), color-mix(in oklab, ${s.tile} 70%, black 30%))`,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.25)',
                  }}
                >
                  <div className="h-[64%] w-[64%]" style={{ color: s.ink }}>
                    <SlotIcon id={id} className="w-full h-full" />
                  </div>
                </div>
                <span className={`text-sm font-semibold ${i === 0 ? 'text-strong' : 'text-foreground'}`}>{s.name}</span>
                <span className="font-mono text-xs text-subtle">×3</span>
                <span className={`ml-auto font-mono text-sm font-bold text-[var(--casino-yellow)] ${i === 0 ? 'drop-shadow-[0_0_14px_color-mix(in_oklab,var(--casino-yellow)_55%,transparent)]' : ''}`}>
                  ${s.pay.toLocaleString('es-CL')}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
