import { Suspense } from 'react'
import { Header } from '@/components/layout/Header'
import { MatchList } from '@/features/matches/components/MatchList'
import { MatchCardSkeleton } from '@/components/ui/Skeleton'
import { getOptionalAuth } from '@/lib/auth'

export default async function HomePage() {
  const auth = await getOptionalAuth()

  return (
    <>
      <Header user={auth?.profile ?? null} />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-bold text-white mb-6">Partidos</h1>
        <Suspense fallback={<MatchListSkeleton />}>
          <MatchList />
        </Suspense>
      </div>
    </>
  )
}

function MatchListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <MatchCardSkeleton key={i} />
      ))}
    </div>
  )
}
