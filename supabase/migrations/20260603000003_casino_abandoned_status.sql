-- =====================================================================
-- Status 'abandoned' en penalty_sessions y mines_sessions
-- =====================================================================
--
-- Contexto: hasta ahora, cuando un user iniciaba una nueva partida con una
-- sesion 'active' previa, la sesion vieja quedaba marcada como 'busted'
-- (= perdiste) sin reembolso. Esto causaba que double-clicks o reinicios
-- de pagina cobraran 2 bets al user. Bug claro: si no decidio bustear ni
-- cashear, no debe perder el stake.
--
-- Fix: nueva estado 'abandoned' que recibe REFUND del bet_amount al user
-- (ver refundAbandonedSessions en features/casino/actions.ts). Es distinto
-- de 'busted' (perdiste por pisar mina / fallar penal) que NO refunda.

BEGIN;

ALTER TABLE public.penalty_sessions
  DROP CONSTRAINT IF EXISTS penalty_sessions_status_check;

ALTER TABLE public.penalty_sessions
  ADD CONSTRAINT penalty_sessions_status_check
  CHECK (status IN ('active', 'cashed_out', 'busted', 'abandoned'));

ALTER TABLE public.mines_sessions
  DROP CONSTRAINT IF EXISTS mines_sessions_status_check;

ALTER TABLE public.mines_sessions
  ADD CONSTRAINT mines_sessions_status_check
  CHECK (status IN ('active', 'cashed_out', 'busted', 'abandoned'));

COMMIT;
