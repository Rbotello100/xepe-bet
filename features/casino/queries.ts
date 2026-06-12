import { createAdminClient } from '@/lib/supabase/admin'

const GAME_LABELS: Record<string, string> = {
  slots:   'Slots',
  mines:   'Cancha Minada',
  penalty: 'Penales',
  scratch: 'Rasca',
}

const GAME_ICONS: Record<string, string> = {
  slots:   '🎰',
  mines:   '⚠️',
  penalty: '⚽',
  scratch: '🎟️',
}

export interface CasinoLiveItem {
  id: string
  display_name: string
  avatar_url: string | null
  game: 'slots' | 'mines' | 'penalty' | 'scratch'
  gameLabel: string
  gameIcon: string
  bet: number
  net: number       // win - bet (positivo = ganó, negativo = perdió, 0 = empate)
  created_at: string
}

/**
 * Últimas N jugadas del casino de TODOS los users — widget "Apuestas" en /casino.
 * Trae nombre, avatar, juego, monto neto, hora. Ordenado por más reciente.
 */
export async function getLatestCasinoActivity(limit = 20): Promise<CasinoLiveItem[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('casino_sessions')
    .select(`
      id, user_id, game, bet_amount, win_amount, created_at,
      profile:profiles!user_id(display_name, avatar_url)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []

  type Row = {
    id: string
    user_id: string
    game: 'slots' | 'mines' | 'penalty' | 'scratch'
    bet_amount: number
    win_amount: number
    created_at: string
    profile: { display_name: string; avatar_url: string | null } | { display_name: string; avatar_url: string | null }[] | null
  }

  return (data as unknown as Row[]).map(r => {
    const p = Array.isArray(r.profile) ? r.profile[0] : r.profile
    const bet = Number(r.bet_amount)
    const win = Number(r.win_amount)
    return {
      id: r.id,
      display_name: p?.display_name ?? 'Anónimo',
      avatar_url: p?.avatar_url ?? null,
      game: r.game,
      gameLabel: GAME_LABELS[r.game] ?? r.game,
      gameIcon: GAME_ICONS[r.game] ?? '🎲',
      bet,
      net: win - bet,
      created_at: r.created_at,
    }
  })
}
