-- =====================================================================
-- daily_trivia: preguntas aleatorias REALES, sin repetir las que ya
-- respondió el user.
-- =====================================================================
--
-- Bug previo: getDailyTrivia hacía `.from('trivia_questions').select(...).limit(15)`
-- sin ORDER BY y después un shuffle en JS con `sort(() => Math.random() - 0.5)`.
-- Resultado: SQL devolvía siempre las mismas 15 primeras (por PK interno) y
-- el shuffle JS solo permutaba esas 15. Con 518 preguntas en BD el user veía
-- siempre el mismo pool chico y las preguntas se repetían día tras día.
--
-- Fix:
-- 1. ORDER BY random() en SQL — aleatorio real sobre las 518.
-- 2. Excluir preguntas que el user ya respondió (LEFT JOIN trivia_answers).
-- 3. Fallback: si el user ya respondió TODAS, volvemos a sortear con random()
--    sobre todo el set (mejor que devolver vacío).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.daily_trivia(
  p_user_id uuid,
  p_count integer DEFAULT 5
)
RETURNS TABLE(
  id uuid,
  question text,
  options jsonb,
  correct_option integer,
  difficulty text,
  category text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_unanswered_count integer;
BEGIN
  -- Cuántas preguntas hay disponibles que el user NO haya respondido todavía
  SELECT count(*) INTO v_unanswered_count
  FROM trivia_questions tq
  WHERE NOT EXISTS (
    SELECT 1 FROM trivia_answers ta
    JOIN trivia_sessions ts ON ts.id = ta.session_id
    WHERE ts.user_id = p_user_id AND ta.question_id = tq.id
  );

  IF v_unanswered_count >= p_count THEN
    -- Hay preguntas nuevas suficientes — devolver N random de esas
    RETURN QUERY
    SELECT tq.id, tq.question, tq.options, tq.correct_option, tq.difficulty, tq.category
    FROM trivia_questions tq
    WHERE NOT EXISTS (
      SELECT 1 FROM trivia_answers ta
      JOIN trivia_sessions ts ON ts.id = ta.session_id
      WHERE ts.user_id = p_user_id AND ta.question_id = tq.id
    )
    ORDER BY random()
    LIMIT p_count;
  ELSE
    -- El user ya respondió la mayoría — sorteamos sobre todo el set como
    -- fallback (mejor que devolver vacío). Pasaría solo si hay <5 preguntas
    -- sin responder de las 518 totales, o sea muy poco probable.
    RETURN QUERY
    SELECT tq.id, tq.question, tq.options, tq.correct_option, tq.difficulty, tq.category
    FROM trivia_questions tq
    ORDER BY random()
    LIMIT p_count;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.daily_trivia FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daily_trivia TO service_role;
