import { BestBetWidget, type BestBet } from '@/features/bets/components/BestBetWidget'
import { Relator } from '@/components/relator/Relator'
import type { AIFeedPost } from '@/features/ai-feed/queries'

/**
 * Columna izquierda del shell (sticky en >=lg).
 * Recibe data resuelta desde el page (Server Component padre) y la pasa al
 * Relator (Client Component).
 */
export function LeftSidebar({
  bestBet,
  messages,
}: {
  bestBet: BestBet
  messages: AIFeedPost[]
}) {
  return (
    <>
      <BestBetWidget bet={bestBet} />
      <Relator messages={messages} />
    </>
  )
}
