-- =====================================================================
-- place_parlay_atomic: re-valida matches DENTRO de la TX
-- =====================================================================
--
-- Antes: el TS pre-validaba cada leg fuera de la TX. Hay una ventana de ~100ms
-- donde un match puede pasar a 'finished' o 'cancelled' antes que la RPC commit.
-- Riesgo bajo en testing, real a escala: parlays insertados con legs sobre
-- partidos ya resueltos.
--
-- Fix: loop sobre los legs DENTRO de la RPC y SELECT status + starts_at de
-- cada match. Rechaza si:
--   - match no existe
--   - status IN ('finished', 'cancelled', 'live')
--   - lock cutoff (starts_at - 1h) ya pasó
--
-- Costo: N SELECTs adicionales por parlay (max 10 legs). Para uso interno con
-- pocos parlays/min, es despreciable comparado con la seguridad ganada.

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
  v_match_status text;
  v_match_starts timestamptz;
  v_lock_cutoff timestamptz;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'invalid_amount'::text;
    RETURN;
  END IF;
  IF p_total_odds IS NULL OR p_total_odds < 1.01 OR p_total_odds > 1000 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'invalid_total_odds'::text;
    RETURN;
  END IF;
  v_legs_count := jsonb_array_length(p_legs);
  IF v_legs_count < 2 OR v_legs_count > 10 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'invalid_legs_count'::text;
    RETURN;
  END IF;

  v_potential := ROUND((p_amount * p_total_odds)::numeric, 2);
  IF v_potential > 50000 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'payout_too_high'::text;
    RETURN;
  END IF;

  -- Validar cada leg DENTRO de la TX: match existe, no esta finished/cancelled/live,
  -- y todavia no pasó el lock cutoff. Defensa contra race entre TS pre-check y RPC.
  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs) LOOP
    v_match_id := (v_leg->>'match_id')::uuid;
    v_pick := v_leg->>'pick';

    -- Pick whitelist (defensa final, alineado con CHECK constraint en parlay_legs)
    IF v_pick NOT IN ('home', 'draw', 'away', '1', 'X', '2') THEN
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

  -- Debit + guard de saldo
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
