-- =====================================================================
-- Sacar el limite de ganancia de parlays para arrancar la fase final del
-- Mundial 2026 (cuartos en adelante). Politica del user: "sin limite".
--
-- Cambios:
--   1. add_credits_atomic:     MAX_GRANT   50K → 10M,  MAX_BALANCE 1M → 100M
--   2. deduct_credits_atomic:  MAX_DEDUCT  50K → 10M
--   3. place_parlay_atomic:    tope payout 50K → 10M
--   4. cashout_bet_atomic:     tope 50K → 10M
--
-- Todos los caps quedan en 10M ("efectivamente ilimitado") como ceiling
-- defensivo contra bugs de cuota. Post-Mundial se pueden bajar de nuevo.
-- =====================================================================

-- 1) add_credits_atomic — recrear con caps ampliados
CREATE OR REPLACE FUNCTION public.add_credits_atomic(
  p_user_id      uuid,
  p_amount       numeric,
  p_type         text,
  p_description  text,
  p_reference_id uuid DEFAULT NULL
)
RETURNS TABLE (success boolean, new_balance numeric) AS $$
DECLARE
  v_new_balance numeric;
  MAX_BALANCE   CONSTANT numeric := 100000000;  -- $100M tope total
  MAX_GRANT     CONSTANT numeric := 10000000;   -- $10M maximo por TX
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > MAX_GRANT THEN
    RETURN QUERY SELECT false,
      COALESCE((SELECT credits FROM public.profiles WHERE id = p_user_id), 0::numeric);
    RETURN;
  END IF;

  -- Idempotency: si ya existe una tx con este reference_id+type+user, no re-acreditar
  IF p_reference_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE user_id = p_user_id AND reference_id = p_reference_id AND type = p_type
  ) THEN
    RETURN QUERY SELECT true, COALESCE((SELECT credits FROM public.profiles WHERE id = p_user_id), 0::numeric);
    RETURN;
  END IF;

  UPDATE public.profiles
    SET credits = ROUND((credits + p_amount)::numeric, 2)
    WHERE id = p_user_id AND (credits + p_amount) <= MAX_BALANCE
    RETURNING credits INTO v_new_balance;
  IF v_new_balance IS NULL THEN
    RETURN QUERY SELECT false, COALESCE((SELECT credits FROM public.profiles WHERE id = p_user_id), 0::numeric);
    RETURN;
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, balance_after, reference_id, description)
    VALUES (p_user_id, p_amount, p_type, v_new_balance, p_reference_id, p_description);

  RETURN QUERY SELECT true, v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2) deduct_credits_atomic — recrear con cap ampliado
CREATE OR REPLACE FUNCTION public.deduct_credits_atomic(
  p_user_id      uuid,
  p_amount       numeric,
  p_type         text,
  p_description  text,
  p_reference_id uuid DEFAULT NULL
)
RETURNS TABLE (success boolean, new_balance numeric) AS $$
DECLARE
  v_new_balance numeric;
  MAX_DEDUCT    CONSTANT numeric := 10000000;  -- $10M maximo por TX
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > MAX_DEDUCT THEN
    RETURN QUERY SELECT false,
      COALESCE((SELECT credits FROM public.profiles WHERE id = p_user_id), 0::numeric);
    RETURN;
  END IF;

  UPDATE public.profiles
    SET credits = ROUND((credits - p_amount)::numeric, 2)
    WHERE id = p_user_id AND credits >= p_amount
    RETURNING credits INTO v_new_balance;
  IF v_new_balance IS NULL THEN
    RETURN QUERY SELECT false, COALESCE((SELECT credits FROM public.profiles WHERE id = p_user_id), 0::numeric);
    RETURN;
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, balance_after, reference_id, description)
    VALUES (p_user_id, -p_amount, p_type, v_new_balance, p_reference_id, p_description);

  RETURN QUERY SELECT true, v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3) place_parlay_atomic — subir el cap de payout de 50K a 10M
