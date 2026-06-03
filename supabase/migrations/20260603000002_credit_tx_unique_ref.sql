-- =====================================================================
-- Idempotency en credit_transactions via UNIQUE partial index
-- =====================================================================
--
-- Contexto: addCredits() insertaba sin chequear si ya existia una
-- transaccion con el mismo reference_id (ej. payout de un bet ganado).
-- Si autoResolveMatch o resolveMatch admin se llaman dos veces sobre
-- el mismo partido (re-trigger de cron, doble click del admin), se
-- pagaba doble al user.
--
-- Fix: UNIQUE constraint parcial sobre (user_id, type, reference_id)
-- WHERE reference_id IS NOT NULL. No rompe transacciones casino_*
-- ni signup que no setean reference_id (esas siguen permitiendo N rows).
--
-- Combinado con el check pre-RPC en lib/credits.ts::addCredits, esto
-- da double-safety: el TS chequea antes de la RPC, y el constraint
-- atrapa cualquier race-condition que escape el check.

BEGIN;

-- Sanity check: detectar duplicados existentes antes de crear el index.
DO $$
DECLARE
  v_dups int;
BEGIN
  SELECT COUNT(*) INTO v_dups FROM (
    SELECT user_id, type, reference_id, COUNT(*) c
    FROM public.credit_transactions
    WHERE reference_id IS NOT NULL
    GROUP BY user_id, type, reference_id
    HAVING COUNT(*) > 1
  ) d;

  IF v_dups > 0 THEN
    RAISE EXCEPTION 'Hay % combinaciones (user_id, type, reference_id) duplicadas. Limpia antes de aplicar.', v_dups;
  END IF;
END $$;

CREATE UNIQUE INDEX credit_transactions_user_type_ref_uniq
  ON public.credit_transactions (user_id, type, reference_id)
  WHERE reference_id IS NOT NULL;

COMMIT;
