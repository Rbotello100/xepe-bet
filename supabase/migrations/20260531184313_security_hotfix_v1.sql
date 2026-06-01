-- ============================================================================
-- Security hotfix v1 — 2026-05-31
-- ============================================================================
--
-- Cierra 8 vulnerabilidades críticas detectadas en el audit pre-deploy:
--
-- BLOCKERS:
--   1. add_credits_atomic / deduct_credits_atomic ejecutables por anon+auth
--      → cualquier user logueado se hace millonario con una RPC call
--   2. place_bet / resolve_match / cleanup_stale_casino_sessions ejecutables
--      por anon+auth → user puede resolver partidos, apostar en nombre de
--      otros, hacer DoS de casino sessions
--   3. Tablas legacy users / transactions / special_bets sin RLS
--      → cualquier user lee y escribe datos financieros de todos
--
-- HIGH:
--   4. ai_feed sin INSERT block → user puede insertar contenido fake
--   5. credit_transactions INSERT policy abierta al cliente
--      → audit trail corrompible desde el front
--
-- PERF (indexes faltantes, ALTO impacto a 450 users):
--   6. parlay_legs(parlay_id, match_id) — FK child sin índice
--   7. bets(status), parlays(status) — partial index para queries de pending
--   8. match_markets(match_id) — queried en cada place_bet
--   9. activity_feed(user_id) — feed por user
--
-- Es no destructivo: solo REVOKE + ENABLE RLS + CREATE POLICY + CREATE INDEX.
-- Idempotente: usa IF NOT EXISTS / DROP POLICY IF EXISTS.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Revocar RPCs de créditos y de legacy schema
-- ─────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.add_credits_atomic(uuid, numeric)    FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_credits_atomic(uuid, numeric) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.add_credits_atomic(uuid, numeric)    TO service_role;
GRANT  EXECUTE ON FUNCTION public.deduct_credits_atomic(uuid, numeric) TO service_role;

-- place_bet y resolve_match son legacy (apuntan a 'users' y 'transactions',
-- tablas viejas). El código actual no las usa. Quedan callable solo por
-- service_role para que un futuro fix manual pueda invocarlas si hace falta,
-- pero ningún usuario las puede llamar.
REVOKE ALL ON FUNCTION public.place_bet(uuid, uuid, text, numeric)             FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_match(uuid, text, integer, integer)       FROM anon, authenticated;

-- cleanup_stale_casino_sessions: si algún cron la llama, ese cron usa
-- service_role. Cerramos para PUBLIC.
REVOKE ALL ON FUNCTION public.cleanup_stale_casino_sessions() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cleanup_stale_casino_sessions() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Activar RLS en tablas legacy + bloquear todo acceso desde authenticated
--    (el código actual no las usa; solo queremos que dejen de estar abiertas)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_bets ENABLE ROW LEVEL SECURITY;

-- users: cada quien ve solo su propio row (legacy, pero por las dudas).
-- No INSERT/UPDATE/DELETE policy → bloqueado por default cuando RLS está on.
DROP POLICY IF EXISTS "users_own_select" ON public.users;
CREATE POLICY "users_own_select"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- transactions: cada quien ve sus propias transacciones (legacy).
DROP POLICY IF EXISTS "transactions_own_select" ON public.transactions;
CREATE POLICY "transactions_own_select"
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- special_bets: cada quien ve sus propios special bets.
DROP POLICY IF EXISTS "special_bets_own_select" ON public.special_bets;
CREATE POLICY "special_bets_own_select"
  ON public.special_bets
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- 3. ai_feed: bloquear INSERT desde clientes
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ai_feed_insert_block" ON public.ai_feed;
CREATE POLICY "ai_feed_insert_block"
  ON public.ai_feed
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. credit_transactions: cerrar INSERT desde clientes
--    (service_role bypasea RLS, así que el código server-side sigue
--    pudiendo escribir el audit trail)
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "credit_tx_insert" ON public.credit_transactions;
DROP POLICY IF EXISTS "credit_tx_insert_block" ON public.credit_transactions;
CREATE POLICY "credit_tx_insert_block"
  ON public.credit_transactions
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Índices críticos faltantes
-- ─────────────────────────────────────────────────────────────────────────

-- parlay_legs: FK child sin índice → ON DELETE CASCADE hace full scan
CREATE INDEX IF NOT EXISTS idx_parlay_legs_parlay_id ON public.parlay_legs(parlay_id);
CREATE INDEX IF NOT EXISTS idx_parlay_legs_match_id  ON public.parlay_legs(match_id);

-- bets / parlays: queries de leaderboard y resolución filtran por status='pending'
CREATE INDEX IF NOT EXISTS idx_bets_status_pending
  ON public.bets(status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_parlays_status_pending
  ON public.parlays(status)
  WHERE status = 'pending';

-- match_markets: read en cada place_bet
CREATE INDEX IF NOT EXISTS idx_match_markets_match_id ON public.match_markets(match_id);

-- activity_feed: feed filtrado por user_id
CREATE INDEX IF NOT EXISTS idx_activity_feed_user_id ON public.activity_feed(user_id);

-- credit_transactions: queries de audit por tipo + tiempo
CREATE INDEX IF NOT EXISTS idx_credit_tx_type_created
  ON public.credit_transactions(type, created_at DESC);

COMMIT;

-- ============================================================================
-- Post-aplicación: verificar manualmente con estas queries
-- ============================================================================
--
-- 1. Confirmar que los grants peligrosos están cerrados:
--    SELECT routine_name, grantee, privilege_type
--      FROM information_schema.routine_privileges
--      WHERE routine_schema = 'public'
--        AND routine_name IN ('add_credits_atomic','deduct_credits_atomic',
--                             'place_bet','resolve_match','cleanup_stale_casino_sessions')
--        AND grantee IN ('anon','authenticated');
--    → debe devolver 0 rows
--
-- 2. Confirmar RLS en las 3 tablas legacy:
--    SELECT tablename, rowsecurity FROM pg_tables
--      WHERE schemaname='public' AND tablename IN ('users','transactions','special_bets');
--    → rowsecurity = true en las 3
--
-- 3. Confirmar policies nuevas:
--    SELECT schemaname, tablename, policyname FROM pg_policies
--      WHERE schemaname='public'
--        AND policyname IN ('users_own_select','transactions_own_select',
--                            'special_bets_own_select','ai_feed_insert_block',
--                            'credit_tx_insert_block');
--    → 5 rows
--
-- 4. Confirmar índices nuevos:
--    SELECT indexname FROM pg_indexes
--      WHERE schemaname='public'
--        AND indexname LIKE 'idx_%' AND indexname IN (
--          'idx_parlay_legs_parlay_id','idx_parlay_legs_match_id',
--          'idx_bets_status_pending','idx_parlays_status_pending',
--          'idx_match_markets_match_id','idx_activity_feed_user_id',
--          'idx_credit_tx_type_created'
--        );
--    → 7 rows
-- ============================================================================
