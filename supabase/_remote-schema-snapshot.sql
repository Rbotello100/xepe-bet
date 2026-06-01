


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."add_credits_atomic"("p_user_id" "uuid", "p_amount" numeric) RETURNS TABLE("success" boolean, "new_balance" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT false, (SELECT credits FROM profiles WHERE id = p_user_id);
    RETURN;
  END IF;

  UPDATE profiles
  SET credits = ROUND((credits + p_amount)::numeric, 2)
  WHERE id = p_user_id
  RETURNING credits INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric;
  ELSE
    RETURN QUERY SELECT true, v_new_balance;
  END IF;
END;
$$;


ALTER FUNCTION "public"."add_credits_atomic"("p_user_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_parlay_has_legs"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM parlay_legs WHERE parlay_id = NEW.id) THEN
    -- Solo validar después de un delay corto; el insert de parlay ocurre antes que legs
    -- Mejor: validar al leer, no al escribir. Ver alternativa abajo.
  END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."check_parlay_has_legs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_stale_casino_sessions"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."cleanup_stale_casino_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deduct_credits_atomic"("p_user_id" "uuid", "p_amount" numeric) RETURNS TABLE("success" boolean, "new_balance" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  -- Rechazar montos invalidos
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT false, (SELECT credits FROM profiles WHERE id = p_user_id);
    RETURN;
  END IF;

  -- UPDATE atomico con guard de saldo: solo descuenta si hay suficiente.
  -- Postgres serializa updates sobre el mismo row -> cero race condition.
  UPDATE profiles
  SET credits = ROUND((credits - p_amount)::numeric, 2)
  WHERE id = p_user_id
    AND credits >= p_amount
  RETURNING credits INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    -- No se actualizo: o el user no existe o no tenia saldo
    RETURN QUERY SELECT false, COALESCE((SELECT credits FROM profiles WHERE id = p_user_id), 0::numeric);
  ELSE
    RETURN QUERY SELECT true, v_new_balance;
  END IF;
END;
$$;


ALTER FUNCTION "public"."deduct_credits_atomic"("p_user_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, credits, total_points, is_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email, 'Usuario'),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NULL),
    1000,
    0,
    FALSE
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user failed: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."place_bet"("p_user_id" "uuid", "p_match_id" "uuid", "p_pick" "text", "p_amount" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_credits      numeric;
  v_status       text;
  v_odd          numeric;
  v_bet_id       uuid;
  v_potential    numeric;
  v_home         text;
  v_away         text;
begin
  select credits into v_credits from users where id = p_user_id;
  if v_credits < p_amount then
    raise exception 'Créditos insuficientes (tienes %, apostas %)', v_credits, p_amount;
  end if;

  select status, home_team, away_team,
    case p_pick
      when '1' then odd_home
      when 'X' then odd_draw
      when '2' then odd_away
    end
  into v_status, v_home, v_away, v_odd
  from matches where id = p_match_id;

  if v_status != 'open' then
    raise exception 'El partido no está abierto para apuestas';
  end if;

  v_potential := round(p_amount * v_odd, 2);

  update users
  set credits = credits - p_amount,
      total_wagered = total_wagered + p_amount,
      updated_at = now()
  where id = p_user_id;

  insert into bets (user_id, match_id, pick, odd, amount, potential_payout)
  values (p_user_id, p_match_id, p_pick, v_odd, p_amount, v_potential)
  returning id into v_bet_id;

  insert into transactions (user_id, type, amount, balance_after, description, reference_id)
  select p_user_id, 'bet_placed', -p_amount, credits,
    'Apostaste ' || p_amount || ' a ' || v_home || ' vs ' || v_away || ' (' || p_pick || ')',
    v_bet_id
  from users where id = p_user_id;

  return v_bet_id;
end;
$$;


ALTER FUNCTION "public"."place_bet"("p_user_id" "uuid", "p_match_id" "uuid", "p_pick" "text", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_match"("p_match_id" "uuid", "p_result" "text", "p_home_score" integer DEFAULT NULL::integer, "p_away_score" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  bet record;
  v_payout numeric;
begin
  update matches
  set status = 'finished',
      result = p_result,
      home_score = p_home_score,
      away_score = p_away_score,
      ends_at = now(),
      updated_at = now()
  where id = p_match_id;

  for bet in
    select b.*, u.credits as current_credits
    from bets b
    join users u on u.id = b.user_id
    where b.match_id = p_match_id and b.status = 'pending'
  loop
    if bet.pick = p_result then
      v_payout := bet.potential_payout;
      update bets set status = 'won', payout = v_payout, resolved_at = now(), updated_at = now() where id = bet.id;
      update users set credits = credits + v_payout, total_won = total_won + v_payout, updated_at = now() where id = bet.user_id;
      insert into transactions (user_id, type, amount, balance_after, description, reference_id)
      values (bet.user_id, 'bet_won', v_payout, bet.current_credits + v_payout,
        'Ganaste ' || v_payout || ' créditos', bet.id);
    else
      update bets set status = 'lost', payout = 0, resolved_at = now(), updated_at = now() where id = bet.id;
      insert into transactions (user_id, type, amount, balance_after, description, reference_id)
      values (bet.user_id, 'bet_lost', 0, bet.current_credits,
        'Perdiste tu apuesta de ' || bet.amount || ' créditos', bet.id);
    end if;
  end loop;
end;
$$;


ALTER FUNCTION "public"."resolve_match"("p_match_id" "uuid", "p_result" "text", "p_home_score" integer, "p_away_score" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_feed" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "description" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "activity_feed_action_type_check" CHECK (("action_type" = ANY (ARRAY['prediction'::"text", 'bet'::"text", 'cash_out'::"text", 'trivia'::"text", 'parlay'::"text", 'achievement'::"text"])))
);


ALTER TABLE "public"."activity_feed" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_feed" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" NOT NULL,
    "content" "text" NOT NULL,
    "metadata" "jsonb",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_feed_kind_check" CHECK (("kind" = ANY (ARRAY['summary'::"text", 'flash'::"text", 'analysis'::"text", 'trivia'::"text"])))
);


ALTER TABLE "public"."ai_feed" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "match_id" "uuid",
    "market_type" "text" DEFAULT '1x2'::"text" NOT NULL,
    "pick" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "odds_at_placement" numeric(5,2) NOT NULL,
    "potential_payout" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "cash_out_amount" numeric(10,2),
    "cashed_out_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "bets_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "bets_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'won'::"text", 'lost'::"text", 'cancelled'::"text", 'cashed_out'::"text"])))
);


ALTER TABLE "public"."bets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."casino_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "game" "text" NOT NULL,
    "bet_amount" numeric(10,2) NOT NULL,
    "win_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "net_amount" numeric(10,2) GENERATED ALWAYS AS (("win_amount" - "bet_amount")) STORED,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "casino_sessions_game_check" CHECK (("game" = ANY (ARRAY['slots'::"text", 'penalty'::"text", 'scratch'::"text", 'mines'::"text"])))
);


ALTER TABLE "public"."casino_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "avatar_url" "text",
    "credits" numeric(10,2) DEFAULT 1000.00 NOT NULL,
    "total_points" integer DEFAULT 0 NOT NULL,
    "is_admin" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "terms_accepted_at" timestamp with time zone,
    CONSTRAINT "credits_non_negative" CHECK (("credits" >= (0)::numeric))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."casino_pnl_leaderboard" AS
 SELECT "cs"."user_id",
    "p"."display_name",
    "p"."avatar_url",
    ("sum"("cs"."net_amount"))::numeric(10,2) AS "total_pnl",
    ("count"(*))::integer AS "plays",
    ("count"(*) FILTER (WHERE ("cs"."net_amount" > (0)::numeric)))::integer AS "wins",
    "round"(((("count"(*) FILTER (WHERE ("cs"."net_amount" > (0)::numeric)))::numeric / (NULLIF("count"(*), 0))::numeric) * (100)::numeric), 1) AS "hit_rate_pct"
   FROM ("public"."casino_sessions" "cs"
     JOIN "public"."profiles" "p" ON (("p"."id" = "cs"."user_id")))
  WHERE ("cs"."bet_amount" > (0)::numeric)
  GROUP BY "cs"."user_id", "p"."display_name", "p"."avatar_url";


ALTER VIEW "public"."casino_pnl_leaderboard" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "type" "text" NOT NULL,
    "balance_after" numeric(10,2) NOT NULL,
    "reference_id" "uuid",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "credit_transactions_type_check" CHECK (("type" = ANY (ARRAY['signup'::"text", 'bet'::"text", 'win'::"text", 'cash_out'::"text", 'trivia'::"text", 'parlay'::"text", 'refund'::"text", 'casino_bet'::"text", 'casino_win'::"text"])))
);


ALTER TABLE "public"."credit_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."felipe_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "bets" "jsonb" NOT NULL,
    "total_bet" numeric(10,2) NOT NULL,
    "winning_room" "text",
    "payout" numeric(10,2),
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "revealed_at" timestamp with time zone,
    CONSTRAINT "felipe_sessions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'revealed'::"text", 'expired'::"text"]))),
    CONSTRAINT "felipe_sessions_total_bet_check" CHECK (("total_bet" > (0)::numeric))
);


