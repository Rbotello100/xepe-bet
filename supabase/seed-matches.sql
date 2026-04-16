-- =============================================
-- Full Group Stage Matches - Mundial 2026
-- 12 groups x 6 matches = 72 matches
-- Source: FIFA official draw (Dec 5, 2025) + Wikipedia per-group pages
-- All timestamps in UTC
-- Run AFTER schema.sql
-- =============================================

-- Delete existing matches first
DELETE FROM matches;

-- Helper macro pattern: every INSERT uses SELECT to resolve team IDs by fifa_code.

-- ───────────────────────────────────────────────
-- Group A: Mexico, South Korea, South Africa, Czech Republic
-- ───────────────────────────────────────────────
-- MD1
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-11 19:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'MEX' AND t2.fifa_code = 'RSA';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-12 02:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'KOR' AND t2.fifa_code = 'CZE';
-- MD2
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-18 16:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CZE' AND t2.fifa_code = 'RSA';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-19 01:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'MEX' AND t2.fifa_code = 'KOR';
-- MD3
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-25 01:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CZE' AND t2.fifa_code = 'MEX';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-25 01:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'RSA' AND t2.fifa_code = 'KOR';

-- ───────────────────────────────────────────────
-- Group B: Canada, Switzerland, Qatar, Bosnia Herzegovina
-- ───────────────────────────────────────────────
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

-- ───────────────────────────────────────────────
-- Group C: Brazil, Morocco, Haiti, Scotland
-- ───────────────────────────────────────────────
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

-- ───────────────────────────────────────────────
-- Group D: United States, Paraguay, Australia, Turkiye
-- ───────────────────────────────────────────────
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

-- ───────────────────────────────────────────────
-- Group E: Germany, Ecuador, Cote d'Ivoire, Curacao
-- ───────────────────────────────────────────────
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

-- ───────────────────────────────────────────────
-- Group F: Netherlands, Japan, Tunisia, Sweden
-- ───────────────────────────────────────────────
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

-- ───────────────────────────────────────────────
-- Group G: Belgium, Egypt, Iran, New Zealand
-- ───────────────────────────────────────────────
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

-- ───────────────────────────────────────────────
-- Group H: Spain, Uruguay, Saudi Arabia, Cabo Verde
-- ───────────────────────────────────────────────
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

-- ───────────────────────────────────────────────
-- Group I: France, Senegal, Norway, Iraq
-- ───────────────────────────────────────────────
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

-- ───────────────────────────────────────────────
-- Group J: Argentina, Austria, Algeria, Jordan
-- ───────────────────────────────────────────────
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

-- ───────────────────────────────────────────────
-- Group K: Portugal, Colombia, Uzbekistan, DR Congo
-- ───────────────────────────────────────────────
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

-- ───────────────────────────────────────────────
-- Group L: England, Croatia, Ghana, Panama
-- ───────────────────────────────────────────────
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
