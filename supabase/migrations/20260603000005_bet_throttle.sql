-- =====================================================================
-- Rate limiting basico para placeBet / placeParlay
-- =====================================================================
--
-- Defensa contra:
--   - Doble-click accidental que dispara 2 RPCs concurrentes
--   - Scripts maliciosos (futuro: a 450 users) que spammean bets
--
-- Tabla bet_throttle: 1 row por user con timestamp de la ultima accion.
-- check_and_throttle() es atomica: hace SELECT FOR UPDATE + UPDATE en una TX.
-- Devuelve true si el user puede actuar, false si tiene que esperar.

BEGIN;

CREATE TABLE IF NOT EXISTS public.bet_throttle (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_action_at timestamp with time zone NOT NULL DEFAULT now(),
  count_5s int NOT NULL DEFAULT 0
);

-- RLS: solo service_role accede (la function corre con SECURITY DEFINER)
ALTER TABLE public.bet_throttle ENABLE ROW LEVEL SECURITY;

-- Function que checkea y actualiza atomicamente.
-- Devuelve OK (true) si han pasado >= p_min_gap_ms desde la ultima accion,
-- o si es la primera accion del user.
CREATE OR REPLACE FUNCTION public.check_bet_throttle(p_user_id uuid, p_min_gap_ms int DEFAULT 1000)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_last timestamp with time zone;
  v_now timestamp with time zone := clock_timestamp();
  v_gap_ms int;
BEGIN
  -- Lock + read
  SELECT last_action_at INTO v_last
    FROM public.bet_throttle
    WHERE user_id = p_user_id
    FOR UPDATE;

  IF v_last IS NULL THEN
    INSERT INTO public.bet_throttle (user_id, last_action_at)
      VALUES (p_user_id, v_now);
    RETURN true;
  END IF;

  v_gap_ms := EXTRACT(EPOCH FROM (v_now - v_last))::int * 1000;

  IF v_gap_ms < p_min_gap_ms THEN
    RETURN false;
  END IF;

  UPDATE public.bet_throttle
    SET last_action_at = v_now
    WHERE user_id = p_user_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_bet_throttle(uuid, int) TO service_role, authenticated;

COMMIT;