ALTER TABLE "public"."felipe_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_markets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "market_type" "text" NOT NULL,
    "options" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "winning_option" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."match_markets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "home_team_id" "uuid" NOT NULL,
    "away_team_id" "uuid" NOT NULL,
    "group_name" character(1),
    "round" "text" DEFAULT 'group'::"text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "home_score" integer,
    "away_score" integer,
    "odds_home" numeric(5,2),
    "odds_draw" numeric(5,2),
    "odds_away" numeric(5,2),
    "external_id" "text",
    "odds_updated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "odds_synced" boolean DEFAULT false,
    "odds_sync_attempts" integer DEFAULT 0,
    "score_synced" boolean DEFAULT false,
    "score_sync_attempts" integer DEFAULT 0,
    "sport_key" "text" DEFAULT 'soccer_fifa_world_cup'::"text" NOT NULL,
    CONSTRAINT "matches_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'open'::"text", 'live'::"text", 'finished'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mines_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "bet_amount" numeric(10,2) NOT NULL,
    "mine_count" integer NOT NULL,
    "mine_positions" integer[] NOT NULL,
    "safe_revealed" integer[] DEFAULT '{}'::integer[] NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "current_multiplier" numeric(10,4) DEFAULT 1.0,
    "payout" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ended_at" timestamp with time zone,
    CONSTRAINT "mines_sessions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'cashed_out'::"text", 'busted'::"text"])))
);


