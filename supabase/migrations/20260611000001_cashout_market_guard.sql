-- =====================================================================
-- cashout_market_guard: defensa en profundidad para cashout_bet_atomic
-- =====================================================================
--
-- Contexto: cashout_bet_atomic es agnostica al market_type. El calculo
-- correcto del cashout_value depende de las odds del mercado especifico
-- (1X2 vienen de matches.odds_*, mercados extra de match_market_odds).
-- Hasta hoy la unica linea de defensa contra cashout-mal-calculado era
-- el guard server-side en features/bets/actions.ts::cashOutBet.
--
-- Esta migration agrega una segunda capa: la RPC ahora valida que el
-- bet.market_type este en la whitelist de mercados con cashout soportado.
-- Si alguien bypassea el Server Action y pega directo a la RPC, queda
-- bloqueado.
--
-- Whitelist de markets con cashout soportado:
--   - '1x2' (ya soportado)
--   - 'double_chance' / 'btts' / 'draw_no_bet' / 'totals_1.5/2.5/3.5'
--     soportados POST-migration cuando cashOutBet refactorizado lea de
--     match_market_odds. Por ahora la RPC los acepta — el guard de TS
--     decide el go/no-go final.
--
-- Si market_type es NULL (bet legacy sin market) tratamos como '1x2'
-- (compat con v1/v2). Si esta fuera del set, devuelve error_code
-- 'cashout_market_unsupported'.
-- =====================================================================

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
  v_new_balance  numeric;
  v_updated      int;
  v_market_type  text;
BEGIN
  IF p_cashout_value IS NULL OR p_cashout_value <= 0 OR p_cashout_value > 50000 THEN
    RETURN QUERY SELECT false, NULL::numeric, 'invalid_cashout'::text;
    RETURN;
  END IF;

  -- Defensa en profundidad: verificar que el market_type es de los que
  -- soportamos cashout. Lee la row y bloquea antes del UPDATE si no.
  SELECT market_type INTO v_market_type
    FROM public.bets
    WHERE id = p_bet_id AND user_id = p_user_id AND status = 'pending';

  IF NOT FOUND THEN
    -- Misma respuesta que el UPDATE-0-rows mas abajo, asi el cliente no
    -- distingue "no existe" de "ya no es pending".
    RETURN QUERY SELECT false, NULL::numeric, 'bet_not_cashable'::text;
    RETURN;
  END IF;

  IF v_market_type IS NOT NULL AND v_market_type NOT IN (
    '1x2', 'double_chance', 'btts', 'draw_no_bet',
    'totals_1.5', 'totals_2.5', 'totals_3.5'
  ) THEN
    RETURN QUERY SELECT false, NULL::numeric, 'cashout_market_unsupported'::text;
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

REVOKE ALL ON FUNCTION public.cashout_bet_atomic(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cashout_bet_atomic(uuid, uuid, numeric) TO service_role;
