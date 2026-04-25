-- =============================================
-- ¿Donde esta Felipe? — Casino game v1
-- =============================================
-- Cada ronda es una sesion: el user apuesta a multiples salas, el server
-- elige la sala ganadora con RNG ponderado por probabilidades, paga lo que
-- corresponda y cierra la sesion. Idempotente via guard status='active'.
-- =============================================

CREATE TABLE IF NOT EXISTS felipe_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- bets: [{ room_id: string, amount: number }, ...]
  bets JSONB NOT NULL,
  total_bet NUMERIC(10,2) NOT NULL CHECK (total_bet > 0),
  -- revelado por el server al hacer reveal
  winning_room TEXT,
  payout NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revealed', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  revealed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_felipe_sessions_user_status
  ON felipe_sessions(user_id, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_felipe_sessions_user_created
  ON felipe_sessions(user_id, created_at DESC);

ALTER TABLE felipe_sessions ENABLE ROW LEVEL SECURITY;

-- Usuario lee solo sus sesiones; service role escribe (server actions)
DROP POLICY IF EXISTS "felipe_sessions_read_own" ON felipe_sessions;
CREATE POLICY "felipe_sessions_read_own" ON felipe_sessions
  FOR SELECT USING (user_id = auth.uid());
