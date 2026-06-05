-- =============================================================
-- Atomic increment de total_points para profiles
-- =============================================================
--
-- Por que: lib/sync/scores.ts hacia SELECT total_points + UPDATE = X + N
-- en 2 statements separados. Si 2 matches del mismo user resuelven al
-- mismo tiempo (autoResolveMatch corre en paralelo Promise.all a nivel
-- match), ambos leen el balance viejo y la 2da escritura sobrescribe la
-- 1ra, perdiendo puntos.
--
-- Fix: 1 solo UPDATE atomico. Postgres serializa las escrituras al mismo
-- row con row-level lock implicito (FOR UPDATE en el WHERE).
-- =============================================================

CREATE OR REPLACE FUNCTION add_points(p_user_id uuid, p_amount int)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles
  SET total_points = COALESCE(total_points, 0) + p_amount
  WHERE id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION add_points(uuid, int) TO service_role;
