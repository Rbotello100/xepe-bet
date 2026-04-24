-- =============================================
-- Admin Health Panel — v1
-- =============================================
-- 1. Tabla odds_api_usage: rastrea cada call a The Odds API
-- 2. Parlay status 'void': para cerrar parlays huérfanos con refund
-- =============================================

CREATE TABLE IF NOT EXISTS odds_api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL CHECK (endpoint IN ('odds', 'scores', 'events')),
  sport_key TEXT NOT NULL,
  credits_used INT NOT NULL DEFAULT 1,
  remaining INT,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('cron', 'admin_manual', 'import', 'test')),
  result_summary JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_odds_api_usage_created ON odds_api_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_odds_api_usage_endpoint ON odds_api_usage(endpoint, created_at DESC);

-- Solo admins pueden leer
ALTER TABLE odds_api_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "odds_api_usage_admin_read" ON odds_api_usage;
CREATE POLICY "odds_api_usage_admin_read" ON odds_api_usage
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- El service role (admin client) escribe sin restricciones, no hace falta policy de insert.

-- =============================================
-- Agregar 'void' como status válido para parlays y legs
-- =============================================
-- Usado para cerrar parlays huérfanos (sin legs) con refund al user.

ALTER TABLE parlays DROP CONSTRAINT IF EXISTS parlays_status_check;
ALTER TABLE parlays ADD CONSTRAINT parlays_status_check
  CHECK (status IN ('pending', 'won', 'lost', 'void'));

ALTER TABLE parlay_legs DROP CONSTRAINT IF EXISTS parlay_legs_status_check;
ALTER TABLE parlay_legs ADD CONSTRAINT parlay_legs_status_check
  CHECK (status IN ('pending', 'won', 'lost', 'void'));
