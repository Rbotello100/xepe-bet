-- ==========================================================
-- Migration: Production v1
-- Aplicar UNA VEZ en Supabase SQL Editor
-- Cubre: tracking PnL casino, mines sessions, penalty sessions,
-- sync flags en matches, y UNIQUE constraint en trivia
-- ==========================================================

-- ==========================================================
-- 1. CASINO TRACKING (Área 2 del plan)
-- Toda partida cerrada de cualquier juego de casino
-- ==========================================================
CREATE TABLE IF NOT EXISTS casino_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game TEXT NOT NULL CHECK (game IN ('slots','penalty','scratch','mines')),
  bet_amount NUMERIC(10,2) NOT NULL,
  win_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(10,2) GENERATED ALWAYS AS (win_amount - bet_amount) STORED,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_casino_sessions_user
  ON casino_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_casino_sessions_game
  ON casino_sessions(game, created_at DESC);

ALTER TABLE casino_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own sessions" ON casino_sessions;
CREATE POLICY "users see own sessions" ON casino_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ==========================================================
-- 2. PENALTY SESSIONS (fix Bugs #2 #4 #5)
-- Estado server-side del juego de penales — previene
-- manipulación de goles desde el cliente y double cashout
-- ==========================================================
CREATE TABLE IF NOT EXISTS penalty_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bet_amount NUMERIC(10,2) NOT NULL,
  goals_scored INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','cashed_out','busted')),
  payout NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_penalty_sessions_active
  ON penalty_sessions(user_id, status)
  WHERE status = 'active';

ALTER TABLE penalty_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own penalty sessions" ON penalty_sessions;
CREATE POLICY "users see own penalty sessions" ON penalty_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ==========================================================
-- 3. MINES SESSIONS (Cancha Minada — Área 1)
-- Estado server-side del juego de minas
-- mine_positions y safe_revealed son arrays de índices [0..35]
-- ==========================================================
CREATE TABLE IF NOT EXISTS mines_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bet_amount NUMERIC(10,2) NOT NULL,
  mine_count INT NOT NULL,
  mine_positions INT[] NOT NULL,
  safe_revealed INT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','cashed_out','busted')),
  current_multiplier NUMERIC(10,4) DEFAULT 1.0,
  payout NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mines_sessions_active
  ON mines_sessions(user_id, status)
  WHERE status = 'active';

ALTER TABLE mines_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own mines sessions" ON mines_sessions;
CREATE POLICY "users see own mines sessions" ON mines_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ==========================================================
-- 4. SCRATCH SESSIONS (fix Bug #1)
-- Token persistente para validar que la reclamación
-- corresponde a una partida real
-- ==========================================================
CREATE TABLE IF NOT EXISTS scratch_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bet_amount NUMERIC(10,2) NOT NULL,
  cells TEXT[] NOT NULL,
  prize_symbol TEXT,
  prize_amount NUMERIC(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','claimed','expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  claimed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scratch_sessions_active
  ON scratch_sessions(user_id, status)
  WHERE status = 'active';

ALTER TABLE scratch_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own scratch sessions" ON scratch_sessions;
CREATE POLICY "users see own scratch sessions" ON scratch_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ==========================================================
-- 5. SYNC FLAGS en matches (Áreas 3 y 4 — odds y scores 1x por partido)
-- ==========================================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS odds_synced BOOLEAN DEFAULT FALSE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS odds_sync_attempts INT DEFAULT 0;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS score_synced BOOLEAN DEFAULT FALSE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS score_sync_attempts INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_matches_odds_pending
  ON matches(starts_at)
  WHERE odds_synced = FALSE AND status IN ('scheduled','open');

CREATE INDEX IF NOT EXISTS idx_matches_score_pending
  ON matches(starts_at)
  WHERE score_synced = FALSE AND status != 'finished';

-- ==========================================================
-- 6. TRIVIA UNIQUE constraint (fix Bug #3 race condition)
-- Bloquea a nivel BD que un usuario juegue trivia 2x el mismo día
-- ==========================================================
-- Nota: DATE(timestamptz) no es IMMUTABLE porque depende del TZ de la sesión.
-- Solucion: forzar UTC explicitamente con AT TIME ZONE (es IMMUTABLE).
-- Si ya hay duplicados, eliminarlos antes:
-- SELECT user_id, (completed_at AT TIME ZONE 'UTC')::date, COUNT(*)
--   FROM trivia_sessions GROUP BY 1,2 HAVING COUNT(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_trivia_one_per_day
  ON trivia_sessions (user_id, ((completed_at AT TIME ZONE 'UTC')::date));

-- ==========================================================
-- 7. CLEANUP CRON: marcar sessiones abandonadas como expiradas/busted
-- (no refund - sesión expira con la apuesta retenida)
-- Crear función helper para limpieza periódica
-- ==========================================================
CREATE OR REPLACE FUNCTION cleanup_stale_casino_sessions() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Penal: sesiones activas > 30 min se consideran abandonadas (busted)
  UPDATE penalty_sessions
  SET status = 'busted', ended_at = now()
  WHERE status = 'active' AND created_at < now() - interval '30 minutes';

  -- Mines: sesiones activas > 60 min se consideran abandonadas (busted)
  UPDATE mines_sessions
  SET status = 'busted', ended_at = now()
  WHERE status = 'active' AND created_at < now() - interval '60 minutes';

  -- Scratch: sesiones activas > 24 horas se marcan como expiradas (sin premio)
  UPDATE scratch_sessions
  SET status = 'expired'
  WHERE status = 'active' AND created_at < now() - interval '24 hours';
END;
$$;
