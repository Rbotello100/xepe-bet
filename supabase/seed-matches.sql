-- =============================================
-- Full Group Stage Matches - Mundial 2026
-- 12 groups x 6 matches = 72 matches
-- Run AFTER schema.sql
-- =============================================

-- Delete existing sample matches first
DELETE FROM matches;

-- Helper: insert match by team codes
-- Group A: Canada, Argentina, Morocco, Uzbekistan
-- MD1
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-11 18:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CAN' AND t2.fifa_code = 'MAR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-12 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ARG' AND t2.fifa_code = 'UZB';
-- MD2
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-16 18:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ARG' AND t2.fifa_code = 'CAN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-16 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'MAR' AND t2.fifa_code = 'UZB';
-- MD3
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-20 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CAN' AND t2.fifa_code = 'UZB';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'A', 'group', '2026-06-20 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ARG' AND t2.fifa_code = 'MAR';

-- Group B: Mexico, Ecuador, Venezuela, Japan
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'B', 'group', '2026-06-11 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'MEX' AND t2.fifa_code = 'VEN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'B', 'group', '2026-06-12 18:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ECU' AND t2.fifa_code = 'JPN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'B', 'group', '2026-06-16 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'MEX' AND t2.fifa_code = 'ECU';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'B', 'group', '2026-06-17 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'JPN' AND t2.fifa_code = 'VEN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'B', 'group', '2026-06-21 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'MEX' AND t2.fifa_code = 'JPN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'B', 'group', '2026-06-21 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ECU' AND t2.fifa_code = 'VEN';

-- Group C: USA, Uruguay, Panama, Bolivia
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'C', 'group', '2026-06-12 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'USA' AND t2.fifa_code = 'BOL';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'C', 'group', '2026-06-13 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'URU' AND t2.fifa_code = 'PAN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'C', 'group', '2026-06-17 18:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'USA' AND t2.fifa_code = 'URU';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'C', 'group', '2026-06-17 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'BOL' AND t2.fifa_code = 'PAN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'C', 'group', '2026-06-22 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'USA' AND t2.fifa_code = 'PAN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'C', 'group', '2026-06-22 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'URU' AND t2.fifa_code = 'BOL';

-- Group D: France, Colombia, Saudi Arabia, Australia
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'D', 'group', '2026-06-13 18:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'FRA' AND t2.fifa_code = 'KSA';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'D', 'group', '2026-06-13 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'COL' AND t2.fifa_code = 'AUS';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'D', 'group', '2026-06-18 18:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'FRA' AND t2.fifa_code = 'COL';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'D', 'group', '2026-06-18 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'KSA' AND t2.fifa_code = 'AUS';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'D', 'group', '2026-06-23 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'FRA' AND t2.fifa_code = 'AUS';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'D', 'group', '2026-06-23 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'COL' AND t2.fifa_code = 'KSA';

-- Group E: Brazil, Costa Rica, Albania, Turkiye
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'E', 'group', '2026-06-13 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'BRA' AND t2.fifa_code = 'ALB';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'E', 'group', '2026-06-14 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'TUR' AND t2.fifa_code = 'CRC';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'E', 'group', '2026-06-18 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'BRA' AND t2.fifa_code = 'TUR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'E', 'group', '2026-06-19 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ALB' AND t2.fifa_code = 'CRC';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'E', 'group', '2026-06-23 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'BRA' AND t2.fifa_code = 'CRC';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'E', 'group', '2026-06-23 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'TUR' AND t2.fifa_code = 'ALB';

-- Group F: Netherlands, Senegal, Iran, DR Congo
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'F', 'group', '2026-06-14 18:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'NED' AND t2.fifa_code = 'IRN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'F', 'group', '2026-06-14 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'SEN' AND t2.fifa_code = 'COD';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'F', 'group', '2026-06-19 18:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'NED' AND t2.fifa_code = 'SEN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'F', 'group', '2026-06-19 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'IRN' AND t2.fifa_code = 'COD';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'F', 'group', '2026-06-24 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'NED' AND t2.fifa_code = 'COD';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'F', 'group', '2026-06-24 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'SEN' AND t2.fifa_code = 'IRN';

