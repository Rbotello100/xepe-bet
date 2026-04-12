import type { MatchWithTeams } from '@/lib/types'

export type MatchStatus = 'scheduled' | 'open' | 'live' | 'finished' | 'cancelled'

export interface MatchFilters {
  group?: string
  round?: string
  status?: MatchStatus
}

export function getMatchStatusLabel(status: MatchStatus): string {
  const labels: Record<MatchStatus, string> = {
    scheduled: 'Programado',
    open: 'Abierto',
    live: 'En vivo',
    finished: 'Finalizado',
    cancelled: 'Cancelado',
  }
  return labels[status]
}

export function getMatchStatusVariant(status: MatchStatus) {
  const variants = {
    scheduled: 'default',
    open: 'success',
    live: 'warning',
    finished: 'info',
    cancelled: 'danger',
  } as const
  return variants[status]
}

export function isMatchLocked(match: MatchWithTeams, lockHours: number): boolean {
  const lockTime = new Date(match.starts_at)
  lockTime.setHours(lockTime.getHours() - lockHours)
  return new Date() >= lockTime
}
