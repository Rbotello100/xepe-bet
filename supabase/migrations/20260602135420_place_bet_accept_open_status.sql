-- =====================================================================
-- Fix place_bet_atomic — aceptar match.status='open' (post odds sync)
-- =====================================================================
--
-- BUG encontrado en smoke test post-launch (2026-06-02):
-- place_bet_atomic rechazaba con error_code='match_open' cualquier
-- match cuyo status fuera distinto de 'scheduled'/'upcoming'.
-- Cuando lib/sync/odds.ts sincroniza odds, marca el match como
-- status='open' (estado normal "listo para apostar"). Resultado:
-- TODOS los users veían "No se pudo crear apuesta" después del primer
-- sync de odds.
--
-- Fix: invertir la lógica — bloquear solo los status que NO se pueden
-- apostar (finished, cancelled, live). Cualquier otro status es valido.
-- Alineado con validateMatchOpen() en features/bets/actions.ts:20.
--
-- place_parlay_atomic NO tenía este bug (no re-valida match status —
-- delega al pre-check del TS). cashout_bet_atomic tampoco (solo valida
-- bet.status='pending').
-- =====================================================================

CREATE OR REPLACE FUNCTION public.place_bet_atomic(
  p_user_id     uuid,
  p_match_id    uuid,
  p_market_type text,
  p_pick        text,
  p_amount      numeric,
  p_server_odds numeric
)
RETURNS TABLE (
  success           boolean,
  bet_id            uuid,
  potential_payout  numeric,
  new_balance       numeric,
  error_code        text
) AS $$
DECLARE
  v_new_balance     numeric;
  v_bet_id          uuid;
  v_potential       numeric;
  v_match_status    text;
  v_match_starts_at timestamptz;
  v_lock_at         timestamptz;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'invalid_amount'::text;
    RETURN;
  END IF;
  IF p_server_odds IS NULL OR p_server_odds < 1.01 OR p_server_odds > 1000 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'invalid_odds'::text;
    RETURN;
  END IF;

  SELECT status, starts_at INTO v_match_status, v_match_starts_at
    FROM public.matches WHERE id = p_match_id;
  IF v_match_status IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'match_not_found'::text;
    RETURN;
  END IF;
  -- Bloquear solo los status que NO se pueden apostar.
  -- Estados validos: scheduled, upcoming, open (post odds sync), etc.
  IF v_match_status IN ('finished', 'cancelled', 'live') THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, ('match_' || v_match_status)::text;
    RETURN;
  END IF;
  v_lock_at := v_match_starts_at - interval '1 hour';
  IF now() >= v_lock_at THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'bets_locked'::text;
    RETURN;
  END IF;

  UPDATE public.profiles
    SET credits = ROUND((credits - p_amount)::numeric, 2)
    WHERE id = p_user_id AND credits >= p_amount
    RETURNING credits INTO v_new_balance;
  IF v_new_balance IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'insufficient_credits'::text;
    RETURN;
  END IF;

  v_potential := ROUND((p_amount * p_server_odds)::numeric, 2);

  INSERT INTO public.bets (user_id, match_id, market_type, pick, amount, odds_at_placement, potential_payout)
    VALUES (p_user_id, p_match_id, p_market_type, p_pick, p_amount, p_server_odds, v_potential)
    RETURNING id INTO v_bet_id;

  INSERT INTO public.credit_transactions (user_id, amount, type, balance_after, reference_id, description)
    VALUES (p_user_id, -p_amount, 'bet', v_new_balance, v_bet_id,
            'Apuesta ' || p_pick || ' x' || p_server_odds);

  INSERT INTO public.activity_feed (user_id, action_type, description, metadata)
    VALUES (p_user_id, 'bet',
            'aposto $' || p_amount || ' a ' || p_pick || ' x' || p_server_odds,
            jsonb_build_object(
              'match_id', p_match_id,
              'amount', p_amount,
              'odds', p_server_odds,
              'market', p_market_type,
              'bet_id', v_bet_id
            ));

  RETURN QUERY SELECT true, v_bet_id, v_potential, v_new_balance, NULL::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
