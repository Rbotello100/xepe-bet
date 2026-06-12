-- =====================================================================
-- pulse_stats: stats agregadas de la plataforma para el hero de la home.
-- Devuelve UNA row con 4 montos calculados en SQL (sin riesgo de
-- truncamiento del SDK Supabase a 1000 filas).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.pulse_stats()
RETURNS TABLE(
  pozo_total numeric,    -- Stakes históricos (bets + parlays) acumulado
  pozo_en_juego numeric, -- Stakes pending — plata corriendo riesgo ahora
  pagado_hoy numeric,    -- Wins acreditados en últimas 24h
  perdido_hoy numeric    -- Stakes de bets perdidas en últimas 24h
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    (
      (SELECT COALESCE(SUM(amount), 0)::numeric FROM bets) +
      (SELECT COALESCE(SUM(amount), 0)::numeric FROM parlays)
    ) as pozo_total,
    (SELECT COALESCE(SUM(amount), 0)::numeric FROM bets WHERE status = 'pending') as pozo_en_juego,
    (SELECT COALESCE(SUM(potential_payout), 0)::numeric
       FROM bets
       WHERE status = 'won'
         AND resolved_at >= now() - interval '24 hours') as pagado_hoy,
    (SELECT COALESCE(SUM(amount), 0)::numeric
       FROM bets
       WHERE status = 'lost'
         AND resolved_at >= now() - interval '24 hours') as perdido_hoy;
$$;

REVOKE ALL ON FUNCTION public.pulse_stats FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pulse_stats TO service_role;
