import { Header } from '@/components/layout/Header'
import { getOptionalAuth } from '@/lib/auth'
import { PODIO_ENABLED } from '@/lib/constants'
import { getChampion, getPodioTop3 } from '@/features/podio/queries'

export const dynamic = 'force-dynamic'

export default async function PodioPage() {
  const auth = await getOptionalAuth()

  if (!PODIO_ENABLED) {
    return (
      <>
        <Header user={auth?.profile ?? null} active="/podio" />
        <div className="mx-auto max-w-2xl px-4 py-16">
          <div className="rounded-xl border border-card-border bg-card p-10 text-center">
            <p className="text-4xl">🏆</p>
            <p className="mt-3 text-lg font-bold text-strong">Próximamente</p>
            <p className="mt-1 text-sm text-muted">La final del Mundial se juega el domingo. Cuando termine, acá aparece el campeón + podio de Xepe Bet.</p>
          </div>
        </div>
      </>
    )
  }

  const [champion, top3] = await Promise.all([getChampion(), getPodioTop3()])

  return (
    <>
      <Header user={auth?.profile ?? null} active="/podio" />
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-10">

        {/* HERO CAMPEÓN DEL MUNDIAL */}
        <section className="relative overflow-hidden rounded-2xl border-2 border-[var(--casino-yellow)]/40 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--casino-yellow)_18%,var(--color-card)),var(--color-card)_60%)] p-10 text-center">
          {/* Confetti decorativo */}
          <div className="pointer-events-none absolute inset-0 opacity-30">
            <div className="absolute left-[8%] top-[10%] text-2xl">🎉</div>
            <div className="absolute right-[10%] top-[15%] text-2xl">✨</div>
            <div className="absolute left-[15%] bottom-[10%] text-xl">🎊</div>
            <div className="absolute right-[15%] bottom-[15%] text-2xl">⭐</div>
            <div className="absolute left-[45%] top-[5%] text-xl">🏆</div>
          </div>
          <div className="relative">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.25em] text-[var(--casino-yellow)]">
              Campeón del Mundo
            </p>
            <p className="text-6xl">🏆</p>
            {champion ? (
              <>
                <div className="mt-4 text-[9rem] leading-none">
                  {champion.team_flag ?? '⚽'}
                </div>
                <h1 className="mt-2 text-6xl font-black tracking-tight text-strong">
                  {champion.team_name.toUpperCase()}
                </h1>
                <p className="mt-4 text-sm text-muted">
                  Final: {champion.home_team} <span className="font-bold text-strong">{champion.home_score}</span> — <span className="font-bold text-strong">{champion.away_score}</span> {champion.away_team}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-[var(--casino-yellow)]/70">Mundial 2026 · Canada · Mexico · USA</p>
              </>
            ) : (
              <>
                <p className="mt-4 text-3xl font-bold text-subtle">Esperando la final...</p>
                <p className="mt-1 text-xs text-muted">Domingo 19-jul · Spain vs Argentina</p>
              </>
            )}
          </div>
        </section>

        {/* PODIO DE XEPE BET */}
        <section>
          <div className="mb-6 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-deep">Podio de Xepe Bet</p>
            <h2 className="mt-1 text-2xl font-extrabold text-strong">Los mejores del torneo</h2>
          </div>

          {top3.length >= 3 ? (
            <div className="grid grid-cols-3 gap-4 items-end">
              {/* 2do lugar (izquierda) */}
              <PodioSlot
                position={2}
                user={top3[1]}
                heightClass="h-40"
                medal="🥈"
                bgClass="bg-[linear-gradient(180deg,color-mix(in_oklab,#c0c0c0_25%,var(--color-card)),var(--color-card))]"
                borderClass="border-slate-400/50"
              />
              {/* 1er lugar (centro, más alto) */}
              <PodioSlot
                position={1}
                user={top3[0]}
                heightClass="h-56"
                medal="🥇"
                bgClass="bg-[linear-gradient(180deg,color-mix(in_oklab,var(--casino-yellow)_35%,var(--color-card)),var(--color-card))]"
                borderClass="border-[var(--casino-yellow)]/70"
                highlight
              />
              {/* 3er lugar (derecha) */}
              <PodioSlot
                position={3}
                user={top3[2]}
                heightClass="h-32"
                medal="🥉"
                bgClass="bg-[linear-gradient(180deg,color-mix(in_oklab,#cd7f32_25%,var(--color-card)),var(--color-card))]"
                borderClass="border-orange-700/50"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-card-border bg-card p-8 text-center">
              <p className="text-sm text-muted">Aún no hay suficientes usuarios en el ranking.</p>
            </div>
          )}
        </section>

        <p className="text-center text-[10px] text-subtle">
          Ranking por créditos acumulados · Xepe Bet 2026
        </p>
      </div>
    </>
  )
}

function PodioSlot({
  position,
  user,
  heightClass,
  medal,
  bgClass,
  borderClass,
  highlight,
}: {
  position: number
  user: { display_name: string; avatar_url: string | null; credits: number; total_points: number }
  heightClass: string
  medal: string
  bgClass: string
  borderClass: string
  highlight?: boolean
}) {
  const avatarSize = highlight ? 'h-32 w-32 sm:h-40 sm:w-40' : 'h-24 w-24 sm:h-28 sm:w-28'
  return (
    <div className="flex flex-col items-center">
      {/* Avatar + medalla */}
      <div className="relative mb-3">
        {user.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar_url}
            alt={user.display_name}
            className={`${avatarSize} rounded-full object-cover border-4 ${borderClass}`}
          />
        ) : (
          <div className={`${avatarSize} rounded-full ${bgClass} border-4 ${borderClass} grid place-items-center text-4xl font-black text-strong`}>
            {user.display_name[0]?.toUpperCase() ?? '?'}
          </div>
        )}
        <div className="absolute -top-2 -right-2 text-4xl drop-shadow-lg">{medal}</div>
      </div>

      {/* Nombre */}
      <p className={`text-center font-bold ${highlight ? 'text-lg text-strong' : 'text-sm text-foreground'}`}>
        {user.display_name}
      </p>
      <p className={`mt-0.5 text-center font-mono ${highlight ? 'text-base text-[var(--casino-yellow)] font-bold' : 'text-xs text-muted'}`}>
        ${user.credits.toLocaleString('es-CL')}
      </p>

      {/* Base del podio */}
      <div className={`mt-3 w-full ${heightClass} ${bgClass} border-2 ${borderClass} rounded-t-lg flex items-start justify-center pt-3`}>
        <span className={`font-black ${highlight ? 'text-6xl text-[var(--casino-yellow)]' : 'text-4xl text-subtle'}`}>
          {position}
        </span>
      </div>
    </div>
  )
}
