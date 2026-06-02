-- =====================================================================
-- Free play paga: was_free flag en penalty + mines sessions
-- =====================================================================
--
-- Cambio de mecánica de "1 jugada gratis al día" en Penalty y Mines:
-- Antes: bet_amount=0 cuando free → payout=bet×multiplier=0 → user gana
--        pero no cobra nada. UI mostraba "+$0" o "Perdiste" confuso.
-- Ahora: bet_amount = monto normal (Penalty $20-$500, Mines $25 fijo) y
--        NO se descuenta de profiles.credits si was_free=true. El payout
--        es proporcional al bet → user gana plata real en jugadas gratis
--        como bonus de retención.
-- =====================================================================

ALTER TABLE public.penalty_sessions
  ADD COLUMN IF NOT EXISTS was_free boolean NOT NULL DEFAULT false;

ALTER TABLE public.mines_sessions
  ADD COLUMN IF NOT EXISTS was_free boolean NOT NULL DEFAULT false;
