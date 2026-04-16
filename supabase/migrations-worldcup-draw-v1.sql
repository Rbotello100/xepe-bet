-- =============================================
-- Migration: World Cup 2026 Official Draw
-- Purpose: Replace placeholder teams and matches with the real draw
--          from December 5, 2025 (source: Wikipedia per-group pages)
--
-- WARNING: This migration DELETES all existing matches, teams, and
-- anything that references them (predictions, bets, parlay_legs,
-- match_markets). It is safe to run on a fresh DB or pre-launch DB.
-- If there are real user bets/predictions, DO NOT RUN blindly — dump
-- first and review.
--
-- Idempotent: can be re-run multiple times, always produces the same end state.
-- =============================================

BEGIN;

-- Nuke a
nything that references matches/teams
TRUNCATE TABLE
  match_markets,
  parlay_legs,
  bets,
  predictions,
  matches,
  teams
RESTART IDENTITY CASCADE;

-- ───────────────────────────────────────────────
-- 48 teams from the FIFA World Cup 2026 official draw (Dec 5, 2025)
-- ───────────────────────────────────────────────
INSERT INTO teams (name, fifa_code, flag, group_name) VALUES
-- Group A
('Mexico', 'MEX', '🇲🇽', 'A'),
('South Korea', 'KOR', '🇰🇷', 'A'),
('South Africa', 'RSA', '🇿🇦', 'A'),
('Czech Republic', 'CZE', '🇨🇿', 'A'),
-- Group B
('Canada', 'CAN', '🇨🇦', 'B'),
('Switzerland', 'SUI', '🇨🇭', 'B'),
('Qatar', 'QAT', '🇶🇦', 'B'),
('Bosnia Herzegovina', 'BIH', '🇧🇦', 'B'),
-- Group C
('Brazil', 'BRA', '🇧🇷', 'C'),
('Morocco', 'MAR', '🇲🇦', 'C'),
('Haiti', 'HAI', '🇭🇹', 'C'),
('Scotland', 'SCO', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'C'),
-- Group D
('United States', 'USA', '🇺🇸', 'D'),
('Paraguay', 'PAR', '🇵🇾', 'D'),
('Australia', 'AUS', '🇦🇺', 'D'),
('Turkiye', 'TUR', '🇹🇷', 'D'),
-- Group E
('Germany', 'GER', '🇩🇪', 'E'),
('Ecuador', 'ECU', '🇪🇨', 'E'),
('Cote d''Ivoire', 'CIV', '🇨🇮', 'E'),
('Curacao', 'CUW', '🇨🇼', 'E'),
-- Group F
('Netherlands', 'NED', '🇳🇱', 'F'),
('Japan', 'JPN', '🇯🇵', 'F'),
('Tunisia', 'TUN', '🇹🇳', 'F'),
('Sweden', 'SWE', '🇸🇪', 'F'),
-- Group G
('Belgium', 'BEL', '🇧🇪', 'G'),
('Egypt', 'EGY', '🇪🇬', 'G'),
('Iran', 'IRN', '🇮🇷', 'G'),
('New Zealand', 'NZL', '🇳🇿', 'G'),
-- Group H
('Spain', 'ESP', '🇪🇸', 'H'),
('Uruguay', 'URU', '🇺🇾', 'H'),
('Saudi Arabia', 'KSA', '🇸🇦', 'H'),
('Cabo Verde', 'CPV', '🇨🇻', 'H'),
-- Group I
('France', 'FRA', '🇫🇷', 'I'),
('Senegal', 'SEN', '🇸🇳', 'I'),
('Norway', 'NOR', '🇳🇴', 'I'),
('Iraq', 'IRQ', '🇮🇶', 'I'),
-- Group J
('Argentina', 'ARG', '🇦🇷', 'J'),
('Austria', 'AUT', '🇦🇹', 'J'),
('Algeria', 'ALG', '🇩🇿', 'J'),
('Jordan', 'JOR', '🇯🇴', 'J'),
-- Group K
('Portugal', 'POR', '🇵🇹', 'K'),
('Colombia', 'COL', '🇨🇴', 'K'),
('Uzbekistan', 'UZB', '🇺🇿', 'K'),
('DR Congo', 'COD', '🇨🇩', 'K'),
-- Group L
('England', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'L'),
('Croatia', 'CRO', '🇭🇷', 'L'),
('Ghana', 'GHA', '🇬🇭', 'L'),
('Panama', 'PAN', '🇵🇦', 'L');

