'use client'

import { useMemo } from 'react'

export function useMatchLock(startsAt: string, lockHours: number): boolean {
  return useMemo(() => {
    const lockTime = new Date(new Date(startsAt).getTime() - lockHours * 60 * 60 * 1000)
    return new Date() >= lockTime
  }, [startsAt, lockHours])
}
