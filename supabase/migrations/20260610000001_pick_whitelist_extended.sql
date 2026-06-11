-- =============================================================
-- Whitelist extendida de picks + market_type para mercados extra
-- =============================================================
--
-- Hoy bets.pick y parlay_legs.pick tienen CHECK que solo acepta 1X2
-- (definido en 20260603000001_pick_whitelist.sql). Ampliamos para
-- soportar 7 mercados (Tier 1 + 2):
--
--   1X2:            home, draw, away, 1, X, 2
--   Doble chance:   1X, X2, 12
--   BTTS:           btts_yes, btts_no
--   Draw No Bet:    dnb_home, dnb_away
--   O/U 1.5:        over_1.5, under_1.5
--   O/U 2.5:        over_2.5, under_2.5
--   O/U 3.5:        over_3.5, under_3.5
--
-- Tambien agregamos CHECK al market_type — hoy es texto libre y se
-- guardaba cualquier cosa.
-- =============================================================

-- 1) PICK whitelist (drop + recreate)
ALTER TABLE public.bets
  DROP CONSTRAINT IF EXISTS bets_pick_whitelist;
ALTER TABLE public.bets
  ADD CONSTRAINT bets_pick_whitelist
  CHECK (pick IN (
    'home', 'draw', 'away', '1', 'X', '2',
    '1X', 'X2', '12',
    'btts_yes', 'btts_no',
    'dnb_home', 'dnb_away',
    'over_1.5', 'under_1.5',
    'over_2.5', 'under_2.5',
    'over_3.5', 'under_3.5'
  ));

ALTER TABLE public.parlay_legs
  DROP CONSTRAINT IF EXISTS parlay_legs_pick_whitelist;
ALTER TABLE public.parlay_legs
  ADD CONSTRAINT parlay_legs_pick_whitelist
  CHECK (pick IN (
    'home', 'draw', 'away', '1', 'X', '2',
    '1X', 'X2', '12',
    'btts_yes', 'btts_no',
    'dnb_home', 'dnb_away',
    'over_1.5', 'under_1.5',
    'over_2.5', 'under_2.5',
    'over_3.5', 'under_3.5'
  ));

-- 2) MARKET_TYPE whitelist (nuevo)
ALTER TABLE public.bets
  DROP CONSTRAINT IF EXISTS bets_market_type_whitelist;
ALTER TABLE public.bets
  ADD CONSTRAINT bets_market_type_whitelist
  CHECK (market_type IN (
    '1x2', 'double_chance', 'btts', 'draw_no_bet',
    'totals_1.5', 'totals_2.5', 'totals_3.5'
  ));

ALTER TABLE public.parlay_legs
  DROP CONSTRAINT IF EXISTS parlay_legs_market_type_whitelist;
ALTER TABLE public.parlay_legs
  ADD CONSTRAINT parlay_legs_market_type_whitelist
  CHECK (market_type IN (
    '1x2', 'double_chance', 'btts', 'draw_no_bet',
    'totals_1.5', 'totals_2.5', 'totals_3.5'
  ));