-- ───────────────────────────────────────────────
-- 72 group stage matches (all times in UTC)
-- ───────────────────────────────────────────────
-- Group A
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-11 19:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'MEX' AND t2.fifa_code = 'RSA';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-12 02:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'KOR' AND t2.fifa_code = 'CZE';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-18 16:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CZE' AND t2.fifa_code = 'RSA';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-19 01:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'MEX' AND t2.fifa_code = 'KOR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-25 01:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CZE' AND t2.fifa_code = 'MEX';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-25 01:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'RSA' AND t2.fifa_code = 'KOR';

-- Group B
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'B', 'group', '2026-06-12 19:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CAN' AND t2.fifa_code = 'BIH';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'B', 'group', '2026-06-13 19:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'QAT' AND t2.fifa_code = 'SUI';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'B', 'group', '2026-06-18 19:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'SUI' AND t2.fifa_code = 'BIH';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'B', 'group', '2026-06-18 22:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CAN' AND t2.fifa_code = 'QAT';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'B', 'group', '2026-06-24 19:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'SUI' AND t2.fifa_code = 'CAN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'B', 'group', '2026-06-24 19:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'BIH' AND t2.fifa_code = 'QAT';

-- Group C
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'C', 'group', '2026-06-13 22:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'BRA' AND t2.fifa_code = 'MAR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'C', 'group', '2026-06-14 01:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'HAI' AND t2.fifa_code = 'SCO';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'C', 'group', '2026-06-19 22:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'SCO' AND t2.fifa_code = 'MAR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'C', 'group', '2026-06-20 00:30:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'BRA' AND t2.fifa_code = 'HAI';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'C', 'group', '2026-06-24 22:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'SCO' AND t2.fifa_code = 'BRA';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'C', 'group', '2026-06-24 22:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'MAR' AND t2.fifa_code = 'HAI';

-- Group D
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'D', 'group', '2026-06-13 01:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'USA' AND t2.fifa_code = 'PAR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'D', 'group', '2026-06-14 04:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'AUS' AND t2.fifa_code = 'TUR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'D', 'group', '2026-06-19 19:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'USA' AND t2.fifa_code = 'AUS';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'D', 'group', '2026-06-20 03:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'TUR' AND t2.fifa_code = 'PAR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'D', 'group', '2026-06-26 02:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'TUR' AND t2.fifa_code = 'USA';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'D', 'group', '2026-06-26 02:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'PAR' AND t2.fifa_code = 'AUS';

-- Group E
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'E', 'group', '2026-06-14 17:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'GER' AND t2.fifa_code = 'CUW';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'E', 'group', '2026-06-14 23:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CIV' AND t2.fifa_code = 'ECU';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'E', 'group', '2026-06-20 20:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'GER' AND t2.fifa_code = 'CIV';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'E', 'group', '2026-06-21 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ECU' AND t2.fifa_code = 'CUW';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'E', 'group', '2026-06-25 20:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CUW' AND t2.fifa_code = 'CIV';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'E', 'group', '2026-06-25 20:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ECU' AND t2.fifa_code = 'GER';

-- Group F
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'F', 'group', '2026-06-14 20:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'NED' AND t2.fifa_code = 'JPN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'F', 'group', '2026-06-15 02:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'SWE' AND t2.fifa_code = 'TUN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'F', 'group', '2026-06-20 17:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'NED' AND t2.fifa_code = 'SWE';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'F', 'group', '2026-06-21 04:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'TUN' AND t2.fifa_code = 'JPN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'F', 'group', '2026-06-25 23:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'JPN' AND t2.fifa_code = 'SWE';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'F', 'group', '2026-06-25 23:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'TUN' AND t2.fifa_code = 'NED';

