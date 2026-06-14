import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TriviaQuestion } from './types'

/**
 * Devuelve N preguntas aleatorias para el user, EXCLUYENDO las que ya respondió.
 * Via RPC `daily_trivia` que hace `ORDER BY random()` en SQL (aleatorio real)
 * y filtra contra trivia_answers para evitar repetir.
 *
 * Usa admin client porque la RPC esta granted solo a service_role (evita que
 * un user pueda enumerar las respuestas de otros pasando un p_user_id ajeno).
 */
export async function getDailyTrivia(userId: string, count = 5): Promise<TriviaQuestion[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('daily_trivia', {
    p_user_id: userId,
    p_count: count,
  })

  if (error || !data) return []
  return data as TriviaQuestion[]
}

export async function canPlayToday(userId: string): Promise<boolean> {
  const supabase = await createServerClient()
  // El UNIQUE INDEX `idx_trivia_one_per_day` esta definido como
  // (user_id, ((completed_at AT TIME ZONE 'UTC')::date)) — usa UTC IMMUTABLE.
  // Para que el chequeo TS calce con el index calculamos hoy/manana en UTC
  // y armamos el rango [today UTC midnight, tomorrow UTC midnight) explicito.
  // Antes hacia `toISOString().split('T')[0]` y comparaba con T00:00:00 sin TZ —
  // si la sesion DB estaba en otro TZ podia haber drift de 1 dia.
  const now = new Date()
  const todayUtcMidnight = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0,
  ))
  const tomorrowUtcMidnight = new Date(todayUtcMidnight.getTime() + 24 * 60 * 60 * 1000)

  const { count } = await supabase
    .from('trivia_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('completed_at', todayUtcMidnight.toISOString())
    .lt('completed_at', tomorrowUtcMidnight.toISOString())

  return (count ?? 0) === 0
}
