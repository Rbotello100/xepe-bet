-- =============================================
-- Migration: Add terms_accepted_at to profiles
-- Purpose: Track when each user accepted the platform's T&C.
--          Used to gate access until the user goes through the
--          onboarding flow and clicks "Acepto".
-- Idempotent: safe to re-run.
-- =============================================

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

COMMIT;
