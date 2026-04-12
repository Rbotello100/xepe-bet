-- =============================================
-- Fix: Credit atomicity + transaction ledger
-- Run in Supabase SQL Editor
-- =============================================

-- 1. Prevent negative credits
ALTER TABLE profiles ADD CONSTRAINT credits_non_negative CHECK (credits >= 0);

-- 2. Credit transactions ledger (audit trail)
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  amount NUMERIC(10,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('signup','bet','win','cash_out','trivia','parlay','refund')),
  balance_after NUMERIC(10,2) NOT NULL,
  reference_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_credit_tx_user ON credit_transactions(user_id, created_at DESC);

-- RLS for credit_transactions
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_tx_read_own" ON credit_transactions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "credit_tx_insert" ON credit_transactions FOR INSERT WITH CHECK (user_id = auth.uid());

-- Realtime for credit_transactions
ALTER PUBLICATION supabase_realtime ADD TABLE credit_transactions;
