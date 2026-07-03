import type { MatchWithTeams } from '@/lib/types'
import { MatchSlot } from './MatchSlot'

interface Props {
  r32:   MatchWithTeams[]
  r16:   MatchWithTeams[]
  qf:    MatchWithTeams[]
  sf:    MatchWithTeams[]
  third: MatchWithTeams[]
  final: MatchWithTeams[]
}

/**
 * Bracket espejo estilo Qatar 2022.
 *
 *   R32(8) → R16(4) → QF(2) → SF(1) → | FINAL | ← SF(1) ← QF(2) ← R16(4) ← R32(8)
 *
 * Orden del bracket real WC 2026 hardcoded — la agenda cronologica FIFA
 * no coincide con el orden del bracket, asi que hay que mapear match by
 * match. Fuente: Wikipedia + CBS (confirmed durante R16, 2026-07-03).
 *
 * Slots 1-16 en R32:
 *   1-8:  rama izquierda (top-down)
 *   9-16: rama derecha (top-down)
 *
 * Slots 1-8 en R16:
 *   1-4:  izq   |   5-8: der
 */

// Cada tupla = [homeName, awayName] del bracket real. Orden invariante (WC 2026 draw).
const R32_BRACKET_ORDER: [string, string][] = [
  // Rama izquierda (top → bottom)
  ['South Africa', 'Canada'],           // 1 ┐
  ['Netherlands', 'Morocco'],           // 2 ┘ → R16 #1
  ['Germany', 'Paraguay'],              // 3 ┐
  ['France', 'Sweden'],                 // 4 ┘ → R16 #2
  ['Brazil', 'Japan'],                  // 5 ┐
  ['Ivory Coast', 'Norway'],            // 6 ┘ → R16 #3
  ['Mexico', 'Ecuador'],                // 7 ┐
  ['England', 'DR Congo'],              // 8 ┘ → R16 #4
  // Rama derecha (top → bottom)
  ['Portugal', 'Croatia'],              // 9 ┐
  ['Spain', 'Austria'],                 // 10 ┘ → R16 #5
  ['USA', 'Bosnia Herzegovina'],        // 11 ┐
  ['Belgium', 'Senegal'],               // 12 ┘ → R16 #6
  ['Argentina', 'Cape Verde'],          // 13 ┐
  ['Australia', 'Egypt'],               // 14 ┘ → R16 #7
  ['Switzerland', 'Algeria'],           // 15 ┐
  ['Colombia', 'Ghana'],                // 16 ┘ → R16 #8
]

const R16_BRACKET_ORDER: [string, string][] = [
  // izq
  ['Canada', 'Morocco'],                // 1
  ['Paraguay', 'France'],               // 2
  ['Brazil', 'Norway'],                 // 3
  ['Mexico', 'England'],                // 4
  // der
  ['Portugal', 'Spain'],                // 5
  ['USA', 'Belgium'],                   // 6
  // slot 7 (Arg/CV vs Aus/Egy) recien aparece cuando los 2 R32 se resuelvan
  ['Colombia', 'Ghana'],                // slot 8 aproximado (Switzerland vs Col/Gha)
]

/**
 * Ordena un array de matches segun el orden de referencia (por nombres).
 * Los que no matchean van al final por starts_at.
 */
function orderByBracket(matches: MatchWithTeams[], ref: [string, string][]): (MatchWithTeams | undefined)[] {
  const result: (MatchWithTeams | undefined)[] = new Array(ref.length).fill(undefined)
  const consumed = new Set<string>()

  ref.forEach(([t1, t2], i) => {
    const m = matches.find(mm => {
      const h = mm.home_team.name, a = mm.away_team.name
      return ((h === t1 && a === t2) || (h === t2 && a === t1)) && !consumed.has(mm.id)
    })
    if (m) { result[i] = m; consumed.add(m.id) }
  })

  // Overflow: matches no listados (nuevos torneos u otros) van al final por fecha.
  const leftover = matches.filter(m => !consumed.has(m.id)).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  for (const m of leftover) {
    const emptyIdx = result.findIndex(x => x === undefined)
    if (emptyIdx >= 0) result[emptyIdx] = m
  }
  return result
}

