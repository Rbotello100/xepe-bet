-- =============================================================
-- Estado persistente del Circuit Breaker
-- =============================================================
--
-- Por que: lib/ai/circuit-breaker.ts tenia el estado en memoria del proceso.
-- Vercel spinea N instancias por load. Instancia A abre el breaker tras 3
-- fallos, instancia B (cold start) no lo sabe y deja pasar 3 mas. Thrashing
-- posible bajo carga.
--
-- Fix: tabla 1-row-por-circuito con estado compartido. UPSERT atomico al
-- record success/failure. Lecturas son baratas (1 SELECT por llamada).
-- =============================================================

CREATE TABLE IF NOT EXISTS public.circuit_state (
  name text PRIMARY KEY,
  opened_at timestamptz,
  consecutive_failures int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed inicial del circuito de Anthropic
INSERT INTO public.circuit_state (name, opened_at, consecutive_failures)
VALUES ('anthropic', NULL, 0)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.circuit_state ENABLE ROW LEVEL SECURITY;

-- Solo service_role escribe/lee (la app la usa via admin client).
DROP POLICY IF EXISTS "service_role_full_access" ON public.circuit_state;
CREATE POLICY "service_role_full_access"
  ON public.circuit_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.circuit_state TO service_role;
