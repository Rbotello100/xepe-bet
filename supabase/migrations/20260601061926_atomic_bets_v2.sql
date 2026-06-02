-- =====================================================================
-- Atomic bets + credits v2 — 2026-06-01
-- =====================================================================
--
-- Cierra los 3 BLOCKERS del audit pre-launch de apuestas:
--
-- 1. placeBet hacía deduct → insert sin TX → crash en medio = plata perdida.
--    Fix: place_bet_atomic() hace TODO en 1 TX (debit + bet + audit + feed).
--
-- 2. add_credits_atomic / deduct_credits_atomic eran update + audit en
--    llamadas separadas (fire-and-forget). Si el INSERT al audit fallaba,
--    el balance cambiaba sin rastro.
--    Fix: reemplazo las RPCs por versiones que reciben type/description/ref
--    y hacen UPDATE + INSERT audit en la misma TX (PL/pgSQL = 1 TX).
--
-- 3. add_credits_atomic no tenía cap superior → un bug puede inflar balances
--    al infinito.
--    Fix: constants MAX_BALANCE=$1M y MAX_GRANT=$50K dentro de la función +
--    CHECK constraint en profiles como segunda capa.
--
-- También cubre 2 HIGHs:
-- 4. cashOutBet tenía el mismo problema que placeBet (UPDATE + addCredits
--    separados). Fix: cashout_bet_atomic() hace todo en 1 TX.
-- 5. placeParlay igual. Fix: place_parlay_atomic() hace parlay + legs +
--    debit + audit + feed en 1 TX.
--
-- IMPORTANTE: este migration ASUME que el código TS ya está adaptado para
-- las nuevas signatures. Aplicar SQL y deploy de TS deben ir juntos (o el
-- TS primero, que falla gracioso si las RPCs aún no existen).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Cap superior en profiles.credits (segunda capa de defensa)
-- ---------------------------------------------------------------------

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS credits_max_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT credits_max_check CHECK (credits <= 1000000);

-- ---------------------------------------------------------------------
-- 2. Reemplazar add_credits_atomic / deduct_credits_atomic
--    Nueva signature: (uid, amount, type, description, reference_id)
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.add_credits_atomic(uuid, numeric);
DROP FUNCTION IF EXISTS public.deduct_credits_atomic(uuid, numeric);

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
  MAX_BALANCE   CONSTANT numeric := 1000000;  -- $1M tope total
  MAX_GRANT     CONSTANT numeric := 50000;    -- $50K máximo por TX
BEGIN
  -- Validaciones de entrada
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > MAX_GRANT THEN
    RETURN QUERY SELECT false,
      COALESCE((SELECT credits FROM public.profiles WHERE id = p_user_id), 0::numeric);
    RETURN;
  END IF;

  -- UPDATE atomico con guard de balance máximo.
  -- El CHECK constraint también protege, pero el guard explícito nos da
  -- un error legible en vez de "constraint violation".
  UPDATE public.profiles
    SET credits = ROUND((credits + p_amount)::numeric, 2)
    WHERE id = p_user_id
      AND credits + p_amount <= MAX_BALANCE
    RETURNING credits INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    -- O el user no existe o el nuevo balance excede MAX_BALANCE
    RETURN QUERY SELECT false,
      COALESCE((SELECT credits FROM public.profiles WHERE id = p_user_id), 0::numeric);
    RETURN;
  END IF;

  -- Audit row en la MISMA TX. Si el INSERT falla por constraint
  -- (e.g. type inválido), toda la TX revierte → balance vuelve atrás.
  INSERT INTO public.credit_transactions (user_id, amount, type, balance_after, reference_id, description)
    VALUES (p_user_id, p_amount, p_type, v_new_balance, p_reference_id, p_description);

  RETURN QUERY SELECT true, v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


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
  MAX_DEDUCT    CONSTANT numeric := 50000;  -- $50K máximo por TX (mismo cap)
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > MAX_DEDUCT THEN
    RETURN QUERY SELECT false,
      COALESCE((SELECT credits FROM public.profiles WHERE id = p_user_id), 0::numeric);
    RETURN;
  END IF;

  -- UPDATE atomico con guard de saldo suficiente.
  UPDATE public.profiles
    SET credits = ROUND((credits - p_amount)::numeric, 2)
    WHERE id = p_user_id
      AND credits >= p_amount
    RETURNING credits INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    -- Saldo insuficiente o user inexistente
    RETURN QUERY SELECT false,
      COALESCE((SELECT credits FROM public.profiles WHERE id = p_user_id), 0::numeric);
    RETURN;
  END IF;

  -- Audit row en la MISMA TX. amount negativo para indicar débito.
  INSERT INTO public.credit_transactions (user_id, amount, type, balance_after, reference_id, description)
    VALUES (p_user_id, -p_amount, p_type, v_new_balance, p_reference_id, p_description);

  RETURN QUERY SELECT true, v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ---------------------------------------------------------------------
