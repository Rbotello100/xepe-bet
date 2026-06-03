-- =====================================================================
-- Pick whitelist: defensa server-side contra picks invalidos
-- =====================================================================
--
-- Contexto: hoy `bets.pick` y `parlay_legs.pick` aceptan cualquier `text`.
-- El TS valida en el cliente pero la RPC place_bet_atomic confia en el
-- parametro p_pick sin whitelist. Un cliente malicioso (curl directo)
-- puede insertar picks como "foo" o algun string raro que rompa el
-- settlement.
--
-- Fix:
--  1. CHECK constraint en bets.pick y parlay_legs.pick (defensa final)
--  2. (en codigo TS) validar pre-RPC en placeBet/placeParlay
--
-- Compatibilidad con picks existentes: validamos primero que no haya
-- rows con valores fuera de la whitelist antes de agregar el constraint.

BEGIN;

-- Sanity check: si existe alguna row con pick invalido, abortamos.
-- Esto NO es destructivo (no borra nada), solo falla la migration y
-- avisa que hay data corrupta que necesita limpieza manual antes.
DO $$
DECLARE
  v_bad_bets int;
  v_bad_legs int;
BEGIN
  SELECT COUNT(*) INTO v_bad_bets FROM public.bets
    WHERE pick NOT IN ('home', 'draw', 'away', '1', 'X', '2');
  SELECT COUNT(*) INTO v_bad_legs FROM public.parlay_legs
    WHERE pick NOT IN ('home', 'draw', 'away', '1', 'X', '2');

  IF v_bad_bets > 0 OR v_bad_legs > 0 THEN
    RAISE EXCEPTION 'Hay % bets y % parlay_legs con pick fuera de la whitelist. Limpia antes de aplicar.', v_bad_bets, v_bad_legs;
  END IF;
END $$;

ALTER TABLE public.bets
  ADD CONSTRAINT bets_pick_whitelist
  CHECK (pick IN ('home', 'draw', 'away', '1', 'X', '2'));

ALTER TABLE public.parlay_legs
  ADD CONSTRAINT parlay_legs_pick_whitelist
  CHECK (pick IN ('home', 'draw', 'away', '1', 'X', '2'));

COMMIT;
