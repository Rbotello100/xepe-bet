-- =============================================
-- Mundial Betting - Full Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- Drop existing tables (old schema)
DROP TABLE IF EXISTS trivia_answers CASCADE;
DROP TABLE IF EXISTS trivia_sessions CASCADE;
DROP TABLE IF EXISTS trivia_questions CASCADE;
DROP TABLE IF EXISTS special_markets CASCADE;
DROP TABLE IF EXISTS match_markets CASCADE;
DROP TABLE IF EXISTS parlay_legs CASCADE;
DROP TABLE IF EXISTS parlays CASCADE;
DROP TABLE IF EXISTS activity_feed CASCADE;
DROP TABLE IF EXISTS bets CASCADE;
DROP TABLE IF EXISTS predictions CASCADE;
DROP TABLE IF EXISTS scoring_config CASCADE;
DROP TABLE IF EXISTS matches CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS teams CASCADE;

-- =============================================
-- TEAMS
-- =============================================
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  fifa_code CHAR(3) NOT NULL UNIQUE,
  flag TEXT NOT NULL,
  group_name CHAR(1) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- MATCHES
-- =============================================
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_team_id UUID NOT NULL REFERENCES teams(id),
  away_team_id UUID NOT NULL REFERENCES teams(id),
  group_name CHAR(1),
  round TEXT NOT NULL DEFAULT 'group',
  starts_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','open','live','finished','cancelled')),
  home_score INTEGER,
  away_score INTEGER,
  odds_home NUMERIC(5,2),
  odds_draw NUMERIC(5,2),
  odds_away NUMERIC(5,2),
  external_id TEXT UNIQUE,
  odds_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- PROFILES
-- =============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  credits NUMERIC(10,2) NOT NULL DEFAULT 1000.00,
  total_points INTEGER NOT NULL DEFAULT 0,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  terms_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================
-- PREDICTIONS (core del prode)
-- =============================================
CREATE TABLE predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  match_id UUID NOT NULL REFERENCES matches(id),
  predicted_winner TEXT CHECK (predicted_winner IN ('home','draw','away')),
  predicted_home_score INTEGER,
  predicted_away_score INTEGER,
  points_earned INTEGER DEFAULT 0,
  is_correct BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, match_id)
);

-- =============================================
-- SCORING CONFIG
-- =============================================
CREATE TABLE scoring_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correct_winner_points INTEGER NOT NULL DEFAULT 3,
  exact_score_points INTEGER NOT NULL DEFAULT 5,
  correct_goal_diff_points INTEGER NOT NULL DEFAULT 2,
  group_winner_points INTEGER NOT NULL DEFAULT 10,
  champion_points INTEGER NOT NULL DEFAULT 20,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default config
INSERT INTO scoring_config (id, correct_winner_points, exact_score_points, correct_goal_diff_points, group_winner_points, champion_points)
VALUES ('00000000-0000-0000-0000-000000000001', 3, 5, 2, 10, 20);

-- =============================================
-- BETS
-- =============================================
CREATE TABLE bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  match_id UUID REFERENCES matches(id),
  market_type TEXT NOT NULL DEFAULT '1x2',
  pick TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  odds_at_placement NUMERIC(5,2) NOT NULL,
  potential_payout NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','won','lost','cancelled','cashed_out')),
  cash_out_amount NUMERIC(10,2),
  cashed_out_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- ACTIVITY FEED
-- =============================================
CREATE TABLE activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  action_type TEXT NOT NULL
    CHECK (action_type IN ('prediction','bet','cash_out','trivia','parlay','achievement')),
  description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- PARLAYS
-- =============================================
CREATE TABLE parlays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  total_odds NUMERIC(10,2) NOT NULL,
  potential_payout NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE parlay_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parlay_id UUID NOT NULL REFERENCES parlays(id) ON DELETE CASCADE,
  match_id UUID REFERENCES matches(id),
  market_type TEXT NOT NULL,
  pick TEXT NOT NULL,
  odds NUMERIC(5,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
);