-- Group G
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'G', 'group', '2026-06-15 19:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'BEL' AND t2.fifa_code = 'EGY';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'G', 'group', '2026-06-16 01:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'IRN' AND t2.fifa_code = 'NZL';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'G', 'group', '2026-06-21 19:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'BEL' AND t2.fifa_code = 'IRN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'G', 'group', '2026-06-22 01:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'NZL' AND t2.fifa_code = 'EGY';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'G', 'group', '2026-06-27 03:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'EGY' AND t2.fifa_code = 'IRN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'G', 'group', '2026-06-27 03:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'NZL' AND t2.fifa_code = 'BEL';

-- Group H
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'H', 'group', '2026-06-15 16:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ESP' AND t2.fifa_code = 'CPV';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'H', 'group', '2026-06-15 22:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'KSA' AND t2.fifa_code = 'URU';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'H', 'group', '2026-06-21 16:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ESP' AND t2.fifa_code = 'KSA';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'H', 'group', '2026-06-21 22:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'URU' AND t2.fifa_code = 'CPV';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'H', 'group', '2026-06-27 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CPV' AND t2.fifa_code = 'KSA';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'H', 'group', '2026-06-27 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'URU' AND t2.fifa_code = 'ESP';

-- Group I
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'I', 'group', '2026-06-16 19:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'FRA' AND t2.fifa_code = 'SEN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'I', 'group', '2026-06-16 22:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'IRQ' AND t2.fifa_code = 'NOR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'I', 'group', '2026-06-22 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'FRA' AND t2.fifa_code = 'IRQ';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'I', 'group', '2026-06-23 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'NOR' AND t2.fifa_code = 'SEN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'I', 'group', '2026-06-26 19:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'NOR' AND t2.fifa_code = 'FRA';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'I', 'group', '2026-06-26 19:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'SEN' AND t2.fifa_code = 'IRQ';

-- Group J
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'J', 'group', '2026-06-17 01:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ARG' AND t2.fifa_code = 'ALG';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'J', 'group', '2026-06-17 04:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'AUT' AND t2.fifa_code = 'JOR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'J', 'group', '2026-06-22 17:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ARG' AND t2.fifa_code = 'AUT';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'J', 'group', '2026-06-23 03:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'JOR' AND t2.fifa_code = 'ALG';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'J', 'group', '2026-06-28 02:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ALG' AND t2.fifa_code = 'AUT';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'J', 'group', '2026-06-28 02:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'JOR' AND t2.fifa_code = 'ARG';

-- Group K
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'K', 'group', '2026-06-17 17:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'POR' AND t2.fifa_code = 'COD';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'K', 'group', '2026-06-18 02:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'UZB' AND t2.fifa_code = 'COL';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'K', 'group', '2026-06-23 17:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'POR' AND t2.fifa_code = 'UZB';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'K', 'group', '2026-06-24 02:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'COL' AND t2.fifa_code = 'COD';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'K', 'group', '2026-06-27 23:30:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'COL' AND t2.fifa_code = 'POR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'K', 'group', '2026-06-27 23:30:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'COD' AND t2.fifa_code = 'UZB';

-- Group L
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'L', 'group', '2026-06-17 20:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ENG' AND t2.fifa_code = 'CRO';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'L', 'group', '2026-06-17 23:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'GHA' AND t2.fifa_code = 'PAN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'L', 'group', '2026-06-23 20:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ENG' AND t2.fifa_code = 'GHA';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'L', 'group', '2026-06-23 23:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'PAN' AND t2.fifa_code = 'CRO';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'L', 'group', '2026-06-27 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'PAN' AND t2.fifa_code = 'ENG';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'L', 'group', '2026-06-27 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CRO' AND t2.fifa_code = 'GHA';

-- Sanity checks
DO $$
DECLARE
  team_count INT;
  match_count INT;
BEGIN
  SELECT COUNT(*) INTO team_count FROM teams;
  SELECT COUNT(*) INTO match_count FROM matches;

  IF team_count != 48 THEN
    RAISE EXCEPTION 'Expected 48 teams, got %', team_count;
  END IF;

  IF match_count != 72 THEN
    RAISE EXCEPTION 'Expected 72 matches, got %', match_count;
  END IF;

  RAISE NOTICE 'Migration OK: 48 teams, 72 matches loaded';
END $$;

COMMIT;
