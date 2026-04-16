-- =============================================
-- Migration: Premier League demo matches
-- Purpose: Add 6 EPL teams and 3 matches with odds, so users can
--          actually bet in the demo before the World Cup starts.
-- Group 'X' = "Extra / Demo" (non-World-Cup matches).
-- Idempotent: safe to re-run.
-- =============================================

BEGIN;

-- 6 EPL teams (group 'X' = demo)
-- Using 3-letter codes that won't clash with FIFA codes
INSERT INTO teams (name, fifa_code, flag, group_name) VALUES
  ('Manchester United', 'MUN', '🔴', 'X'),
  ('Liverpool',         'LIV', '🔴', 'X'),
  ('Arsenal',           'ARS', '🔴', 'X'),
  ('Chelsea',           'CHE', '🔵', 'X'),
  ('Manchester City',   'MCI', '🔵', 'X'),
  ('Tottenham',         'TOT', '⚪', 'X')
ON CONFLICT (fifa_code) DO UPDATE
  SET name = EXCLUDED.name, flag = EXCLUDED.flag, group_name = EXCLUDED.group_name;

-- 3 EPL matches with odds in the next 2–4 days, status 'open' (bettable)
-- Clean up any previous demo matches first (idempotent)
DELETE FROM matches WHERE group_name = 'X';

INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status, odds_home, odds_draw, odds_away, odds_updated_at)
SELECT t1.id, t2.id, 'X', 'group', now() + interval '2 days' + interval '18 hours', 'open', 2.10, 3.40, 3.30, now()
FROM teams t1, teams t2 WHERE t1.fifa_code = 'MCI' AND t2.fifa_code = 'LIV';

INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status, odds_home, odds_draw, odds_away, odds_updated_at)
SELECT t1.id, t2.id, 'X', 'group', now() + interval '3 days' + interval '20 hours', 'open', 1.85, 3.60, 4.00, now()
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ARS' AND t2.fifa_code = 'CHE';

INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status, odds_home, odds_draw, odds_away, odds_updated_at)
SELECT t1.id, t2.id, 'X', 'group', now() + interval '4 days' + interval '16 hours', 'open', 2.50, 3.30, 2.70, now()
FROM teams t1, teams t2 WHERE t1.fifa_code = 'MUN' AND t2.fifa_code = 'TOT';

COMMIT;
