-- =====================================================================
-- handle_new_user: re-raise SIEMPRE en lugar de loguear + RETURN NEW
-- =====================================================================
--
-- Contexto: el trigger AFTER INSERT en auth.users tenia un EXCEPTION
-- WHEN OTHERS que, salvo para el RAISE del dominio rechazado, logueaba
-- y hacia RETURN NEW. Resultado: si el INSERT a profiles fallaba por
-- cualquier motivo (RLS, constraint), el user quedaba en auth.users sin
-- profile asociado. Al loguearse caia en redirect loop sin profile.
--
-- Fix: cualquier error en el trigger debe revertir la TX entera para
-- que auth.users tampoco quede inserted. Mejor mostrar "error al
-- registrarse, reintenta" que dejar un usuario huerfano.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_domain text;
  v_allowed boolean := false;
BEGIN
  v_domain := lower(split_part(NEW.email, '@', 2));

  IF v_domain IN ('xepelin.com', 'xepetest.local') THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Email domain % no permitido. Esta plataforma es solo para uso interno de Xepelin.', v_domain
      USING ERRCODE = '22023';
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
  -- Re-raise SIEMPRE. Cualquier error aca debe revertir la TX entera
  -- (incluyendo el insert en auth.users) para no dejar huerfanos sin
  -- profile. Antes hacia RAISE LOG + RETURN NEW para errores no-whitelist,
  -- pero eso permitia auth.users sin profile asociado.
  RAISE LOG 'handle_new_user error: % %', SQLERRM, SQLSTATE;
  RAISE;
END;
$$;