-- 3. place_bet_atomic — TODO en 1 TX
--    Valida match abierto + odds → debit → insert bet → audit → activity_feed
-- ---------------------------------------------------------------------

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
  -- Validaciones básicas
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'invalid_amount'::text;
    RETURN;
  END IF;
  IF p_server_odds IS NULL OR p_server_odds < 1.01 OR p_server_odds > 1000 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'invalid_odds'::text;
    RETURN;
  END IF;

  -- Re-validar match abierto dentro de la TX (snapshot del momento del commit)
  SELECT status, starts_at INTO v_match_status, v_match_starts_at
    FROM public.matches WHERE id = p_match_id;
  IF v_match_status IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'match_not_found'::text;
    RETURN;
  END IF;
  IF v_match_status <> 'scheduled' AND v_match_status <> 'upcoming' THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, ('match_' || v_match_status)::text;
    RETURN;
  END IF;
  -- BET_LOCK_HOURS = 1h antes del kickoff. Hardcoded acá para no depender de TS.
  v_lock_at := v_match_starts_at - interval '1 hour';
  IF now() >= v_lock_at THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'bets_locked'::text;
    RETURN;
  END IF;

  -- Debit + guard de saldo
  UPDATE public.profiles
    SET credits = ROUND((credits - p_amount)::numeric, 2)
    WHERE id = p_user_id AND credits >= p_amount
    RETURNING credits INTO v_new_balance;
  IF v_new_balance IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'insufficient_credits'::text;
    RETURN;
  END IF;

  -- Calcular payout con odds del server (no del cliente)
  v_potential := ROUND((p_amount * p_server_odds)::numeric, 2);

  -- Insertar bet
  INSERT INTO public.bets (user_id, match_id, market_type, pick, amount, odds_at_placement, potential_payout)
    VALUES (p_user_id, p_match_id, p_market_type, p_pick, p_amount, p_server_odds, v_potential)
    RETURNING id INTO v_bet_id;

  -- Audit en la MISMA TX
  INSERT INTO public.credit_transactions (user_id, amount, type, balance_after, reference_id, description)
    VALUES (p_user_id, -p_amount, 'bet', v_new_balance, v_bet_id,
            'Apuesta ' || p_pick || ' x' || p_server_odds);

  -- Activity feed (también en la TX, falla → revierte todo)
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


-- ---------------------------------------------------------------------
-- 4. cashout_bet_atomic — UPDATE bet + add credits + audit + feed en 1 TX
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cashout_bet_atomic(
  p_bet_id        uuid,
  p_user_id       uuid,
  p_cashout_value numeric
)
RETURNS TABLE (
  success     boolean,
  new_balance numeric,
  error_code  text
) AS $$
DECLARE
  v_new_balance numeric;
  v_updated     int;
BEGIN
  IF p_cashout_value IS NULL OR p_cashout_value <= 0 OR p_cashout_value > 50000 THEN
    RETURN QUERY SELECT false, NULL::numeric, 'invalid_cashout'::text;
    RETURN;
  END IF;

  -- Guard idempotente: solo procesa si la bet sigue 'pending' Y es del user.
  -- Si otro request ya cambió el status (settlement o cashout previo), UPDATE
  -- afecta 0 rows.
  UPDATE public.bets
    SET status = 'cashed_out',
        cash_out_amount = p_cashout_value,
        cashed_out_at = now()
    WHERE id = p_bet_id
      AND user_id = p_user_id
      AND status = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN QUERY SELECT false, NULL::numeric, 'bet_not_cashable'::text;
    RETURN;
  END IF;

  -- Add credits con cap implícito (UPDATE constraint se activa si pasa MAX)
  UPDATE public.profiles
    SET credits = ROUND((credits + p_cashout_value)::numeric, 2)
    WHERE id = p_user_id
      AND credits + p_cashout_value <= 1000000
    RETURNING credits INTO v_new_balance;
  IF v_new_balance IS NULL THEN
    -- Balance excedería el cap → revertir todo via exception
    RAISE EXCEPTION 'cashout_balance_overflow';
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, balance_after, reference_id, description)
    VALUES (p_user_id, p_cashout_value, 'cash_out', v_new_balance, p_bet_id,
            'Cash out $' || p_cashout_value);

  INSERT INTO public.activity_feed (user_id, action_type, description, metadata)
    VALUES (p_user_id, 'cash_out',
            'hizo cash out de $' || p_cashout_value,
            jsonb_build_object('bet_id', p_bet_id, 'cash_out_amount', p_cashout_value));

  RETURN QUERY SELECT true, v_new_balance, NULL::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ---------------------------------------------------------------------
