-- =====================================================================
-- relator_throttle: bloquea rapidos repetidos del Relator por user
-- =====================================================================
--
-- Contexto: cada bet/cashout/parlay >= umbral dispara generateRelatorMessage
-- en fire-and-forget. Si un user hace 10 cashouts en 1 min, dispara 10
-- llamadas Claude paralelas + 10 inserts al ai_feed. Spam visual + costo.
--
-- Solucion: una row por user con last_emitted_at. Antes de generar, vemos
-- si paso menos de N segundos desde el ultimo — si si, skip silencioso.
--
-- Una tabla dedicada (no metadata->user_id en ai_feed) porque:
--  - lookup O(1) por PK
--  - UPSERT atomico sin race
--  - no contamina el feed publico
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.relator_throttle (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_emitted_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.relator_throttle ENABLE ROW LEVEL SECURITY;
-- Solo service_role escribe/lee. Users no necesitan ver esta tabla.
REVOKE ALL ON public.relator_throttle FROM anon, authenticated;