ALTER TABLE "public"."mines_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."odds_api_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "endpoint" "text" NOT NULL,
    "sport_key" "text" NOT NULL,
    "credits_used" integer NOT NULL,
    "remaining" integer NOT NULL,
    "triggered_by" "text" NOT NULL,
    "result_summary" "jsonb",
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."odds_api_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parlay_legs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parlay_id" "uuid" NOT NULL,
    "match_id" "uuid",
    "market_type" "text" NOT NULL,
    "pick" "text" NOT NULL,
    "odds" numeric(5,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    CONSTRAINT "parlay_legs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'won'::"text", 'lost'::"text", 'void'::"text"])))
);


ALTER TABLE "public"."parlay_legs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parlays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "total_odds" numeric(10,2) NOT NULL,
    "potential_payout" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "parlays_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "parlays_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'won'::"text", 'lost'::"text", 'void'::"text"])))
);


ALTER TABLE "public"."parlays" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."penalty_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "bet_amount" numeric(10,2) NOT NULL,
    "goals_scored" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "payout" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ended_at" timestamp with time zone,
    CONSTRAINT "penalty_sessions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'cashed_out'::"text", 'busted'::"text"])))
);


ALTER TABLE "public"."penalty_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."predictions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "match_id" "uuid" NOT NULL,
    "predicted_winner" "text",
    "predicted_home_score" integer,
    "predicted_away_score" integer,
    "points_earned" integer DEFAULT 0,
    "is_correct" boolean,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "predictions_predicted_winner_check" CHECK (("predicted_winner" = ANY (ARRAY['home'::"text", 'draw'::"text", 'away'::"text"])))
);


ALTER TABLE "public"."predictions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scoring_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "correct_winner_points" integer DEFAULT 3 NOT NULL,
    "exact_score_points" integer DEFAULT 5 NOT NULL,
    "correct_goal_diff_points" integer DEFAULT 2 NOT NULL,
    "group_winner_points" integer DEFAULT 10 NOT NULL,
    "champion_points" integer DEFAULT 20 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."scoring_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scratch_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "bet_amount" numeric(10,2) NOT NULL,
    "cells" "text"[] NOT NULL,
    "prize_symbol" "text",
    "prize_amount" numeric(10,2) DEFAULT 0,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "claimed_at" timestamp with time zone,
    CONSTRAINT "scratch_sessions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'claimed'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."scratch_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."special_bets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "market" "text" NOT NULL,
    "pick" "text" NOT NULL,
    "group_name" "text",
    "phase" "text",
    "odd" numeric(6,2) NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "potential_payout" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payout" numeric(10,2) DEFAULT 0,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "special_bets_amount_check" CHECK (("amount" >= (1)::numeric)),
    CONSTRAINT "special_bets_market_check" CHECK (("market" = ANY (ARRAY['champion'::"text", 'group_winner'::"text", 'phase'::"text", 'top_scorer'::"text"]))),
    CONSTRAINT "special_bets_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'won'::"text", 'lost'::"text", 'void'::"text"])))
);


