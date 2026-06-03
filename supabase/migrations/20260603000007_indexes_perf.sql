-- =====================================================================
-- Indexes de performance — encontrados en stress test HTTP
-- =====================================================================
--
-- 1. profiles(credits DESC) y profiles(total_points DESC):
--    getLeaderboard hace Seq Scan + top-N heapsort. Con 450 users sigue
--    OK pero a >5k empieza a doler. Index lo deja en O(log N).
--
-- 2. ai_feed metadata GIN:
--    El cron de templates filtra metadata->>'source' = 'template' para
--    no pisar los del cron de IA. Sin index es seq scan. GIN con jsonb_path_ops
--    es el patron recomendado de Supabase.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_profiles_credits_desc
  ON public.profiles (credits DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_total_points_desc
  ON public.profiles (total_points DESC);

-- GIN con jsonb_path_ops: mas chico y mas rapido que el default ops para
-- queries del tipo `metadata @> '{...}'`. Para `metadata->>'source' = X`
-- alcanza con el default, pero jsonb_path_ops cubre ambos.
CREATE INDEX IF NOT EXISTS idx_ai_feed_metadata_gin
  ON public.ai_feed
  USING gin (metadata jsonb_path_ops);

COMMIT;