export function Bracket({ r32, r16, qf, sf, third, final }: Props) {
  const total = r32.length + r16.length + qf.length + sf.length + third.length + final.length
  if (total === 0) {
    return (
      <div className="rounded-xl border border-card-border bg-card py-10 text-center">
        <p className="text-2xl">🏆</p>
        <p className="mt-2 text-sm font-semibold text-strong">Eliminatorias aún no definidas</p>
        <p className="mt-1 text-xs text-subtle">
          Después del 27 de junio se definen los 32 clasificados y comienzan los Dieciseisavos.
        </p>
      </div>
    )
  }

  // R32 ordenado segun el bracket real (16 slots)
  const r32Ordered = orderByBracket(r32, R32_BRACKET_ORDER)
  const r32L = r32Ordered.slice(0, 8)
  const r32R = r32Ordered.slice(8, 16)

  // R16: mismo enfoque. slots 1-4 izq, 5-8 der.
  const r16Ordered = orderByBracket(r16, R16_BRACKET_ORDER.length === 8 ? R16_BRACKET_ORDER : [...R16_BRACKET_ORDER, ['?', '?'], ['?', '?']].slice(0, 8) as [string,string][])
  // Fallback: si aun no tenemos 8 R16, rellenamos con undefined
  const r16L = pad(r16Ordered.slice(0, Math.min(4, r16Ordered.length)), 4)
  const r16R = pad(r16Ordered.slice(4), 4)

  // QF/SF: como aun no existen partidos, ordenamos por starts_at
  const qfSorted = [...qf].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const sfSorted = [...sf].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const qfL = pad(qfSorted.slice(0, Math.ceil(qfSorted.length / 2)), 2)
  const qfR = pad(qfSorted.slice(Math.ceil(qfSorted.length / 2)), 2)
  const sfL = pad(sfSorted.slice(0, 1), 1)
  const sfR = pad(sfSorted.slice(1, 2), 1)

  return (
    <div className="rounded-xl border border-card-border bg-card p-3 overflow-x-auto">
      <div className="flex items-stretch gap-2 min-w-[1400px]">

        {/* ═══ RAMA IZQUIERDA ═══ */}
        <Column title="Dieciseisavos">
          {r32L.map((m, i) => <SlotBox key={'r32L-' + i} per={1}><MatchSlot match={m} /></SlotBox>)}
        </Column>
        <Column title="Octavos">
          {r16L.map((m, i) => <SlotBox key={'r16L-' + i} per={2}><MatchSlot match={m} /></SlotBox>)}
        </Column>
        <Column title="Cuartos">
          {qfL.map((m, i) => <SlotBox key={'qfL-' + i} per={4}><MatchSlot match={m} /></SlotBox>)}
        </Column>
        <Column title="Semis">
          {sfL.map((m, i) => <SlotBox key={'sfL-' + i} per={8}><MatchSlot match={m} /></SlotBox>)}
        </Column>

        {/* ═══ CENTRO ═══ */}
        <div className="flex w-[220px] shrink-0 flex-col items-center justify-center gap-4 px-1">
          <div className="w-full">
            <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wider text-[var(--casino-yellow)]">
              🏆 Final
            </p>
            <div className="rounded-lg border-2 border-[var(--casino-yellow)]/60 bg-[color-mix(in_oklab,var(--casino-yellow)_8%,var(--color-card))] p-1.5">
              <MatchSlot match={final[0]} />
            </div>
          </div>
          <div className="w-full">
            <p className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-subtle">3er puesto</p>
            <MatchSlot match={third[0]} />
          </div>
        </div>

        {/* ═══ RAMA DERECHA ═══ */}
        <Column title="Semis">
          {sfR.map((m, i) => <SlotBox key={'sfR-' + i} per={8}><MatchSlot match={m} /></SlotBox>)}
        </Column>
        <Column title="Cuartos">
          {qfR.map((m, i) => <SlotBox key={'qfR-' + i} per={4}><MatchSlot match={m} /></SlotBox>)}
        </Column>
        <Column title="Octavos">
          {r16R.map((m, i) => <SlotBox key={'r16R-' + i} per={2}><MatchSlot match={m} /></SlotBox>)}
        </Column>
        <Column title="Dieciseisavos">
          {r32R.map((m, i) => <SlotBox key={'r32R-' + i} per={1}><MatchSlot match={m} /></SlotBox>)}
        </Column>

      </div>
    </div>
  )
}

function pad<T>(arr: (T | undefined)[], n: number): (T | undefined)[] {
  const out = [...arr]
  while (out.length < n) out.push(undefined)
  return out
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex w-[150px] shrink-0 flex-col gap-0">
      <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-wider text-accent-deep">{title}</p>
      <div className="flex flex-1 flex-col justify-around">{children}</div>
    </div>
  )
}

function SlotBox({ per, children }: { per: number; children: React.ReactNode }) {
  const baseGap = 6
  const extraGap = (per - 1) * 68
  return (
    <div style={{ marginBottom: baseGap + extraGap, marginTop: extraGap / 2 }}>{children}</div>
  )
}
