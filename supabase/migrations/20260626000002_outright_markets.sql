-- =====================================================================
-- Outright markets (tipo "Campeón del Mundial 2026")
-- =====================================================================
--
-- Schema separado de bets porque:
--   1. No tienen match_id (FK NOT NULL en bets)
--   2. Settlement diferente: al terminar el torneo se marca un winner_team
--      y todas las bets del mercado se liquidan en batch.
--   3. Volumen de outcomes alto (40+ equipos) — natural normalizarlo.
--
-- Flujo:
--   1. /api/cron/sync-outright: trae odds de cada equipo + actualiza
--      outright_outcomes. Si el evento esta completed, settle.
--   2. /champion: UI lista equipos, user apuesta → outright_bets
--   3. Settlement: cron/admin marca winner_team → todas las bets liquidan
--      atomicamente
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.outright_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_key text NOT NULL UNIQUE,            -- 'soccer_fifa_world_cup_winner'
  market_name text NOT NULL,                 -- 'Campeón Mundial 2026'
  external_id text,                          -- ID del evento en The Odds API
  commence_time timestamptz,                 -- fecha del partido decidor (final)
  closes_at timestamptz NOT NULL,            -- cutoff para nuevas bets
  status text NOT NULL DEFAULT 'open'        -- open | closed | settled
    CHECK (status IN ('open','closed','settled')),
  winner_team text,                          -- nombre del equipo ganador
  settled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.outright_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.outright_markets(id) ON DELETE CASCADE,
  team_name text NOT NULL,                   -- 'France', 'Argentina', etc.
  odds numeric(8,2) NOT NULL CHECK (odds >= 1.01 AND odds <= 999),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (market_id, team_name)
);

CREATE INDEX IF NOT EXISTS idx_outright_outcomes_market ON public.outright_outcomes(market_id);
CREATE INDEX IF NOT EXISTS idx_outright_outcomes_team ON public.outright_outcomes(market_id, team_name);

CREATE TABLE IF NOT EXISTS public.outright_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.outright_markets(id) ON DELETE RESTRICT,
  team_name text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  odds_at_placement numeric(8,2) NOT NULL,
  potential_payout numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','won','lost','cancelled')),
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outright_bets_user ON public.outright_bets(user_id);
CREATE INDEX IF NOT EXISTS idx_outright_bets_market_status ON public.outright_bets(market_id, status);

-- RLS: cada user ve solo sus propias bets; markets/outcomes son publicos read-only
ALTER TABLE public.outright_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outright_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outright_bets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outright_markets read" ON public.outright_markets;
CREATE POLICY "outright_markets read" ON public.outright_markets FOR SELECT USING (true);

DROP POLICY IF EXISTS "outright_outcomes read" ON public.outright_outcomes;
CREATE POLICY "outright_outcomes read" ON public.outright_outcomes FOR SELECT USING (true);

DROP POLICY IF EXISTS "outright_bets read own" ON public.outright_bets;
CREATE POLICY "outright_bets read own" ON public.outright_bets
  FOR SELECT USING (auth.uid() = user_id);

-- Seed: insertar el mercado de Campeon Mundial 2026 si no existe.
-- closes_at = inicio de octavos (R32) del 28-jun-2026 segun WC_2026_PHASES.
INSERT INTO public.outright_markets (sport_key, market_name, closes_at, status)
VALUES (
  'soccer_fifa_world_cup_winner',
  'Campeón Mundial 2026',
  '2026-06-28T00:00:00Z',
  'open'
)
ON CONFLICT (sport_key) DO NOTHING;
