import { BestBetWidget, type BestBet } from '@/features/bets/components/BestBetWidget'
import { BestParlayWidget, type BestParlay } from '@/features/bets/components/BestParlayWidget'
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
  bestParlay,
  worstBet,
  messages,
}: {
  bestBet: BestBet | null
  bestParlay: BestParlay | null
  worstBet: WorstBet | null
  messages: AIFeedPost[]
}) {
  return (
    <>
      {bestBet && <BestBetWidget bet={bestBet} />}
      {bestParlay && <BestParlayWidget parlay={bestParlay} />}
      {worstBet && <WorstBetWidget bet={worstBet} />}
      <Relator messages={messages} />
    </>
  )
}
