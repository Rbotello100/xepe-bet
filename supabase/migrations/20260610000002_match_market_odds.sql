-- =============================================================
-- Tabla de odds por mercado/pick por partido
-- =============================================================
--
-- Hoy matches.odds_home/draw/away guardan solo las cuotas del 1X2.
-- Para soportar BTTS, Doble chance, Draw No Bet, Over/Under 1.5/2.5/3.5
-- necesitamos un esquema flexible que no requiera migracion cuando
-- agreguemos un mercado nuevo.
--
-- Patron: 1 row por (match_id, market_type, pick) con la odd + opcional
-- `point` para los mercados con threshold (totals).
--
-- El sync de odds upsertea aca. Las Server Actions consultan esta tabla
-- via resolveServerOddsExtended() con fallback a matches.odds_* para 1X2.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.match_market_odds (
  match_id    uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  market_type text NOT NULL,
  pick        text NOT NULL,
  odds        numeric(6,2) NOT NULL CHECK (odds >= 1.01 AND odds <= 99),
  point       numeric(4,2),  -- para totals/spreads: 1.5, 2.5, 3.5
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, market_type, pick)
);

-- Index para queries por market (ej "todos los over_2.5 del partido X")
CREATE INDEX IF NOT EXISTS idx_match_market_odds_market
  ON public.match_market_odds (match_id, market_type);

-- RLS: solo service_role lee/escribe (la app usa admin client).
ALTER TABLE public.match_market_odds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON public.match_market_odds;
CREATE POLICY "service_role_full_access"
  ON public.match_market_odds
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Permiso de lectura para usuarios anonimos/autenticados (las odds son publicas;
-- los Server Components/Actions necesitan poder leer sin auth admin).
DROP POLICY IF EXISTS "public_read" ON public.match_market_odds;
CREATE POLICY "public_read"
  ON public.match_market_odds
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT ALL ON public.match_market_odds TO service_role;
GRANT SELECT ON public.match_market_odds TO anon, authenticated;