-- =============================================
-- MATCH MARKETS
-- =============================================
CREATE TABLE match_markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id),
  market_type TEXT NOT NULL,
  options JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  winning_option TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- SPECIAL MARKETS
-- =============================================
CREATE TABLE special_markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  options JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  winning_option TEXT,
  closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- TRIVIA
-- =============================================
CREATE TABLE trivia_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_option INTEGER NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium'
    CHECK (difficulty IN ('easy','medium','hard')),
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general','history','rules','world_cup_2026','players','stats')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE trivia_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  total_questions INTEGER NOT NULL,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  credits_earned NUMERIC(10,2) NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE trivia_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trivia_sessions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES trivia_questions(id),
  selected_option INTEGER NOT NULL,
  is_correct BOOLEAN NOT NULL,
  time_taken_ms INTEGER
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_predictions_user ON predictions(user_id);
CREATE INDEX idx_predictions_match ON predictions(match_id);
CREATE INDEX idx_matches_status ON matches(status, starts_at);
CREATE INDEX idx_bets_user ON bets(user_id);
CREATE INDEX idx_bets_match ON bets(match_id);
CREATE INDEX idx_parlays_user ON parlays(user_id);
CREATE INDEX idx_trivia_sessions_user ON trivia_sessions(user_id, completed_at);
CREATE INDEX idx_activity_feed_created ON activity_feed(created_at DESC);

-- =============================================
-- RLS POLICIES
-- =============================================
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE parlays ENABLE ROW LEVEL SECURITY;
ALTER TABLE parlay_legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_answers ENABLE ROW LEVEL SECURITY;

-- Teams: public read
CREATE POLICY "teams_read" ON teams FOR SELECT USING (true);

-- Matches: public read
CREATE POLICY "matches_read" ON matches FOR SELECT USING (true);

-- Profiles: public read, own update
CREATE POLICY "profiles_read" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (id = auth.uid());

-- Predictions: own read always, others read only if match started, own insert/update
CREATE POLICY "predictions_read_own" ON predictions FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "predictions_read_others" ON predictions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM matches WHERE matches.id = predictions.match_id AND matches.starts_at <= now()
    )
  );
CREATE POLICY "predictions_insert_own" ON predictions FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "predictions_update_own" ON predictions FOR UPDATE
  USING (user_id = auth.uid());

-- Scoring config: public read
CREATE POLICY "scoring_config_read" ON scoring_config FOR SELECT USING (true);

-- Bets: own read, own insert
CREATE POLICY "bets_read_own" ON bets FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "bets_insert_own" ON bets FOR INSERT WITH CHECK (user_id = auth.uid());

-- Activity feed: public read
CREATE POLICY "activity_feed_read" ON activity_feed FOR SELECT USING (true);
CREATE POLICY "activity_feed_insert" ON activity_feed FOR INSERT WITH CHECK (user_id = auth.uid());

-- Parlays: own read, own insert
CREATE POLICY "parlays_read_own" ON parlays FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "parlays_insert_own" ON parlays FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "parlay_legs_read" ON parlay_legs FOR SELECT
  USING (EXISTS (SELECT 1 FROM parlays WHERE parlays.id = parlay_legs.parlay_id AND parlays.user_id = auth.uid()));
CREATE POLICY "parlay_legs_insert" ON parlay_legs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM parlays WHERE parlays.id = parlay_legs.parlay_id AND parlays.user_id = auth.uid()));

-- Match markets: public read
CREATE POLICY "match_markets_read" ON match_markets FOR SELECT USING (true);

-- Special markets: public read
CREATE POLICY "special_markets_read" ON special_markets FOR SELECT USING (true);

-- Trivia questions: public read
CREATE POLICY "trivia_questions_read" ON trivia_questions FOR SELECT USING (true);

