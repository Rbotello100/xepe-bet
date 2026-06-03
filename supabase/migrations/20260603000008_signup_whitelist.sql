-- =====================================================================
-- Signup whitelist — solo @xepelin.com (y dominios de test internos)
-- =====================================================================
--
-- Contexto: plataforma interna para colegas de Xepelin. No queremos que
-- alguien afuera (incluso bots) creen cuentas. Sin esta restriccion:
--   - bot army inflando el ranking (cada signup → $1000 gratis)
--   - posibilidad de spam de Anthropic calls via Relator hooks
--   - users no-xepelin pueden filtrar info interna
--
-- Whitelist:
--   - @xepelin.com (real)
--   - @xepetest.local (para stress tests, dominio invalido en internet)
--
-- Si querés agregar mas dominios (ej. partners), agregar a la lista en
-- el trigger.

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_domain text;
  v_allowed boolean := false;
BEGIN
  -- Extraer dominio del email (todo despues del primer '@')
  v_domain := lower(split_part(NEW.email, '@', 2));

  -- Whitelist hardcoded — agregar dominios aqui si necesitas.
  IF v_domain IN ('xepelin.com', 'xepetest.local') THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Email domain % no permitido. Esta plataforma es solo para uso interno de Xepelin.', v_domain
      USING ERRCODE = '22023';  -- invalid_parameter_value
  END IF;

  INSERT INTO public.profiles (id, display_name, avatar_url, credits, total_points, is_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email, 'Usuario'),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NULL),
    1000,
    0,
    FALSE
  );

  INSERT INTO public.credit_transactions (user_id, type, amount, balance_after, description, reference_id)
  VALUES (NEW.id, 'signup', 1000, 1000, 'Saldo inicial de bienvenida', NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Si el dominio fue rechazado, re-raise para que Supabase auth devuelva el error.
  -- Si fue otro error (constraint, RLS), loguear y dejar pasar para no romper auth.
  IF SQLSTATE = '22023' THEN
    RAISE;
  END IF;
  RAISE LOG 'handle_new_user non-fatal error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;
