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
 * Bracket horizontal estilo Wikipedia. Layout:
 *   R32 (16 slots) | R16 (8) | QF (4) | SF (2) | Final (1)
 *
 * El R32 ocupa toda la altura (max). Cada columna siguiente tiene la mitad
 * de slots y el doble de gap para que el "centro" de cada par de matches
 * de la columna anterior alinee con la siguiente.
 *
 * Mostramos 16 slots fijos en R32 — si la API aun no devolvio los partidos,
 * los slots quedan vacios con "Pendiente" o un placeholder con seed.
 */
export function Bracket({ r32, r16, qf, sf, third, final }: Props) {
  // Si NO hay partidos en ninguna ronda, mostramos placeholder grande
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

  // Cada columna: array de length fijo (16, 8, 4, 2, 1). Si hay menos matches
  // que slots (porque aun no jugaron), rellenamos con `undefined`.
  const pad = <T,>(arr: T[], n: number): (T | undefined)[] => {
    const out: (T | undefined)[] = [...arr]
    while (out.length < n) out.push(undefined)
    return out
  }

  const col32 = pad(r32, 16)
  const col16 = pad(r16, 8)
  const colQF = pad(qf, 4)
  const colSF = pad(sf, 2)
  const colFinal = pad(final, 1)
  const col3p = pad(third, 1)

  return (
    <div className="rounded-xl border border-card-border bg-card p-3 overflow-x-auto">
      <div className="flex gap-3 min-w-[1100px]">

        <Column title="Dieciseisavos">
          {col32.map((m, i) => (
            <SlotBox key={'r32-' + i} idx={i} per={1}>
              <MatchSlot match={m} />
            </SlotBox>
          ))}
        </Column>

        <Column title="Octavos">
          {col16.map((m, i) => (
            <SlotBox key={'r16-' + i} idx={i} per={2}>
              <MatchSlot match={m} />
            </SlotBox>
          ))}
        </Column>

        <Column title="Cuartos">
          {colQF.map((m, i) => (
            <SlotBox key={'qf-' + i} idx={i} per={4}>
              <MatchSlot match={m} />
            </SlotBox>
          ))}
        </Column>

        <Column title="Semis">
          {colSF.map((m, i) => (
            <SlotBox key={'sf-' + i} idx={i} per={8}>
              <MatchSlot match={m} />
            </SlotBox>
          ))}
        </Column>

        <Column title="Final">
          <SlotBox idx={0} per={16}>
            <MatchSlot match={colFinal[0]} />
          </SlotBox>
        </Column>

        <Column title="3er puesto">
          <SlotBox idx={0} per={16}>
            <MatchSlot match={col3p[0]} />
          </SlotBox>
        </Column>

      </div>
    </div>
  )
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex w-[180px] flex-col gap-0">
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
 * Wrapper de cada slot que aplica padding-top/bottom segun la posicion para
 * que se alinee con el centro del par de la columna anterior. `per` = cada
 * cuantos R32 slots viene este. Para R32: per=1 (sin padding). Para R16:
 * per=2 (1.5x padding). Etc.
 */
function SlotBox({ idx, per, children }: { idx: number; per: number; children: React.ReactNode }) {
  // Altura base de un slot R32: ~62px + 8px de margen. La columna siguiente
  // debe alinearse al centro de 2 slots = ~70px aprox. Usamos margin-bottom
  // basico de 8px y aumentamos en columnas mas altas.
  const baseGap = 8
  const extraGap = (per - 1) * 70
  void idx
  return (
    <div style={{ marginBottom: baseGap + extraGap, marginTop: extraGap / 2 }}>
      {children}
    </div>
  )
}