-- 5. place_parlay_atomic — parlay + legs + debit + audit + feed en 1 TX
--    Recibe legs como JSONB array: [{match_id, market_type, pick, odds}, ...]
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.place_parlay_atomic(
  p_user_id     uuid,
  p_amount      numeric,
  p_total_odds  numeric,
  p_legs        jsonb  -- array de {match_id uuid, market_type text, pick text, odds numeric}
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
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'invalid_amount'::text;
    RETURN;
  END IF;
  IF p_total_odds IS NULL OR p_total_odds < 1.01 OR p_total_odds > 1000 THEN
    -- 1000 = MAX_PARLAY_ODDS (también validado en TS pero defensa en profundidad)
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
    -- MAX_PARLAY_PAYOUT — segunda capa de defensa
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'payout_too_high'::text;
    RETURN;
  END IF;

  -- Debit + guard de saldo
  UPDATE public.profiles
    SET credits = ROUND((credits - p_amount)::numeric, 2)
    WHERE id = p_user_id AND credits >= p_amount
    RETURNING credits INTO v_new_balance;
  IF v_new_balance IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::numeric, NULL::numeric, 'insufficient_credits'::text;
    RETURN;
  END IF;

  -- Insert parlay
  INSERT INTO public.parlays (user_id, amount, total_odds, potential_payout)
    VALUES (p_user_id, p_amount, p_total_odds, v_potential)
    RETURNING id INTO v_parlay_id;

  -- Insert legs desde el JSONB array
  INSERT INTO public.parlay_legs (parlay_id, match_id, market_type, pick, odds)
    SELECT
      v_parlay_id,
      (leg->>'match_id')::uuid,
      leg->>'market_type',
      leg->>'pick',
      (leg->>'odds')::numeric
    FROM jsonb_array_elements(p_legs) AS leg;

  -- Audit (mismo patrón)
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


-- ---------------------------------------------------------------------
-- 6. Grants — solo service_role (siguen el patrón del Security hotfix v1)
-- ---------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.add_credits_atomic(uuid, numeric, text, text, uuid)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_credits_atomic(uuid, numeric, text, text, uuid)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.place_bet_atomic(uuid, uuid, text, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cashout_bet_atomic(uuid, uuid, numeric)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.place_parlay_atomic(uuid, numeric, numeric, jsonb)         FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.add_credits_atomic(uuid, numeric, text, text, uuid)        TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_credits_atomic(uuid, numeric, text, text, uuid)     TO service_role;
GRANT EXECUTE ON FUNCTION public.place_bet_atomic(uuid, uuid, text, text, numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.cashout_bet_atomic(uuid, uuid, numeric)                    TO service_role;
GRANT EXECUTE ON FUNCTION public.place_parlay_atomic(uuid, numeric, numeric, jsonb)         TO service_role;

COMMIT;

-- =====================================================================
-- Verificación post-aplicación
-- =====================================================================
-- 1. Las RPCs nuevas existen y solo service_role tiene execute:
--    SELECT routine_name, grantee
--      FROM information_schema.routine_privileges
--      WHERE routine_schema='public'
--        AND routine_name IN ('place_bet_atomic','cashout_bet_atomic',
--                              'place_parlay_atomic','add_credits_atomic',
--                              'deduct_credits_atomic')
--      ORDER BY routine_name;
--
-- 2. CHECK constraint del balance:
--    SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--      WHERE conrelid='public.profiles'::regclass AND conname='credits_max_check';
--
-- 3. Smoke test del cap (debe rechazar):
--    SELECT * FROM add_credits_atomic('<test-uuid>', 999999, 'win', 'overflow test');
--    Esperado: success=false
--
-- 4. Smoke test de place_bet con saldo insuficiente:
--    SELECT * FROM place_bet_atomic('<test-uuid>', '<match-uuid>', '1x2', 'home', 99999, 2.5);
--    Esperado: success=false, error_code='insufficient_credits'
-- =====================================================================