-- Group G: Spain, Nigeria, New Zealand, Czech Republic
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'G', 'group', '2026-06-14 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ESP' AND t2.fifa_code = 'NZL';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'G', 'group', '2026-06-15 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'NGA' AND t2.fifa_code = 'CZE';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'G', 'group', '2026-06-19 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ESP' AND t2.fifa_code = 'NGA';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'G', 'group', '2026-06-20 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'NZL' AND t2.fifa_code = 'CZE';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'G', 'group', '2026-06-24 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ESP' AND t2.fifa_code = 'CZE';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'G', 'group', '2026-06-24 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'NGA' AND t2.fifa_code = 'NZL';

-- Group H: England, Serbia, Denmark, Paraguay
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'H', 'group', '2026-06-15 18:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ENG' AND t2.fifa_code = 'DEN';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'H', 'group', '2026-06-15 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'SRB' AND t2.fifa_code = 'PAR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'H', 'group', '2026-06-20 18:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ENG' AND t2.fifa_code = 'SRB';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'H', 'group', '2026-06-20 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'DEN' AND t2.fifa_code = 'PAR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'H', 'group', '2026-06-25 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'ENG' AND t2.fifa_code = 'PAR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'H', 'group', '2026-06-25 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'SRB' AND t2.fifa_code = 'DEN';

-- Group I: Portugal, Cameroon, South Korea, Bosnia
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'I', 'group', '2026-06-15 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'POR' AND t2.fifa_code = 'KOR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'I', 'group', '2026-06-16 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CMR' AND t2.fifa_code = 'BIH';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'I', 'group', '2026-06-20 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'POR' AND t2.fifa_code = 'CMR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'I', 'group', '2026-06-21 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'KOR' AND t2.fifa_code = 'BIH';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'I', 'group', '2026-06-25 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'POR' AND t2.fifa_code = 'BIH';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'I', 'group', '2026-06-25 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CMR' AND t2.fifa_code = 'KOR';

-- Group J: Germany, Chile, Iraq, Sweden
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'J', 'group', '2026-06-16 18:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'GER' AND t2.fifa_code = 'IRQ';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'J', 'group', '2026-06-16 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CHI' AND t2.fifa_code = 'SWE';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'J', 'group', '2026-06-21 18:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'GER' AND t2.fifa_code = 'CHI';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'J', 'group', '2026-06-21 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'IRQ' AND t2.fifa_code = 'SWE';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'J', 'group', '2026-06-26 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'GER' AND t2.fifa_code = 'SWE';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'J', 'group', '2026-06-26 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CHI' AND t2.fifa_code = 'IRQ';

-- Group K: Belgium, Wales, Ghana, Peru
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'K', 'group', '2026-06-17 18:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'BEL' AND t2.fifa_code = 'GHA';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'K', 'group', '2026-06-17 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'WAL' AND t2.fifa_code = 'PER';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'K', 'group', '2026-06-22 18:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'BEL' AND t2.fifa_code = 'WAL';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'K', 'group', '2026-06-22 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'GHA' AND t2.fifa_code = 'PER';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'K', 'group', '2026-06-26 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'BEL' AND t2.fifa_code = 'PER';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'K', 'group', '2026-06-26 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'WAL' AND t2.fifa_code = 'GHA';

-- Group L: Croatia, Switzerland, Egypt, Ukraine
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'L', 'group', '2026-06-17 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CRO' AND t2.fifa_code = 'EGY';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'L', 'group', '2026-06-18 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'SUI' AND t2.fifa_code = 'UKR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'L', 'group', '2026-06-22 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CRO' AND t2.fifa_code = 'SUI';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'L', 'group', '2026-06-23 00:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'EGY' AND t2.fifa_code = 'UKR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'L', 'group', '2026-06-26 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'CRO' AND t2.fifa_code = 'UKR';
INSERT INTO matches (home_team_id, away_team_id, group_name, round, starts_at, status)
SELECT t1.id, t2.id, 'L', 'group', '2026-06-26 21:00:00+00', 'scheduled'
FROM teams t1, teams t2 WHERE t1.fifa_code = 'SUI' AND t2.fifa_code = 'EGY';
