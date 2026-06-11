-- =====================================================================
-- RPCs para el panel de observabilidad — calcular sums sin riesgo
-- de truncación a 1000 rows del SDK Supabase.
-- =====================================================================
--
-- Problema previo: getAlerts y getFinancialMetrics fetcheaban toda la
-- tabla credit_transactions y sumaban en TypeScript. El SDK Supabase
-- tiene un limit default de 1000 rows que silenciosamente truncaba el
-- array cuando habia +1000 tx. Resultado: ledger sub-calculado, alerta
-- falsa de descuadre.
--
-- Fix robusto: hacer la agregacion en SQL (no se trunca) y devolver
-- solo el resultado.
-- =====================================================================

-- 1) Users con descuadre balance vs ledger
CREATE OR REPLACE FUNCTION public.observability_balance_diffs()
RETURNS TABLE(
  user_id uuid,
  balance numeric,
  ledger numeric,
  diff numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    p.id as user_id,
    p.credits::numeric as balance,
    COALESCE(t.ledger, 0)::numeric as ledger,
    (p.credits - COALESCE(t.ledger, 0))::numeric as diff
  FROM profiles p
  LEFT JOIN (
    SELECT user_id, SUM(amount)::numeric as ledger
    FROM credit_transactions
    GROUP BY user_id
  ) t ON t.user_id = p.id
  WHERE ABS(p.credits - COALESCE(t.ledger, 0)) > 0.01;
$$;

-- 2) Totales globales (balance + ledger + diff)
CREATE OR REPLACE FUNCTION public.observability_financial_totals()
RETURNS TABLE(
  total_balance numeric,
  total_ledger numeric,
  diff numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    (SELECT COALESCE(SUM(credits), 0)::numeric FROM profiles),
    (SELECT COALESCE(SUM(amount), 0)::numeric FROM credit_transactions),
    (SELECT COALESCE(SUM(credits), 0)::numeric FROM profiles)
      - (SELECT COALESCE(SUM(amount), 0)::numeric FROM credit_transactions);
$$;

-- 3) Tx by type para las últimas 24h
CREATE OR REPLACE FUNCTION public.observability_tx_by_type(p_hours integer DEFAULT 24)
RETURNS TABLE(
  tx_type text,
  cnt bigint,
  total numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    type as tx_type,
    count(*) as cnt,
    COALESCE(SUM(amount), 0)::numeric as total
  FROM credit_transactions
  WHERE created_at >= now() - (p_hours || ' hours')::interval
  GROUP BY type
  ORDER BY total DESC;
$$;

REVOKE ALL ON FUNCTION public.observability_balance_diffs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.observability_financial_totals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.observability_tx_by_type FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.observability_balance_diffs TO service_role;
GRANT EXECUTE ON FUNCTION public.observability_financial_totals TO service_role;
GRANT EXECUTE ON FUNCTION public.observability_tx_by_type TO service_role;
