-- ======================================================================
-- daily_summaries: snapshot diario con el resumen agregado del dia.
-- El cron /api/cron/daily-summary lo escribe; /admin/daily-summary lo lee.
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.daily_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL UNIQUE,           -- un row por dia, idempotente
  content text NOT NULL,              -- mensaje pre-formateado para Slack
  metadata jsonb,                     -- numeros crudos por si queremos re-renderizar
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_day ON public.daily_summaries(day DESC);

ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden leer
CREATE POLICY "Admins read daily_summaries"
  ON public.daily_summaries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );
