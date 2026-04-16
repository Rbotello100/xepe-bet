-- =============================================
-- Migration: AI Feed table
-- Purpose: Store AI-generated posts (relator de IA) shown on home.
-- Generated daily by a cron that calls Claude Haiku.
-- Idempotent: safe to re-run.
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS ai_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('summary', 'flash', 'analysis', 'trivia')),
  content TEXT NOT NULL,
  metadata JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_feed_active_created
  ON ai_feed (is_active, created_at DESC)
  WHERE is_active = true;

-- Anyone authenticated can read
ALTER TABLE ai_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_feed_read_all" ON ai_feed;
CREATE POLICY "ai_feed_read_all" ON ai_feed
  FOR SELECT
  USING (true);

-- Only service role writes (via the cron action)
DROP POLICY IF EXISTS "ai_feed_insert_service" ON ai_feed;
CREATE POLICY "ai_feed_insert_service" ON ai_feed
  FOR INSERT
  WITH CHECK (false); -- no direct inserts from client; admin client bypasses RLS

COMMIT;