-- (Solo cambia el IF v_potential > X; el resto de la funcion queda igual)
CREATE OR REPLACE FUNCTION public.place_parlay_atomic(
  p_user_id     uuid,
  p_amount      numeric,
  p_total_odds  numeric,
  p_legs        jsonb
)
RETURNS TABLE (
  success           boolean,
  parlay_id         uuid,
  potential_payout  numeric,
  new_balance       numeric,
  error_code        text
) AS $$
DECLARE
  v_new_balance numeric;
  v_parlay_id   uuid;
  v_potential   numeric;
  v_legs_count  int;
  v_leg         jsonb;
  v_match_id    uuid;
  v_pick        text;
  v_market      text;
  v_match_status text;
  v_match_starts timestamptz;
  v_lock_cutoff timestamptz;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'invalid_amount'::text;
    RETURN;
  END IF;
  IF p_total_odds IS NULL OR p_total_odds <= 1 OR p_total_odds > 1000 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'invalid_total_odds'::text;
    RETURN;
  END IF;

  v_legs_count := jsonb_array_length(p_legs);
  IF v_legs_count < 2 OR v_legs_count > 10 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'invalid_legs_count'::text;
    RETURN;
  END IF;

  v_potential := ROUND((p_amount * p_total_odds)::numeric, 2);
  IF v_potential > 10000000 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'payout_too_high'::text;
    RETURN;
  END IF;

  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs) LOOP
    v_match_id := (v_leg->>'match_id')::uuid;
    v_pick := v_leg->>'pick';
    v_market := v_leg->>'market_type';

    IF v_market NOT IN (
      '1x2','double_chance','btts','draw_no_bet',
      'totals_1.5','totals_2.5','totals_3.5',
      'spreads_1.5','spreads_2.5','spreads_3.5'
    ) THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'invalid_market'::text;
      RETURN;
    END IF;

    IF v_pick NOT IN (
      'home','draw','away','1','X','2',
      '1X','X2','12',
      'btts_yes','btts_no',
      'dnb_home','dnb_away',
      'over_1.5','under_1.5',
      'over_2.5','under_2.5',
      'over_3.5','under_3.5',
      'home_-1.5','home_+1.5','away_-1.5','away_+1.5',
      'home_-2.5','home_+2.5','away_-2.5','away_+2.5',
      'home_-3.5','home_+3.5','away_-3.5','away_+3.5'
    ) THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'invalid_pick'::text;
      RETURN;
    END IF;

    SELECT status, starts_at INTO v_match_status, v_match_starts
      FROM public.matches WHERE id = v_match_id;
    IF v_match_status IS NULL THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'match_not_found'::text;
      RETURN;
    END IF;
    IF v_match_status = 'finished' THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'match_finished'::text;
      RETURN;
    END IF;
    IF v_match_status = 'cancelled' THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'match_cancelled'::text;
      RETURN;
    END IF;
    IF v_match_status = 'live' THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'match_live'::text;
      RETURN;
    END IF;

    v_lock_cutoff := v_match_starts - interval '1 hour';
    IF now() >= v_lock_cutoff THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'bets_locked'::text;
      RETURN;
    END IF;
  END LOOP;

  UPDATE public.profiles
    SET credits = ROUND((credits - p_amount)::numeric, 2)
    WHERE id = p_user_id AND credits >= p_amount
    RETURNING credits INTO v_new_balance;
  IF v_new_balance IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'insufficient_credits'::text;
    RETURN;
  END IF;

  INSERT INTO public.parlays (user_id, amount, total_odds, potential_payout)
    VALUES (p_user_id, p_amount, p_total_odds, v_potential)
    RETURNING id INTO v_parlay_id;

  INSERT INTO public.parlay_legs (parlay_id, match_id, market_type, pick, odds)
    SELECT
      v_parlay_id,
      (leg->>'match_id')::uuid,
      leg->>'market_type',
      leg->>'pick',
      (leg->>'odds')::numeric
    FROM jsonb_array_elements(p_legs) AS leg;

  INSERT INTO public.credit_transactions (user_id, amount, type, balance_after, reference_id, description)
    VALUES (p_user_id, -p_amount, 'parlay', v_new_balance, v_parlay_id,
            'Parlay ' || v_legs_count || ' legs x' || p_total_odds);

  INSERT INTO public.activity_feed (user_id, action_type, description, metadata)
    VALUES (p_user_id, 'parlay',
            'creo un parlay de ' || v_legs_count || ' selecciones por $' || p_amount || ' (x' || p_total_odds || ')',
            jsonb_build_object(
              'parlay_id', v_parlay_id,
              'legs', v_legs_count,
              'total_odds', p_total_odds,
              'potential_payout', v_potential
            ));

  RETURN QUERY SELECT true, v_parlay_id, v_potential, v_new_balance, NULL::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