ALTER TABLE "public"."special_bets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."special_markets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "options" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "winning_option" "text",
    "closes_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."special_markets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "fifa_code" character(3) NOT NULL,
    "flag" "text" NOT NULL,
    "group_name" character(1) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "balance_after" numeric(10,2) NOT NULL,
    "description" "text",
    "reference_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transactions_type_check" CHECK (("type" = ANY (ARRAY['initial'::"text", 'bet_placed'::"text", 'bet_won'::"text", 'bet_lost'::"text", 'bet_void'::"text", 'parlay_placed'::"text", 'parlay_won'::"text", 'parlay_lost'::"text", 'parlay_void'::"text", 'special_placed'::"text", 'special_won'::"text", 'special_lost'::"text", 'manual_adjust'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trivia_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "selected_option" integer NOT NULL,
    "is_correct" boolean NOT NULL,
    "time_taken_ms" integer
);


ALTER TABLE "public"."trivia_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trivia_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question" "text" NOT NULL,
    "options" "jsonb" NOT NULL,
    "correct_option" integer NOT NULL,
    "difficulty" "text" DEFAULT 'medium'::"text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "trivia_questions_category_check" CHECK (("category" = ANY (ARRAY['general'::"text", 'history'::"text", 'rules'::"text", 'world_cup_2026'::"text", 'players'::"text", 'stats'::"text"]))),
    CONSTRAINT "trivia_questions_difficulty_check" CHECK (("difficulty" = ANY (ARRAY['easy'::"text", 'medium'::"text", 'hard'::"text"])))
);


ALTER TABLE "public"."trivia_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trivia_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "total_questions" integer NOT NULL,
    "correct_answers" integer DEFAULT 0 NOT NULL,
    "credits_earned" numeric(10,2) DEFAULT 0 NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trivia_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "avatar" "text",
    "credits" numeric(10,2) DEFAULT 100.00 NOT NULL,
    "total_wagered" numeric(10,2) DEFAULT 0 NOT NULL,
    "total_won" numeric(10,2) DEFAULT 0 NOT NULL,
    "is_admin" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "users_credits_check" CHECK (("credits" >= (0)::numeric))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_feed"
    ADD CONSTRAINT "activity_feed_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_feed"
    ADD CONSTRAINT "ai_feed_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bets"
    ADD CONSTRAINT "bets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."casino_sessions"
    ADD CONSTRAINT "casino_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_transactions"
    ADD CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."felipe_sessions"
    ADD CONSTRAINT "felipe_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_markets"
    ADD CONSTRAINT "match_markets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_external_id_key" UNIQUE ("external_id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mines_sessions"
    ADD CONSTRAINT "mines_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."odds_api_usage"
    ADD CONSTRAINT "odds_api_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parlay_legs"
    ADD CONSTRAINT "parlay_legs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parlays"
    ADD CONSTRAINT "parlays_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."penalty_sessions"
    ADD CONSTRAINT "penalty_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."predictions"
    ADD CONSTRAINT "predictions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."predictions"
    ADD CONSTRAINT "predictions_user_id_match_id_key" UNIQUE ("user_id", "match_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scoring_config"
    ADD CONSTRAINT "scoring_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scratch_sessions"
    ADD CONSTRAINT "scratch_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."special_bets"
    ADD CONSTRAINT "special_bets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."special_bets"
    ADD CONSTRAINT "special_bets_user_id_market_pick_group_name_key" UNIQUE ("user_id", "market", "pick", "group_name");



ALTER TABLE ONLY "public"."special_markets"
    ADD CONSTRAINT "special_markets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_fifa_code_key" UNIQUE ("fifa_code");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trivia_answers"
    ADD CONSTRAINT "trivia_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trivia_questions"
    ADD CONSTRAINT "trivia_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trivia_sessions"
    ADD CONSTRAINT "trivia_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_activity_feed_created" ON "public"."activity_feed" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ai_feed_active_created" ON "public"."ai_feed" USING "btree" ("is_active", "created_at" DESC) WHERE ("is_active" = true);



CREATE INDEX "idx_bets_match" ON "public"."bets" USING "btree" ("match_id");



CREATE INDEX "idx_bets_user" ON "public"."bets" USING "btree" ("user_id");



CREATE INDEX "idx_casino_sessions_game" ON "public"."casino_sessions" USING "btree" ("game", "created_at" DESC);



CREATE INDEX "idx_casino_sessions_user" ON "public"."casino_sessions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_credit_tx_user" ON "public"."credit_transactions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_felipe_sessions_user_created" ON "public"."felipe_sessions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_felipe_sessions_user_status" ON "public"."felipe_sessions" USING "btree" ("user_id", "status") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_matches_odds_pending" ON "public"."matches" USING "btree" ("starts_at") WHERE (("odds_synced" = false) AND ("status" = ANY (ARRAY['scheduled'::"text", 'open'::"text"])));



CREATE INDEX "idx_matches_score_pending" ON "public"."matches" USING "btree" ("starts_at") WHERE (("score_synced" = false) AND ("status" <> 'finished'::"text"));



CREATE INDEX "idx_matches_sport_key_pending" ON "public"."matches" USING "btree" ("sport_key") WHERE (("score_synced" = false) AND ("status" <> 'finished'::"text"));



CREATE INDEX "idx_matches_status" ON "public"."matches" USING "btree" ("status", "starts_at");



CREATE INDEX "idx_mines_sessions_active" ON "public"."mines_sessions" USING "btree" ("user_id", "status") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_odds_api_usage_created" ON "public"."odds_api_usage" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_odds_api_usage_endpoint" ON "public"."odds_api_usage" USING "btree" ("endpoint", "created_at" DESC);



CREATE INDEX "idx_parlays_user" ON "public"."parlays" USING "btree" ("user_id");



CREATE INDEX "idx_penalty_sessions_active" ON "public"."penalty_sessions" USING "btree" ("user_id", "status") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_predictions_match" ON "public"."predictions" USING "btree" ("match_id");



CREATE INDEX "idx_predictions_user" ON "public"."predictions" USING "btree" ("user_id");



CREATE INDEX "idx_scratch_sessions_active" ON "public"."scratch_sessions" USING "btree" ("user_id", "status") WHERE ("status" = 'active'::"text");



CREATE UNIQUE INDEX "idx_trivia_one_per_day" ON "public"."trivia_sessions" USING "btree" ("user_id", ((("completed_at" AT TIME ZONE 'UTC'::"text"))::"date"));



CREATE INDEX "idx_trivia_sessions_user" ON "public"."trivia_sessions" USING "btree" ("user_id", "completed_at");



CREATE INDEX "special_bets_market_idx" ON "public"."special_bets" USING "btree" ("market");



CREATE INDEX "special_bets_user_id_idx" ON "public"."special_bets" USING "btree" ("user_id");



CREATE INDEX "transactions_created_at_idx" ON "public"."transactions" USING "btree" ("created_at" DESC);



CREATE INDEX "transactions_user_id_idx" ON "public"."transactions" USING "btree" ("user_id");



ALTER TABLE ONLY "public"."activity_feed"
    ADD CONSTRAINT "activity_feed_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bets"
    ADD CONSTRAINT "bets_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id");



ALTER TABLE ONLY "public"."bets"
    ADD CONSTRAINT "bets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."casino_sessions"
    ADD CONSTRAINT "casino_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_transactions"
    ADD CONSTRAINT "credit_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."felipe_sessions"
    ADD CONSTRAINT "felipe_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_markets"
    ADD CONSTRAINT "match_markets_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."mines_sessions"
    ADD CONSTRAINT "mines_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parlay_legs"
    ADD CONSTRAINT "parlay_legs_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id");



ALTER TABLE ONLY "public"."parlay_legs"
    ADD CONSTRAINT "parlay_legs_parlay_id_fkey" FOREIGN KEY ("parlay_id") REFERENCES "public"."parlays"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parlays"
    ADD CONSTRAINT "parlays_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."penalty_sessions"
    ADD CONSTRAINT "penalty_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."predictions"
    ADD CONSTRAINT "predictions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id");



ALTER TABLE ONLY "public"."predictions"
    ADD CONSTRAINT "predictions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scratch_sessions"
    ADD CONSTRAINT "scratch_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."special_bets"
    ADD CONSTRAINT "special_bets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trivia_answers"
    ADD CONSTRAINT "trivia_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."trivia_questions"("id");



ALTER TABLE ONLY "public"."trivia_answers"
    ADD CONSTRAINT "trivia_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."trivia_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trivia_sessions"
    ADD CONSTRAINT "trivia_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE "public"."activity_feed" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_feed_insert" ON "public"."activity_feed" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "activity_feed_read" ON "public"."activity_feed" FOR SELECT USING (true);



ALTER TABLE "public"."ai_feed" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_feed_read_all" ON "public"."ai_feed" FOR SELECT USING (true);



ALTER TABLE "public"."bets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bets_insert_own" ON "public"."bets" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "bets_read_own" ON "public"."bets" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."casino_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credit_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_tx_insert" ON "public"."credit_transactions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "credit_tx_read_own" ON "public"."credit_transactions" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."felipe_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "felipe_sessions_read_own" ON "public"."felipe_sessions" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."match_markets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "match_markets_read" ON "public"."match_markets" FOR SELECT USING (true);



ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "matches_read" ON "public"."matches" FOR SELECT USING (true);



ALTER TABLE "public"."mines_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."odds_api_usage" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "odds_api_usage_admin_read" ON "public"."odds_api_usage" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



ALTER TABLE "public"."parlay_legs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parlay_legs_insert" ON "public"."parlay_legs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."parlays"
  WHERE (("parlays"."id" = "parlay_legs"."parlay_id") AND ("parlays"."user_id" = "auth"."uid"())))));



