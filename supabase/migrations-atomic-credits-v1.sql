-- =============================================
-- Atomic credit operations — v1
-- =============================================
-- Reemplaza el patron SELECT + UPDATE no-atomico de lib/credits.ts por una
-- sola sentencia SQL. Elimina la race condition donde dos requests paralelos
-- leen el mismo balance y uno pisa al otro.
--
-- Uso desde TS:
--   const { data, error } = await admin.rpc('deduct_credits_atomic', {
--     p_user_id: userId, p_amount: amount
--   })
--   if (error) return { success: false, ... }
--   const result = data[0]  // { success, new_balance }
-- =============================================

CREATE OR REPLACE FUNCTION deduct_credits_atomic(
  p_user_id UUID,
  p_amount NUMERIC
)
RETURNS TABLE (success BOOLEAN, new_balance NUMERIC) AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  -- Rechazar montos invalidos
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT false, (SELECT credits FROM profiles WHERE id = p_user_id);
    RETURN;
  END IF;

  -- UPDATE atomico con guard de saldo: solo descuenta si hay suficiente.
  -- Postgres serializa updates sobre el mismo row -> cero race condition.
  UPDATE profiles
  SET credits = ROUND((credits - p_amount)::numeric, 2)
  WHERE id = p_user_id
    AND credits >= p_amount
  RETURNING credits INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    -- No se actualizo: o el user no existe o no tenia saldo
    RETURN QUERY SELECT false, COALESCE((SELECT credits FROM profiles WHERE id = p_user_id), 0::numeric);
  ELSE
    RETURN QUERY SELECT true, v_new_balance;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION add_credits_atomic(
  p_user_id UUID,
  p_amount NUMERIC
)
RETURNS TABLE (success BOOLEAN, new_balance NUMERIC) AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT false, (SELECT credits FROM profiles WHERE id = p_user_id);
    RETURN;
  END IF;

  UPDATE profiles
  SET credits = ROUND((credits + p_amount)::numeric, 2)
  WHERE id = p_user_id
  RETURNING credits INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric;
  ELSE
    RETURN QUERY SELECT true, v_new_balance;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permisos: solo service role (llamado desde server actions con admin client)
REVOKE ALL ON FUNCTION deduct_credits_atomic(UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION add_credits_atomic(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deduct_credits_atomic(UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION add_credits_atomic(UUID, NUMERIC) TO service_role;
