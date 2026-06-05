-- =============================================================
-- Purga de logs viejos (error_log + activity_feed)
-- =============================================================
--
-- Por que: ambas tablas no tienen TTL. error_log crece ~10-100 rows/dia,
-- activity_feed ~8 rows/user/dia. Sin limpieza, en 6 meses el panel
-- /admin/observability empieza a tardar al cargar.
--
-- Esta funcion la dispara el cron .github/workflows/log-purge-cron.yml
-- 1x/semana via POST /api/cron/purge-logs con CRON_SECRET.
--
-- Retencion conservadora:
--   - error_log: 30 dias (alcanza para debugging y auditoria)
--   - activity_feed: 90 dias (UX feed muestra solo ultimos dias igual)
-- =============================================================

CREATE OR REPLACE FUNCTION purge_old_logs()
RETURNS TABLE(errors_purged bigint, activity_purged bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e bigint;
  a bigint;
BEGIN
  DELETE FROM error_log WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS e = ROW_COUNT;

  DELETE FROM activity_feed WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS a = ROW_COUNT;

  RETURN QUERY SELECT e, a;
END;
$$;

GRANT EXECUTE ON FUNCTION purge_old_logs() TO service_role;
