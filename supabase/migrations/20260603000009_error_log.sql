-- =====================================================================
-- error_log: tabla central de errores (reemplaza Sentry para uso interno)
-- =====================================================================
--
-- Cada try/catch importante loguea aqui via logError(). Reemplaza un
-- Sentry/Logflare ($50+/mes) por queries SQL simples.
--
-- Source: identificador del modulo que loguea (ej. 'casino.startMines',
-- 'ai.askClaude', 'bets.placeBet', 'sync.autoResolveMatch').
-- Level: severity para filtrado (warn → fail recoverable, error → bug)
-- Metadata: jsonb con contexto adicional (user_id, bet_id, etc).
--
-- Retention: 30 dias. Mas viejos se borran via cron (no incluido aqui;
-- agregar despues si la tabla crece).

BEGIN;

CREATE TABLE IF NOT EXISTS public.error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  level text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT error_log_level_check CHECK (level IN ('warn', 'error', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_error_log_created
  ON public.error_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_log_source_created
  ON public.error_log (source, created_at DESC);

-- RLS: solo service_role accede (admin client). Users no leen ni escriben.
ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;

COMMIT;
