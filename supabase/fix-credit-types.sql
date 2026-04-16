-- Add casino_bet and casino_win to credit_transactions type check
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('signup','bet','win','cash_out','trivia','parlay','refund','casino_bet','casino_win'));
