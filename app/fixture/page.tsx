import { Header } from '@/components/layout/Header'
import { getOptionalAuth } from '@/lib/auth'
import { getFixtureData } from '@/features/fixture/queries'
import { GroupTable } from '@/features/fixture/components/GroupTable'
import { Bracket } from '@/features/fixture/components/Bracket'

// Cada 60s — los standings cambian cuando termina un partido, no hace falta
// regenerar mas seguido. El cron sync-scores corre 1x/dia + Vercel cron, asi
// que en condiciones normales hay 0-1 cambio por hora.
export const revalidate = 60

export default async function FixturePage() {
  const auth = await getOptionalAuth()
  const fixture = await getFixtureData()
  const groups = [...fixture.groups.entries()]

  return (
    <>
      <Header user={auth?.profile ?? null} active="/fixture" />
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-8">

        {/* Header de pagina */}
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-strong">
            <span className="inline-block h-6 w-1.5 rounded-full bg-accent" />
            Cuadro del Mundial
          </h1>
          <p className="mt-1 text-sm text-muted">
            Tablas de grupos y eliminatorias. Solo visualización — los partidos para apostar están en{' '}
            <a href="/" className="text-accent-deep hover:underline">Partidos</a>.
          </p>
        </div>

        {/* Seccion 1: Grupos */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-accent-deep">
            Fase de grupos
          </h2>
          {groups.length === 0 ? (
            <div className="rounded-xl border border-card-border bg-card py-8 text-center text-sm text-subtle">
              Sin datos de grupos cargados todavía.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {groups.map(([letter, data]) => (
                <GroupTable
                  key={letter}
                  letter={letter}
                  standings={data.standings}
                />
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-subtle">
            <span className="inline-block h-2 w-2 rounded-sm bg-win/30 mr-1.5 align-middle" />
            Los 2 primeros de cada grupo clasifican directo. Los 8 mejores terceros también.
          </p>
        </section>

        {/* Seccion 2: Bracket */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-accent-deep">
            Eliminatorias
          </h2>
          <Bracket
            r32={fixture.knockout.r32}
            r16={fixture.knockout.r16}
            qf={fixture.knockout.qf}
            sf={fixture.knockout.sf}
            third={fixture.knockout.third}
            final={fixture.knockout.final}
          />
        </section>

      </div>
    </>
  )
}
