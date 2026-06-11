'use client'

import { useState } from 'react'
import { clsx } from 'clsx'
import { SlotsGame } from './SlotsGame'
import { PenaltyGame } from './PenaltyGame'
import { ScratchGame } from './ScratchGame'
import { MinesGame } from './MinesGame'
// Felipe: oculto del UI por decision de producto. El componente, las actions
// (placeFelipeBets/revealFelipe) y la tabla felipe_sessions quedan en el repo
// por si se reactiva. Para volver a habilitarlo: descomentar import + tab
// entry + render condicional, y cambiar default activeTab a 'felipe'.
// import { FelipeGame } from './FelipeGame'

const TABS = [
  // { key: 'felipe', label: '¿Donde esta Felipe?', icon: '🕵️' },
  { key: 'slots', label: 'Slots', icon: '🎰' },
  { key: 'mines', label: 'Cancha Minada', icon: '⚠️' },
  { key: 'penalty', label: 'Penales', icon: '⚽' },
  { key: 'scratch', label: 'Rasca', icon: '🎟️' },
] as const

interface CasinoTabsProps {
  credits: number
  userId: string
  /** Estado del gratis del dia por juego (calculado server-side en page.tsx). */
  slotsFree?: boolean
  minesFree?: boolean
  penaltyFree?: boolean
  scratchFree?: boolean
}

export function CasinoTabs({
  credits, userId,
  slotsFree = false, minesFree = false, penaltyFree = false, scratchFree = false,
}: CasinoTabsProps) {
  const [activeTab, setActiveTab] = useState<string>('slots')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-slate-800 p-1 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              'flex-1 rounded-lg py-2.5 px-2 text-xs sm:text-sm font-medium transition-all whitespace-nowrap',
              activeTab === tab.key
                ? 'bg-[var(--accent)] text-slate-900 shadow-[0_0_15px_rgba(0,230,118,0.4)]'
                : 'text-slate-400 hover:text-white'
            )}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* {activeTab === 'felipe' && <FelipeGame credits={credits} />} */}
      {activeTab === 'slots' && <SlotsGame credits={credits} freeSpin={slotsFree} />}
      {activeTab === 'mines' && <MinesGame freeStart={minesFree} userCredits={credits} />}
      {activeTab === 'penalty' && <PenaltyGame freeStart={penaltyFree} userCredits={credits} />}
      {activeTab === 'scratch' && <ScratchGame credits={credits} freeCard={scratchFree} />}
    </div>
  )
}
