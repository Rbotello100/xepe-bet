-- =====================================================================
-- Reset pre-Mundial: $5000 de signup + limpiar TODO lo pendiente
-- =====================================================================
--
-- Limpia el estado de testing para arrancar el Mundial con piso parejo.
-- - Borra bets, parlays, casino sessions, trivia, predictions, feed, txs
-- - Resetea profiles.credits = 5000 y total_points = 0
-- - Inserta tx 'initial_reset' por user (mantiene balance == sum(ledger))
-- - Actualiza trigger handle_new_user: futuros signups reciben $5000
--
-- IDEMPOTENTE: si se corre dos veces, solo el primer DELETE encuentra
-- rows; el segundo es no-op. El INSERT del initial_reset tx tiene
-- ON CONFLICT DO NOTHING via reference_id = user_id (UNIQUE partial).
-- =====================================================================

BEGIN;

-- 1) Trigger handle_new_user — futuros signups con $5000
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_domain text;
  v_allowed boolean := false;
BEGIN
  v_domain := lower(split_part(NEW.email, '@', 2));

  IF v_domain IN ('xepelin.com', 'xepetest.local') THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Email domain % no permitido. Esta plataforma es solo para uso interno de Xepelin.', v_domain
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.profiles (id, display_name, avatar_url, credits, total_points, is_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email, 'Usuario'),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NULL),
    5000,
    0,
    FALSE
  );

  INSERT INTO public.credit_transactions (user_id, type, amount, balance_after, description, reference_id)
  VALUES (NEW.id, 'signup', 5000, 5000, 'Saldo inicial de bienvenida', NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user error: % %', SQLERRM, SQLSTATE;
  RAISE;
END;
$$;

-- 2) Clean slate de TODAS las tablas de juego/apuesta
-- Orden importa por FK: hijos antes que padres.
DELETE FROM public.parlay_legs;
DELETE FROM public.parlays;
DELETE FROM public.bets;
DELETE FROM public.mines_sessions;
DELETE FROM public.penalty_sessions;
DELETE FROM public.casino_sessions;
DELETE FROM public.felipe_sessions;
DELETE FROM public.trivia_answers;
DELETE FROM public.trivia_sessions;
DELETE FROM public.predictions;
DELETE FROM public.activity_feed;
DELETE FROM public.ai_feed;
DELETE FROM public.bet_throttle;
DELETE FROM public.relator_throttle;
DELETE FROM public.credit_transactions;

-- 3) Reset profiles: credits=5000, total_points=0
UPDATE public.profiles
SET credits = 5000,
    total_points = 0;

-- 4) Tx 'signup' por user — mantiene balance == sum(ledger)
-- Reusamos type='signup' porque el CHECK constraint solo acepta types fijos.
INSERT INTO public.credit_transactions (user_id, type, amount, balance_after, description, reference_id)
SELECT id, 'signup', 5000, 5000, 'Reset pre-Mundial: saldo inicial $5000', id
FROM public.profiles
ON CONFLICT DO NOTHING;

COMMIT;