CREATE POLICY "parlay_legs_read" ON "public"."parlay_legs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."parlays"
  WHERE (("parlays"."id" = "parlay_legs"."parlay_id") AND ("parlays"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."parlays" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parlays_insert_own" ON "public"."parlays" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "parlays_read_own" ON "public"."parlays" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."penalty_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."predictions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "predictions_insert_own" ON "public"."predictions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "predictions_read_others" ON "public"."predictions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."matches"
  WHERE (("matches"."id" = "predictions"."match_id") AND ("matches"."starts_at" <= "now"())))));



CREATE POLICY "predictions_read_own" ON "public"."predictions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "predictions_update_own" ON "public"."predictions" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_read" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."scoring_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scoring_config_read" ON "public"."scoring_config" FOR SELECT USING (true);



ALTER TABLE "public"."scratch_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."special_markets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "special_markets_read" ON "public"."special_markets" FOR SELECT USING (true);



ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teams_read" ON "public"."teams" FOR SELECT USING (true);



ALTER TABLE "public"."trivia_answers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trivia_answers_insert_own" ON "public"."trivia_answers" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."trivia_sessions"
  WHERE (("trivia_sessions"."id" = "trivia_answers"."session_id") AND ("trivia_sessions"."user_id" = "auth"."uid"())))));



