-- Add sport_key column to matches so score sync knows which Odds API sport to query.
-- Background: matches previously had no sport association. import-league creates EPL/Liga matches,
-- seed-matches creates World Cup. Without sport_key the cron cannot fetch /scores correctly for multi-sport setups.

ALTER TABLE matches ADD COLUMN IF NOT EXISTS sport_key TEXT;

-- Backfill NULLs to the safe default (FIFA World Cup). If some existing matches are from EPL/other
-- imports, adjust manually after running this:
--   UPDATE matches SET sport_key = 'soccer_epl' WHERE external_id IN ('hash1','hash2',...);
UPDATE matches SET sport_key = 'soccer_fifa_world_cup' WHERE sport_key IS NULL;

ALTER TABLE matches ALTER COLUMN sport_key SET DEFAULT 'soccer_fifa_world_cup';
ALTER TABLE matches ALTER COLUMN sport_key SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_matches_sport_key_pending
  ON matches(sport_key)
  WHERE score_synced = FALSE AND status != 'finished';
