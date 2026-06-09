import type { MatchWithTeams } from '@/lib/types'

interface Props {
  match?: MatchWithTeams
  /** Label cuando aun no esta definido el partido (ej "1A vs 2B" en R32). */
  placeholder?: { home?: string; away?: string }
}

/**
 * Una celda del bracket. Tres estados visuales:
 *  - placeholder: matchup aun no definido (sin match en BD)
 *  - scheduled / open: matchup definido pero sin jugar — muestra "VS"
 *  - finished: scores con ganador resaltado
 *
 * El layout es compacto (180px ancho ~ 64px alto) para que el bracket
 * completo entre en la viewport sin scroll vertical.
 */
export function MatchSlot({ match, placeholder }: Props) {
  if (!match && !placeholder) {
    return (
      <div className="rounded-md border border-dashed border-card-border bg-card/40 px-2 py-2 text-center text-[10px] text-subtle min-h-[58px] flex items-center justify-center">
        Pendiente
      </div>
    )
  }

  if (!match && placeholder) {
    return (
      <div className="rounded-md border border-card-border bg-card/60 px-2 py-2 min-h-[58px]">
        <Row label={placeholder.home ?? '—'} score={null} winner={false} />
        <Row label={placeholder.away ?? '—'} score={null} winner={false} />
      </div>
    )
  }

  const m = match!
  const isFinished = m.status === 'finished' && m.home_score != null && m.away_score != null
  const homeWon = isFinished && m.home_score! > m.away_score!
  const awayWon = isFinished && m.away_score! > m.home_score!

  return (
    <div className="rounded-md border border-card-border bg-card px-2 py-2 min-h-[58px]">
      <Row
        label={`${m.home_team.flag} ${m.home_team.fifa_code || m.home_team.name}`}
        score={isFinished ? m.home_score : null}
        winner={homeWon}
      />
      <Row
        label={`${m.away_team.flag} ${m.away_team.fifa_code || m.away_team.name}`}
        score={isFinished ? m.away_score : null}
        winner={awayWon}
      />
    </div>
  )
}

function Row({ label, score, winner }: { label: string; score: number | null; winner: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-1 py-0.5 text-[11px] ${
        winner ? 'font-bold text-strong' : 'text-muted'
      }`}
    >
      <span className="truncate">{label}</span>
      <span className={`font-mono ${winner ? 'text-win' : 'text-subtle'}`}>
        {score ?? '—'}
      </span>
    </div>
  )
}
