-- =====================================================================
-- Ampliar whitelist de picks + market_type para mercado Spreads (Handicap)
-- =====================================================================
--
-- Sumamos al CHECK existente (20260610000001):
--   spreads_1.5 / spreads_2.5 / spreads_3.5  → 3 market_types nuevos
--   home_±1.5, home_±2.5, home_±3.5         → 6 picks nuevos para local
--   away_±1.5, away_±2.5, away_±3.5         → 6 picks nuevos para visita
--
-- Lo mismo aplica a bets.pick/market_type Y parlay_legs.pick/market_type.
-- La RPC place_bet_atomic / place_parlay_atomic NO necesita cambios: la
-- validacion sigue siendo defense-in-depth con el CHECK SQL.
-- =====================================================================

-- 1) PICK whitelist
ALTER TABLE public.bets DROP CONSTRAINT IF EXISTS bets_pick_whitelist;
ALTER TABLE public.bets
  ADD CONSTRAINT bets_pick_whitelist
  CHECK (pick IN (
    'home','draw','away','1','X','2',
    '1X','X2','12',
    'btts_yes','btts_no',
    'dnb_home','dnb_away',
    'over_1.5','under_1.5',
    'over_2.5','under_2.5',
    'over_3.5','under_3.5',
    'home_-1.5','home_+1.5','away_-1.5','away_+1.5',
    'home_-2.5','home_+2.5','away_-2.5','away_+2.5',
    'home_-3.5','home_+3.5','away_-3.5','away_+3.5'
  ));

ALTER TABLE public.parlay_legs DROP CONSTRAINT IF EXISTS parlay_legs_pick_whitelist;
ALTER TABLE public.parlay_legs
  ADD CONSTRAINT parlay_legs_pick_whitelist
  CHECK (pick IN (
    'home','draw','away','1','X','2',
    '1X','X2','12',
    'btts_yes','btts_no',
    'dnb_home','dnb_away',
    'over_1.5','under_1.5',
    'over_2.5','under_2.5',
    'over_3.5','under_3.5',
    'home_-1.5','home_+1.5','away_-1.5','away_+1.5',
    'home_-2.5','home_+2.5','away_-2.5','away_+2.5',
    'home_-3.5','home_+3.5','away_-3.5','away_+3.5'
  ));

-- 2) MARKET_TYPE whitelist
ALTER TABLE public.bets DROP CONSTRAINT IF EXISTS bets_market_type_whitelist;
ALTER TABLE public.bets
  ADD CONSTRAINT bets_market_type_whitelist
  CHECK (market_type IN (
    '1x2','double_chance','btts','draw_no_bet',
    'totals_1.5','totals_2.5','totals_3.5',
    'spreads_1.5','spreads_2.5','spreads_3.5'
  ));

ALTER TABLE public.parlay_legs DROP CONSTRAINT IF EXISTS parlay_legs_market_type_whitelist;
ALTER TABLE public.parlay_legs
  ADD CONSTRAINT parlay_legs_market_type_whitelist
  CHECK (market_type IN (
    '1x2','double_chance','btts','draw_no_bet',
    'totals_1.5','totals_2.5','totals_3.5',
    'spreads_1.5','spreads_2.5','spreads_3.5'
  ));

-- 3) match_market_odds tiene su propio CHECK por market_type (de la migration
-- 20260610000002). Ampliamos tambien.
ALTER TABLE public.match_market_odds DROP CONSTRAINT IF EXISTS match_market_odds_market_type_check;
-- Hay variantes del nombre del constraint; intentamos otros nombres comunes
DO $$
BEGIN
  -- Buscar y dropear cualquier check sobre market_type
  EXECUTE (
    SELECT string_agg(format('ALTER TABLE public.match_market_odds DROP CONSTRAINT IF EXISTS %I;', con.conname), ' ')
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'match_market_odds'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%market_type%'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TABLE public.match_market_odds
  ADD CONSTRAINT match_market_odds_market_type_check
  CHECK (market_type IN (
    '1x2','double_chance','btts','draw_no_bet',
    'totals_1.5','totals_2.5','totals_3.5',
    'spreads_1.5','spreads_2.5','spreads_3.5'
  ));