-- Trivia sessions: own read, own insert
CREATE POLICY "trivia_sessions_read_own" ON trivia_sessions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "trivia_sessions_insert_own" ON trivia_sessions FOR INSERT WITH CHECK (user_id = auth.uid());

-- Trivia answers: own read, own insert
CREATE POLICY "trivia_answers_read_own" ON trivia_answers FOR SELECT
  USING (EXISTS (SELECT 1 FROM trivia_sessions WHERE trivia_sessions.id = trivia_answers.session_id AND trivia_sessions.user_id = auth.uid()));
CREATE POLICY "trivia_answers_insert_own" ON trivia_answers FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM trivia_sessions WHERE trivia_sessions.id = trivia_answers.session_id AND trivia_sessions.user_id = auth.uid()));

-- =============================================
-- ENABLE REALTIME
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_feed;
ALTER PUBLICATION supabase_realtime ADD TABLE matches;

-- =============================================
-- SEED: Sample trivia questions
-- =============================================
INSERT INTO trivia_questions (question, options, correct_option, difficulty, category) VALUES
('Quien gano el Mundial 2022?', '["Brasil", "Francia", "Argentina", "Croacia"]', 2, 'easy', 'history'),
('En que pais se jugo el primer Mundial (1930)?', '["Brasil", "Uruguay", "Italia", "Argentina"]', 1, 'easy', 'history'),
('Que seleccion tiene mas titulos mundiales?', '["Alemania", "Italia", "Argentina", "Brasil"]', 3, 'easy', 'stats'),
('Cuantos equipos participan en el Mundial 2026?', '["32", "36", "48", "64"]', 2, 'easy', 'world_cup_2026'),
('En que paises se jugara el Mundial 2026?', '["USA, Canada, Mexico", "USA, Brasil, Argentina", "USA, UK, Francia", "USA, Japon, Korea"]', 0, 'easy', 'world_cup_2026'),
('Quien es el maximo goleador en la historia de los Mundiales?', '["Ronaldo", "Miroslav Klose", "Pele", "Mbappe"]', 1, 'medium', 'stats'),
('Cuantos minutos dura un partido de futbol reglamentario?', '["80", "90", "100", "120"]', 1, 'easy', 'rules'),
('Que significa la tarjeta amarilla?', '["Expulsion", "Amonestacion", "Penal", "Tiro libre"]', 1, 'easy', 'rules'),
('Cual seleccion gano el Mundial 2018?', '["Alemania", "Brasil", "Croacia", "Francia"]', 3, 'easy', 'history'),
('Cuantos grupos habra en el Mundial 2026?', '["8", "10", "12", "16"]', 2, 'medium', 'world_cup_2026'),
('Quien gano el Balon de Oro del Mundial 2022?', '["Mbappe", "Messi", "Modric", "Griezmann"]', 1, 'medium', 'history'),
('Que es el VAR?', '["Video Assistant Referee", "Virtual Auto Review", "Verified Action Replay", "Video Analysis Room"]', 0, 'easy', 'rules'),
('Cuantos jugadores tiene un equipo en cancha?', '["9", "10", "11", "12"]', 2, 'easy', 'rules'),
('Que seleccion ha ganado mas Copas America?', '["Brasil", "Argentina", "Uruguay", "Chile"]', 2, 'medium', 'stats'),
('En que ano se introdujo la regla del fuera de juego?', '["1863", "1925", "1950", "1990"]', 1, 'hard', 'rules'),
('Cual fue el resultado de la final del Mundial 2014?', '["Alemania 1-0 Argentina", "Brasil 2-1 Alemania", "Argentina 2-1 Alemania", "Alemania 7-1 Brasil"]', 0, 'medium', 'history'),
('Cuantas sedes tendra el Mundial 2026?', '["11", "14", "16", "20"]', 2, 'medium', 'world_cup_2026'),
('Que jugador tiene mas goles en un solo Mundial?', '["Pele", "Just Fontaine", "Ronaldo", "Mbappe"]', 1, 'hard', 'stats'),
('Cual es la sede de la final del Mundial 2026?', '["MetLife Stadium (NY)", "Azteca (CDMX)", "AT&T Stadium (Dallas)", "SoFi Stadium (LA)"]', 0, 'medium', 'world_cup_2026'),
('Que seleccion perdio la final del Mundial 3 veces seguidas?', '["Alemania", "Argentina", "Holanda", "Brasil"]', 2, 'hard', 'history');

