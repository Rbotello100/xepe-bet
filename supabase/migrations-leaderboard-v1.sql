-- ==========================================================
-- Migration: Leaderboard v1
-- Aplicar UNA VEZ en Supabase SQL Editor (después de migrations-prod-v1.sql)
-- Crea la vista agregada para el leaderboard de casino (PnL + hit rate)
-- ==========================================================

CREATE OR REPLACE VIEW casino_pnl_leaderboard AS
SELECT
  cs.user_id,
  p.display_name,
  p.avatar_url,
  SUM(cs.net_amount)::numeric(10,2) AS total_pnl,
  COUNT(*)::int AS plays,
  COUNT(*) FILTER (WHERE cs.net_amount > 0)::int AS wins,
  ROUND(
    (COUNT(*) FILTER (WHERE cs.net_amount > 0)::numeric / NULLIF(COUNT(*), 0)) * 100,
    1
  ) AS hit_rate_pct
FROM casino_sessions cs
JOIN profiles p ON p.id = cs.user_id
WHERE cs.bet_amount > 0  -- excluye partidas gratis para que no inflen hit rate ni PnL
GROUP BY cs.user_id, p.display_name, p.avatar_url;

GRANT SELECT ON casino_pnl_leaderboard TO anon, authenticated;
