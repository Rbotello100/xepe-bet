-- =====================================================================
-- Audit fix: registrar credit_transaction de tipo 'signup' al crear profile
-- =====================================================================
--
-- Contexto: hasta hoy, handle_new_user() seteaba profiles.credits=1000 pero
-- NO insertaba la transaccion correspondiente. Resultado:
--   SUM(credit_transactions) NO = profiles.credits para reconstruir desde signup.
-- Hueco de auditoria — el balance era correcto pero el ledger incompleto.
--
-- Fix:
--   1. Actualizar el trigger handle_new_user para que tambien inserte la tx
--   2. Backfill: insertar una row signup para cada profile existente que no
--      la tenga (idempotente por UNIQUE constraint del fix P0).

BEGIN;

-- 1) Reemplazar el trigger
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, credits, total_points, is_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email, 'Usuario'),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NULL),
    1000,
    0,
    FALSE
  );

  -- Audit trail del saldo inicial. balance_after = 1000 (sin transacciones previas).
  -- reference_id = user.id para que el UNIQUE partial index (user_id, type, reference_id)
  -- impida duplicados si el trigger se dispara dos veces por algun motivo.
  INSERT INTO public.credit_transactions (user_id, type, amount, balance_after, description, reference_id)
  VALUES (NEW.id, 'signup', 1000, 1000, 'Saldo inicial de bienvenida', NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user failed: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

-- 2) Backfill para profiles sin signup tx existentes.
-- Calcula balance_after como sum de TODAS las transacciones del user + 1000,
-- para que el cierre del ledger refleje un punto historico consistente
-- (balance teorico al momento del signup).
INSERT INTO public.credit_transactions (user_id, type, amount, balance_after, description, reference_id, created_at)
SELECT
  p.id,
  'signup',
  1000,
  1000,
  'Saldo inicial de bienvenida (backfill)',
  p.id,
  COALESCE(p.created_at, now())
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.credit_transactions ct
  WHERE ct.user_id = p.id AND ct.type = 'signup'
);

COMMIT;
