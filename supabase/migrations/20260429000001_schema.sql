-- pet-trainer schema migration (SPEC.md §5.1)
-- All tables in dependency order: profiles → pets → quests → quest_progress → events → xp_ledger → leaderboard_snapshots

SET search_path TO public;

-- =========================
-- USERS (extends auth.users)
-- =========================
CREATE TABLE public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     TEXT UNIQUE NOT NULL,
  github_login TEXT UNIQUE NOT NULL,
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  preferences  JSONB DEFAULT '{}'::jsonb
);

-- =========================
-- PETS (1:1 with user in MVP)
-- =========================
CREATE TABLE public.pets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  species      TEXT NOT NULL DEFAULT 'gh0stnel',
  stage        SMALLINT NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 5),
  xp           INT NOT NULL DEFAULT 0,
  hunger       SMALLINT NOT NULL DEFAULT 100 CHECK (hunger BETWEEN 0 AND 100),
  energy       SMALLINT NOT NULL DEFAULT 100 CHECK (energy BETWEEN 0 AND 100),
  happiness    SMALLINT NOT NULL DEFAULT 100 CHECK (happiness BETWEEN 0 AND 100),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id)
);

-- =========================
-- QUEST CATALOG (seed-driven)
-- =========================
CREATE TABLE public.quests (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  difficulty    SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  xp_reward     INT NOT NULL,
  required_tool TEXT,
  match_rule    JSONB NOT NULL,
  category      TEXT NOT NULL,
  unlocks_after TEXT[]  DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =========================
-- QUEST PROGRESS
-- =========================
CREATE TABLE public.quest_progress (
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quest_id     TEXT NOT NULL REFERENCES public.quests(id),
  status       TEXT NOT NULL CHECK (status IN ('locked','available','in_progress','completed')),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  evidence     JSONB,
  PRIMARY KEY (user_id, quest_id)
);

-- =========================
-- EVENTS (raw log, partitioned by ingested_at month)
-- NOTE: every query MUST include ingested_at in WHERE clause to avoid full partition scan.
-- =========================
CREATE TABLE public.events (
  id              BIGSERIAL,
  user_id         UUID NOT NULL,
  session_id      TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  tool_name       TEXT,
  payload         JSONB NOT NULL,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key TEXT NOT NULL,
  PRIMARY KEY (id, ingested_at)
) PARTITION BY RANGE (ingested_at);

CREATE UNIQUE INDEX events_idem_idx ON public.events (idempotency_key, ingested_at);

-- =========================
-- XP LEDGER (audit trail)
-- =========================
CREATE TABLE public.xp_ledger (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES public.profiles(id),
  delta      INT NOT NULL,
  reason     TEXT NOT NULL,
  ref_id     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- LEADERBOARD SNAPSHOTS (Redis ZSET → Postgres cold storage)
-- Persisted by the leaderboard slice (§4.2). Append-only, system-managed.
-- =========================
CREATE TABLE public.leaderboard_snapshots (
  id         BIGSERIAL PRIMARY KEY,
  period     TEXT NOT NULL,
  snapshot   JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
