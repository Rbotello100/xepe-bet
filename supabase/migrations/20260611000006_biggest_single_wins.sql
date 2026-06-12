-- =====================================================================
-- biggest_single_wins: top N ganancias individuales (casino + bets)
-- =====================================================================
--
-- Antes el widget "Biggest Single Win" del leaderboard solo leia de
-- casino_sessions, por lo que las wins de apuestas a partidos del Mundial
-- NO aparecian. Resultado: solo se veian partidas chicas de Penales/Slots.
--
-- Ahora une ambas fuentes:
--   - casino_sessions con win_amount > 0  (ganancia neta del casino)
--   - bets status='won' con potential_payout - amount  (ganancia neta de bet)
--
-- Ordenado por ganancia neta descendente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.biggest_single_wins(p_limit integer DEFAULT 5)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  net_win numeric,
  source text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public
AS $$
  (
    SELECT
      cs.user_id,
      p.display_name,
      p.avatar_url,
      cs.win_amount::numeric as net_win,
      cs.game::text as source
    FROM casino_sessions cs
    JOIN profiles p ON p.id = cs.user_id
    WHERE cs.win_amount > 0
  )
  UNION ALL
  (
    SELECT
      b.user_id,
      p.display_name,
      p.avatar_url,
      (b.potential_payout - b.amount)::numeric as net_win,
      'Apuesta'::text as source
    FROM bets b
    JOIN profiles p ON p.id = b.user_id
    WHERE b.status = 'won'
      AND b.potential_payout > b.amount  -- defensa: solo si hubo ganancia neta
  )
  ORDER BY net_win DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.biggest_single_wins FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.biggest_single_wins TO service_role;