-- =============================================
-- SEED: Sample teams (Group A as example)
-- =============================================
-- 48 teams from the FIFA World Cup 2026 official draw (Dec 5, 2025)
INSERT INTO teams (name, fifa_code, flag, group_name) VALUES
-- Group A
('Mexico', 'MEX', '🇲🇽', 'A'),
('South Korea', 'KOR', '🇰🇷', 'A'),
('South Africa', 'RSA', '🇿🇦', 'A'),
('Czech Republic', 'CZE', '🇨🇿', 'A'),
-- Group B
('Canada', 'CAN', '🇨🇦', 'B'),
('Switzerland', 'SUI', '🇨🇭', 'B'),
('Qatar', 'QAT', '🇶🇦', 'B'),
('Bosnia Herzegovina', 'BIH', '🇧🇦', 'B'),
-- Group C
('Brazil', 'BRA', '🇧🇷', 'C'),
('Morocco', 'MAR', '🇲🇦', 'C'),
('Haiti', 'HAI', '🇭🇹', 'C'),
('Scotland', 'SCO', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'C'),
-- Group D
('United States', 'USA', '🇺🇸', 'D'),
('Paraguay', 'PAR', '🇵🇾', 'D'),
('Australia', 'AUS', '🇦🇺', 'D'),
('Turkiye', 'TUR', '🇹🇷', 'D'),
-- Group E
('Germany', 'GER', '🇩🇪', 'E'),
('Ecuador', 'ECU', '🇪🇨', 'E'),
('Cote d''Ivoire', 'CIV', '🇨🇮', 'E'),
('Curacao', 'CUW', '🇨🇼', 'E'),
-- Group F
('Netherlands', 'NED', '🇳🇱', 'F'),
('Japan', 'JPN', '🇯🇵', 'F'),
('Tunisia', 'TUN', '🇹🇳', 'F'),
('Sweden', 'SWE', '🇸🇪', 'F'),
-- Group G
('Belgium', 'BEL', '🇧🇪', 'G'),
('Egypt', 'EGY', '🇪🇬', 'G'),
('Iran', 'IRN', '🇮🇷', 'G'),
('New Zealand', 'NZL', '🇳🇿', 'G'),
-- Group H
('Spain', 'ESP', '🇪🇸', 'H'),
('Uruguay', 'URU', '🇺🇾', 'H'),
('Saudi Arabia', 'KSA', '🇸🇦', 'H'),
('Cabo Verde', 'CPV', '🇨🇻', 'H'),
-- Group I
('France', 'FRA', '🇫🇷', 'I'),
('Senegal', 'SEN', '🇸🇳', 'I'),
('Norway', 'NOR', '🇳🇴', 'I'),
('Iraq', 'IRQ', '🇮🇶', 'I'),
-- Group J
('Argentina', 'ARG', '🇦🇷', 'J'),
('Austria', 'AUT', '🇦🇹', 'J'),
('Algeria', 'ALG', '🇩🇿', 'J'),
('Jordan', 'JOR', '🇯🇴', 'J'),
-- Group K
('Portugal', 'POR', '🇵🇹', 'K'),
('Colombia', 'COL', '🇨🇴', 'K'),
('Uzbekistan', 'UZB', '🇺🇿', 'K'),
('DR Congo', 'COD', '🇨🇩', 'K'),
-- Group L
('England', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'L'),
('Croatia', 'CRO', '🇭🇷', 'L'),
('Ghana', 'GHA', '🇬🇭', 'L'),
('Panama', 'PAN', '🇵🇦', 'L');
