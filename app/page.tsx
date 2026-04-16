import { Suspense } from 'react'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { MatchList } from '@/features/matches/components/MatchList'
import { MatchCardSkeleton } from '@/components/ui/Skeleton'
import { getOptionalAuth } from '@/lib/auth'
import { getActiveFeedPosts } from '@/features/ai-feed/queries'
import { AIFeedWidget } from '@/features/ai-feed/components/AIFeedWidget'

export default async function HomePage() {
  const auth = await getOptionalAuth()
  const feedPosts = await getActiveFeedPosts(6)

  return (
    <>
      <Header user={auth?.profile ?? null} />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <HeroBanner />
        <AIFeedWidget posts={feedPosts} />
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span className="inline-block w-1 h-5 bg-[var(--accent)] rounded-full" />
          Próximos partidos
        </h2>
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
