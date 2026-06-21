-- =====================================================================
-- Agregar 'allowance' al CHECK constraint de credit_transactions.type
-- =====================================================================
-- Bug discovery: el cron daily-allowance fallaba con 23514
-- "violates check constraint credit_transactions_type_check" porque
-- 'allowance' no estaba en la whitelist original del CHECK.
--
-- Esta migration es idempotente: DROP IF EXISTS + ADD.
-- =====================================================================

ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN (
    'signup',
    'bet',
    'win',
    'cash_out',
    'trivia',
    'parlay',
    'refund',
    'casino_bet',
    'casino_win',
    'allowance'
  ));
