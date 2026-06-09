import type { StandingRow } from '../queries'

interface Props {
  letter: string
  standings: StandingRow[]
}

/**
 * Tabla de posiciones de UN grupo. Las 2 primeras filas marcan los puestos
 * de clasificacion directa (verde). En Mundial 48 equipos los 8 mejores
 * terceros tambien pasan, pero eso lo decidimos cuando termine la fase
 * de grupos — no marcamos nada para el 3° por ahora.
 */
export function GroupTable({ letter, standings }: Props) {
  return (
    <div className="rounded-xl border border-card-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-card-border bg-sunken px-3 py-2">
        <h3 className="text-sm font-bold text-strong">Grupo {letter}</h3>
        <span className="text-[10px] uppercase tracking-wider text-subtle">FIFA 26</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-subtle">
            <th className="px-2 py-1.5 text-left font-semibold w-6">#</th>
            <th className="px-2 py-1.5 text-left font-semibold">Equipo</th>
            <th className="px-1.5 py-1.5 text-center font-mono font-semibold w-7">PJ</th>
            <th className="px-1.5 py-1.5 text-center font-mono font-semibold w-7">G</th>
            <th className="px-1.5 py-1.5 text-center font-mono font-semibold w-7">E</th>
            <th className="px-1.5 py-1.5 text-center font-mono font-semibold w-7">P</th>
            <th className="px-1.5 py-1.5 text-center font-mono font-semibold w-12">GF-C</th>
            <th className="px-2 py-1.5 text-right font-mono font-bold w-8 text-strong">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, i) => {
            const qualifies = i < 2
            return (
              <tr
                key={row.team.id}
                className={`border-t border-card-border ${
                  qualifies ? 'bg-win/5' : ''
                }`}
              >
                <td className="px-2 py-1.5 text-center">
                  <span
                    className={`inline-block h-5 w-5 rounded text-center font-bold leading-5 ${
                      qualifies ? 'bg-win/30 text-win' : 'text-subtle'
                    }`}
                  >
                    {i + 1}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className="text-base leading-none">{row.team.flag}</span>
                    <span className="font-medium text-foreground truncate">{row.team.name}</span>
                  </span>
                </td>
                <td className="px-1.5 py-1.5 text-center font-mono text-muted">{row.pj}</td>
                <td className="px-1.5 py-1.5 text-center font-mono text-muted">{row.g}</td>
                <td className="px-1.5 py-1.5 text-center font-mono text-muted">{row.e}</td>
                <td className="px-1.5 py-1.5 text-center font-mono text-muted">{row.p}</td>
                <td className="px-1.5 py-1.5 text-center font-mono text-muted">{row.gf}-{row.gc}</td>
                <td className="px-2 py-1.5 text-right font-mono font-bold text-strong">{row.pts}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