CREATE POLICY "trivia_answers_read_own" ON "public"."trivia_answers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."trivia_sessions"
  WHERE (("trivia_sessions"."id" = "trivia_answers"."session_id") AND ("trivia_sessions"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."trivia_questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trivia_questions_read" ON "public"."trivia_questions" FOR SELECT USING (true);



ALTER TABLE "public"."trivia_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trivia_sessions_insert_own" ON "public"."trivia_sessions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "trivia_sessions_read_own" ON "public"."trivia_sessions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users see own mines sessions" ON "public"."mines_sessions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users see own penalty sessions" ON "public"."penalty_sessions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users see own scratch sessions" ON "public"."scratch_sessions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users see own sessions" ON "public"."casino_sessions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_credits_atomic"("p_user_id" "uuid", "p_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_credits_atomic"("p_user_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."add_credits_atomic"("p_user_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_credits_atomic"("p_user_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_parlay_has_legs"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_parlay_has_legs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_parlay_has_legs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_stale_casino_sessions"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_stale_casino_sessions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_stale_casino_sessions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."deduct_credits_atomic"("p_user_id" "uuid", "p_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deduct_credits_atomic"("p_user_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_credits_atomic"("p_user_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_credits_atomic"("p_user_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."place_bet"("p_user_id" "uuid", "p_match_id" "uuid", "p_pick" "text", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."place_bet"("p_user_id" "uuid", "p_match_id" "uuid", "p_pick" "text", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."place_bet"("p_user_id" "uuid", "p_match_id" "uuid", "p_pick" "text", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_match"("p_match_id" "uuid", "p_result" "text", "p_home_score" integer, "p_away_score" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_match"("p_match_id" "uuid", "p_result" "text", "p_home_score" integer, "p_away_score" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_match"("p_match_id" "uuid", "p_result" "text", "p_home_score" integer, "p_away_score" integer) TO "service_role";



GRANT ALL ON TABLE "public"."activity_feed" TO "anon";
GRANT ALL ON TABLE "public"."activity_feed" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_feed" TO "service_role";



GRANT ALL ON TABLE "public"."ai_feed" TO "anon";
GRANT ALL ON TABLE "public"."ai_feed" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_feed" TO "service_role";



GRANT ALL ON TABLE "public"."bets" TO "anon";
GRANT ALL ON TABLE "public"."bets" TO "authenticated";
GRANT ALL ON TABLE "public"."bets" TO "service_role";



GRANT ALL ON TABLE "public"."casino_sessions" TO "anon";
GRANT ALL ON TABLE "public"."casino_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."casino_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."casino_pnl_leaderboard" TO "anon";
GRANT ALL ON TABLE "public"."casino_pnl_leaderboard" TO "authenticated";
GRANT ALL ON TABLE "public"."casino_pnl_leaderboard" TO "service_role";



GRANT ALL ON TABLE "public"."credit_transactions" TO "anon";
GRANT ALL ON TABLE "public"."credit_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."felipe_sessions" TO "anon";
GRANT ALL ON TABLE "public"."felipe_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."felipe_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."match_markets" TO "anon";
GRANT ALL ON TABLE "public"."match_markets" TO "authenticated";
GRANT ALL ON TABLE "public"."match_markets" TO "service_role";



GRANT ALL ON TABLE "public"."matches" TO "anon";
GRANT ALL ON TABLE "public"."matches" TO "authenticated";
GRANT ALL ON TABLE "public"."matches" TO "service_role";



GRANT ALL ON TABLE "public"."mines_sessions" TO "anon";
GRANT ALL ON TABLE "public"."mines_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."mines_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."odds_api_usage" TO "anon";
GRANT ALL ON TABLE "public"."odds_api_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."odds_api_usage" TO "service_role";



GRANT ALL ON TABLE "public"."parlay_legs" TO "anon";
GRANT ALL ON TABLE "public"."parlay_legs" TO "authenticated";
GRANT ALL ON TABLE "public"."parlay_legs" TO "service_role";



GRANT ALL ON TABLE "public"."parlays" TO "anon";
GRANT ALL ON TABLE "public"."parlays" TO "authenticated";
GRANT ALL ON TABLE "public"."parlays" TO "service_role";



GRANT ALL ON TABLE "public"."penalty_sessions" TO "anon";
GRANT ALL ON TABLE "public"."penalty_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."penalty_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."predictions" TO "anon";
GRANT ALL ON TABLE "public"."predictions" TO "authenticated";
GRANT ALL ON TABLE "public"."predictions" TO "service_role";



GRANT ALL ON TABLE "public"."scoring_config" TO "anon";
GRANT ALL ON TABLE "public"."scoring_config" TO "authenticated";
GRANT ALL ON TABLE "public"."scoring_config" TO "service_role";



GRANT ALL ON TABLE "public"."scratch_sessions" TO "anon";
GRANT ALL ON TABLE "public"."scratch_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."scratch_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."special_bets" TO "anon";
GRANT ALL ON TABLE "public"."special_bets" TO "authenticated";
GRANT ALL ON TABLE "public"."special_bets" TO "service_role";



GRANT ALL ON TABLE "public"."special_markets" TO "anon";
GRANT ALL ON TABLE "public"."special_markets" TO "authenticated";
GRANT ALL ON TABLE "public"."special_markets" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."trivia_answers" TO "anon";
GRANT ALL ON TABLE "public"."trivia_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."trivia_answers" TO "service_role";



GRANT ALL ON TABLE "public"."trivia_questions" TO "anon";
GRANT ALL ON TABLE "public"."trivia_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."trivia_questions" TO "service_role";



GRANT ALL ON TABLE "public"."trivia_sessions" TO "anon";
GRANT ALL ON TABLE "public"."trivia_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."trivia_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







