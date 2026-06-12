import { BestBetWidget, type BestBet } from '@/features/bets/components/BestBetWidget'
import { WorstBetWidget, type WorstBet } from '@/features/bets/components/WorstBetWidget'
import { Relator } from '@/components/relator/Relator'
import type { AIFeedPost } from '@/features/ai-feed/queries'

/**
 * Columna izquierda del shell.
 * Solo renderiza widgets si hay data real — bestBet=null → omite el card;
 * messages=[] → el Relator se omite a si mismo.
 */
export function LeftSidebar({
  bestBet,
  worstBet,
  messages,
}: {
  bestBet: BestBet | null
  worstBet: WorstBet | null
  messages: AIFeedPost[]
}) {
  return (
    <>
      {bestBet && <BestBetWidget bet={bestBet} />}
      {worstBet && <WorstBetWidget bet={worstBet} />}
      <Relator messages={messages} />
    </>
  )
}
