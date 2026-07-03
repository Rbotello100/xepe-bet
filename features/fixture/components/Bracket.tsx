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
 * Bracket espejo estilo Qatar 2022. Layout:
 *
 *   DIECISEISAVOS  OCTAVOS  CUARTOS  SEMIS  |  FINAL  |  SEMIS  CUARTOS  OCTAVOS  DIECISEISAVOS
 *   ← rama izquierda (8+4+2+1)          → CENTRO ←         (1+2+4+8) rama derecha →
 *
 * La final queda en el medio, cada rama converge hacia el centro. Bajo la
 * final va el partido por el 3er puesto.
 *
 * Reparto de matches izq/der:
 *   - Cada ronda se ordena por starts_at asc.
 *   - Primera mitad → rama izquierda. Segunda mitad → rama derecha (invertida
 *     visualmente para que "crezca" hacia el centro).
 *   - Asumimos que la agenda FIFA respeta el orden del bracket dentro de cada
 *     ronda (Match #1 del bracket = primer horario, etc). Si algun WC agenda
 *     por otro criterio, agregamos una columna bracket_slot y sorteamos por
 *     eso — pero para el 2026 y el 2022 la asumcion se cumple.
 */
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

  // Ordenar por starts_at y partir en 2 mitades
  const byDate = (a: MatchWithTeams, b: MatchWithTeams) => a.starts_at.localeCompare(b.starts_at)
  const r32Sorted = [...r32].sort(byDate)
  const r16Sorted = [...r16].sort(byDate)
  const qfSorted  = [...qf].sort(byDate)
  const sfSorted  = [...sf].sort(byDate)

  const half = <T,>(arr: T[]): [T[], T[]] => {
    const mid = Math.ceil(arr.length / 2)
    return [arr.slice(0, mid), arr.slice(mid)]
  }
  const pad = <T,>(arr: T[], n: number): (T | undefined)[] => {
    const out: (T | undefined)[] = [...arr]
    while (out.length < n) out.push(undefined)
    return out
  }

  const [r32L, r32R] = half(r32Sorted)
  const [r16L, r16R] = half(r16Sorted)
  const [qfL, qfR]   = half(qfSorted)
  const [sfL, sfR]   = half(sfSorted)

  // Cada rama tiene tamaño fijo (8/4/2/1) para que los slots vacios aparezcan
  // como placeholders y el bracket se mantenga simetrico desde el inicio.
  const colR32L = pad(r32L, 8)
  const colR16L = pad(r16L, 4)
  const colQFL  = pad(qfL, 2)
  const colSFL  = pad(sfL, 1)
  const colR32R = pad(r32R, 8)
  const colR16R = pad(r16R, 4)
  const colQFR  = pad(qfR, 2)
  const colSFR  = pad(sfR, 1)

  return (
    <div className="rounded-xl border border-card-border bg-card p-3 overflow-x-auto">
      <div className="flex items-stretch gap-2 min-w-[1400px]">

        {/* ═══ RAMA IZQUIERDA ═══ */}
        <Column title="Dieciseisavos">
          {colR32L.map((m, i) => (
            <SlotBox key={'r32L-' + i} per={1}>
              <MatchSlot match={m} />
            </SlotBox>
          ))}
        </Column>

        <Column title="Octavos">
          {colR16L.map((m, i) => (
            <SlotBox key={'r16L-' + i} per={2}>
              <MatchSlot match={m} />
            </SlotBox>
          ))}
        </Column>

        <Column title="Cuartos">
          {colQFL.map((m, i) => (
            <SlotBox key={'qfL-' + i} per={4}>
              <MatchSlot match={m} />
            </SlotBox>
          ))}
        </Column>

        <Column title="Semis">
          {colSFL.map((m, i) => (
            <SlotBox key={'sfL-' + i} per={8}>
              <MatchSlot match={m} />
            </SlotBox>
          ))}
        </Column>

        {/* ═══ CENTRO: FINAL + 3P ═══ */}
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
            <p className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-subtle">
              3er puesto
            </p>
            <MatchSlot match={third[0]} />
          </div>
        </div>

        {/* ═══ RAMA DERECHA (columnas invertidas para converger al centro) ═══ */}
        <Column title="Semis">
          {colSFR.map((m, i) => (
            <SlotBox key={'sfR-' + i} per={8}>
              <MatchSlot match={m} />
            </SlotBox>
          ))}
        </Column>

        <Column title="Cuartos">
          {colQFR.map((m, i) => (
            <SlotBox key={'qfR-' + i} per={4}>
              <MatchSlot match={m} />
            </SlotBox>
          ))}
        </Column>

        <Column title="Octavos">
          {colR16R.map((m, i) => (
            <SlotBox key={'r16R-' + i} per={2}>
              <MatchSlot match={m} />
            </SlotBox>
          ))}
        </Column>

        <Column title="Dieciseisavos">
          {colR32R.map((m, i) => (
            <SlotBox key={'r32R-' + i} per={1}>
              <MatchSlot match={m} />
            </SlotBox>
          ))}
        </Column>

      </div>
    </div>
  )
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex w-[150px] shrink-0 flex-col gap-0">
      <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-wider text-accent-deep">
        {title}
      </p>
      <div className="flex flex-1 flex-col justify-around">
        {children}
      </div>
    </div>
  )
}

/**
 * `per` = cuantos slots R32 abarca este. R32=1 (base), R16=2, QF=4, SF=8.
 * Aumenta el margen vertical para que la fila se centre respecto al par de
 * la columna anterior.
 */
function SlotBox({ per, children }: { per: number; children: React.ReactNode }) {
  const baseGap = 6
  const extraGap = (per - 1) * 68
  return (
    <div style={{ marginBottom: baseGap + extraGap, marginTop: extraGap / 2 }}>
      {children}
    </div>
  )
}
