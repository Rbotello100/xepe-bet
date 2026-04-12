import { Header } from '@/components/layout/Header'
import { requireAuth } from '@/lib/auth'
import { ParlayPage } from '@/features/bets/components/ParlayPage'

export default async function ParlayRoute() {
  const { profile } = await requireAuth()

  return (
    <>
      <Header user={profile} />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-bold text-white mb-6">Parlay</h1>
        <ParlayPage credits={profile.credits} />
      </div>
    </>
  )
}
