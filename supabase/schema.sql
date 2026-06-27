-- ============================================================
-- Flow Ledger — Supabase Schema (full cloud backup/sync mirror of local SQLite)
-- Paste into: supabase.com → your project → SQL Editor → New query
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS guards throughout).
--
-- Architecture:
--   • Local SQLite (electron/main.js) remains the source of truth — the app
--     works fully offline. This schema is a mirror used for backup + multi-
--     device access only.
--   • Auth is real Supabase Auth (see src/lib/supabase.js, AuthPage.jsx).
--     electron/main.js (ipc 'auth:supabaseLogin') creates the local `users`
--     row with id = supabaseUser.id, so auth.uid()::text always equals the
--     local user_id stored on every row below — RLS policies rely on this.
--   • Intentionally NOT mirrored to the cloud:
--       - spotify_tokens, google_oauth_creds  → OAuth client secrets/tokens,
--         must never leave the local machine.
--       - ai_user_patterns                    → global (no user_id), a
--         regenerable local heuristic cache, not user data worth backing up.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS ───────────────────────────────────────────────────────────────────
-- password_hash is never synced — Supabase Auth owns the real credential.
CREATE TABLE IF NOT EXISTS users (
  id                 TEXT PRIMARY KEY,
  username           TEXT UNIQUE NOT NULL,
  email              TEXT,
  daily_target_hours REAL NOT NULL DEFAULT 6,
  first_name         TEXT,
  last_name          TEXT,
  company            TEXT,
  industry           TEXT,
  team_size          TEXT,
  work_type          TEXT,
  workspace_name     TEXT,
  created_at         BIGINT,
  last_login         BIGINT
);

-- ─── SESSIONS (manual focus/meeting/break entries) ───────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT    PRIMARY KEY,
  user_id           TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category          TEXT    NOT NULL DEFAULT 'General',
  project_id        TEXT,
  client_id         TEXT,
  task_id           TEXT,
  title             TEXT,
  started_at        BIGINT  NOT NULL,
  ended_at          BIGINT,
  duration_seconds  INTEGER,
  is_deep_work      BOOLEAN NOT NULL DEFAULT FALSE,
  session_type      TEXT    NOT NULL DEFAULT 'focus',
  notes             TEXT,
  context_switches  INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_user_started ON sessions(user_id, started_at);
CREATE INDEX IF NOT EXISTS sessions_user_project  ON sessions(user_id, project_id);

-- ─── AUTO SESSIONS (automatic app/window/URL tracking + AI enrichment) ──────
CREATE TABLE IF NOT EXISTS auto_sessions (
  id                          TEXT    PRIMARY KEY,
  user_id                     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_name                    TEXT    NOT NULL,
  window_title                TEXT,
  url                         TEXT,
  started_at                  BIGINT  NOT NULL,
  ended_at                    BIGINT,
  duration_seconds            INTEGER NOT NULL DEFAULT 0,
  date_key                    TEXT    NOT NULL,
  is_idle                     BOOLEAN NOT NULL DEFAULT FALSE,
  project_id                  TEXT,
  client_id                   TEXT,
  ai_label                    TEXT,
  ai_category                 TEXT,
  ai_session_type             TEXT,
  ai_confidence                REAL   DEFAULT 0,
  ai_is_deep_work             BOOLEAN DEFAULT FALSE,
  ai_workflow_name            TEXT,
  workflow_id                 TEXT,
  supporting_tools            TEXT,
  ai_recommended_title        TEXT,
  ai_recommended_description  TEXT
);
CREATE INDEX IF NOT EXISTS auto_sessions_user_date    ON auto_sessions(user_id, date_key);
CREATE INDEX IF NOT EXISTS auto_sessions_user_started ON auto_sessions(user_id, started_at);

-- ─── APP USAGE ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_usage (
  id               TEXT    PRIMARY KEY,
  user_id          TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id       TEXT    REFERENCES sessions(id) ON DELETE SET NULL,
  app_name         TEXT    NOT NULL,
  window_title     TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  recorded_at      BIGINT  NOT NULL,
  date_key         TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS app_usage_user_date ON app_usage(user_id, date_key);

-- ─── CATEGORIES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#6366f1',
  icon         TEXT DEFAULT 'folder',
  session_type TEXT DEFAULT 'focus'
);

-- ─── CLIENTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id               TEXT    PRIMARY KEY,
  user_id          TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT    NOT NULL,
  email            TEXT,
  company          TEXT,
  color            TEXT    NOT NULL DEFAULT '#6366f1',
  hourly_rate      REAL    NOT NULL DEFAULT 0,
  monthly_retainer REAL    NOT NULL DEFAULT 0,
  included_hours   REAL    NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  keywords         TEXT,
  billing_type     TEXT    NOT NULL DEFAULT 'none',
  status           TEXT    NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PROJECTS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id                  TEXT    PRIMARY KEY,
  user_id             TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id           TEXT    REFERENCES clients(id) ON DELETE SET NULL,
  name                TEXT    NOT NULL,
  color               TEXT    NOT NULL DEFAULT '#3b82f6',
  hourly_rate         REAL    NOT NULL DEFAULT 0,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  keywords            TEXT,
  status              TEXT    NOT NULL DEFAULT 'active',
  weekly_budget_hours REAL    NOT NULL DEFAULT 0,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── GOALS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id           TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  target_hours REAL    NOT NULL,
  period       TEXT    NOT NULL DEFAULT 'daily',
  category     TEXT,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── STREAKS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS streaks (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id             TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  current_streak      INTEGER NOT NULL DEFAULT 0,
  longest_streak      INTEGER NOT NULL DEFAULT 0,
  last_completed_date TEXT
);

-- ─── FOCUS SCORES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS focus_scores (
  id              TEXT    PRIMARY KEY,
  user_id         TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_key        TEXT    NOT NULL,
  score           INTEGER NOT NULL DEFAULT 0,
  focus_seconds   INTEGER NOT NULL DEFAULT 0,
  meeting_seconds INTEGER NOT NULL DEFAULT 0,
  break_seconds   INTEGER NOT NULL DEFAULT 0,
  other_seconds   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, date_key)
);
CREATE INDEX IF NOT EXISTS focus_scores_user_date ON focus_scores(user_id, date_key);

-- ─── TAGS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  color   TEXT NOT NULL DEFAULT '#6366f1'
);

-- ─── SESSION TAGS (many-to-many) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_tags (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id)     ON DELETE CASCADE,
  PRIMARY KEY (session_id, tag_id)
);

-- ─── DISTRACTION RULES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS distraction_rules (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_type  TEXT    NOT NULL DEFAULT 'app',
  pattern    TEXT    NOT NULL,
  label      TEXT,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  profile_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── BLOCKER PROFILES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocker_profiles (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  color       TEXT    DEFAULT '#7C6CF2',
  active      BOOLEAN NOT NULL DEFAULT FALSE,
  placeholder INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── BREAK SETTINGS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS break_settings (
  id                  TEXT    PRIMARY KEY,
  user_id             TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  work_interval_mins  INTEGER NOT NULL DEFAULT 52,
  break_duration_mins INTEGER NOT NULL DEFAULT 17,
  reminder_style      TEXT    NOT NULL DEFAULT 'gentle',
  UNIQUE (user_id)
);

-- ─── TRACKING SETTINGS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracking_settings (
  id                  TEXT    PRIMARY KEY,
  user_id             TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auto_track          BOOLEAN NOT NULL DEFAULT TRUE,
  start_on_login      BOOLEAN NOT NULL DEFAULT TRUE,
  idle_threshold_secs INTEGER NOT NULL DEFAULT 60,
  blocked_attempts    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id)
);

-- ─── TRACKING EXCLUSIONS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracking_exclusions (
  user_id           TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  app_blacklist     TEXT NOT NULL DEFAULT '[]',
  website_blacklist TEXT NOT NULL DEFAULT '[]',
  private_apps      TEXT NOT NULL DEFAULT '[]'
);

-- ─── PENDING ENTRIES (unreviewed auto-captured blocks) ───────────────────────
CREATE TABLE IF NOT EXISTS pending_entries (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  date_key   TEXT    NOT NULL,
  reviewed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pending_entries_user_date ON pending_entries(user_id, date_key);

-- ─── TASKS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT    PRIMARY KEY,
  user_id         TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  description     TEXT,
  project_id      TEXT,
  client_id       TEXT,
  status          TEXT    NOT NULL DEFAULT 'todo',
  priority        INTEGER DEFAULT 3,
  keywords        TEXT,
  due_date        BIGINT,
  estimated_hours REAL,
  parent_task_id  TEXT,
  total_seconds   INTEGER DEFAULT 0,
  notes           TEXT,
  reminder_at     BIGINT,
  recurrence_rule TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tasks_user_status ON tasks(user_id, status);

-- ─── CALENDAR CONNECTIONS ────────────────────────────────────────────────────
-- access_token / refresh_token are intentionally included as nullable so the
-- table structure mirrors local SQLite, but the Electron sync layer should
-- NEVER push these two columns to Supabase — strip them before upsert.
CREATE TABLE IF NOT EXISTS calendar_connections (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  label         TEXT,
  ics_url       TEXT NOT NULL,
  color         TEXT DEFAULT '#3b82f6',
  last_synced   BIGINT,
  access_token  TEXT,   -- never synced from the client — see note above
  refresh_token TEXT,   -- never synced from the client — see note above
  token_expiry  BIGINT,
  account_email TEXT,
  google_cal_id TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CALENDAR EVENTS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
  id              TEXT    PRIMARY KEY,
  user_id         TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id   TEXT    NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
  provider        TEXT    NOT NULL,
  title           TEXT    NOT NULL,
  title_override  TEXT,
  description     TEXT,
  location        TEXT,
  meeting_url     TEXT,
  start_time      BIGINT  NOT NULL,
  end_time        BIGINT  NOT NULL,
  all_day         BOOLEAN NOT NULL DEFAULT FALSE,
  attendees_json  TEXT,
  color           TEXT    DEFAULT '#3b82f6',
  status          TEXT    DEFAULT 'confirmed',
  is_recurring    BOOLEAN NOT NULL DEFAULT FALSE,
  project_id      TEXT,
  client_id       TEXT,
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS calendar_events_user_start ON calendar_events(user_id, start_time);

-- ─── AI DAILY SCORES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_daily_scores (
  user_id                 TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_key                TEXT    NOT NULL,
  focus_score             INTEGER DEFAULT 0,
  workflow_score          INTEGER DEFAULT 0,
  distraction_resistance  INTEGER DEFAULT 0,
  efficiency_score        INTEGER DEFAULT 0,
  overall_score           INTEGER DEFAULT 0,
  deep_work_mins          INTEGER DEFAULT 0,
  distraction_mins        INTEGER DEFAULT 0,
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, date_key)
);

-- ─── AI SWITCH EVENTS (context-switch telemetry) ─────────────────────────────
CREATE TABLE IF NOT EXISTS ai_switch_events (
  id           BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id      TEXT   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_name     TEXT,
  url          TEXT,
  category     TEXT,
  session_type TEXT,
  ts           BIGINT
);
CREATE INDEX IF NOT EXISTS ai_switch_events_user_ts ON ai_switch_events(user_id, ts);

-- ─── AI SESSION DATA (1:1 enrichment of `sessions`) ──────────────────────────
CREATE TABLE IF NOT EXISTS ai_session_data (
  session_id        TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ai_label          TEXT,
  ai_category       TEXT,
  ai_session_type   TEXT,
  ai_confidence     REAL DEFAULT 0,
  ai_is_deep_work   BOOLEAN DEFAULT FALSE,
  ai_workflow_name  TEXT,
  ai_signals        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_usage            ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_scores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_tags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE distraction_rules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocker_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE break_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_exclusions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_daily_scores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_switch_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_session_data      ENABLE ROW LEVEL SECURITY;

-- ─── RLS POLICIES ────────────────────────────────────────────────────────────
-- auth.uid()::text always equals the local user_id (see header note), so a
-- straight equality check is sufficient — no extra header/claim plumbing needed.

DROP POLICY IF EXISTS "users: own row" ON users;
CREATE POLICY "users: own row" ON users FOR ALL USING (id = auth.uid()::text);

DROP POLICY IF EXISTS "sessions: own rows" ON sessions;
CREATE POLICY "sessions: own rows" ON sessions FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "auto_sessions: own rows" ON auto_sessions;
CREATE POLICY "auto_sessions: own rows" ON auto_sessions FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "app_usage: own rows" ON app_usage;
CREATE POLICY "app_usage: own rows" ON app_usage FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "categories: own rows" ON categories;
CREATE POLICY "categories: own rows" ON categories FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "clients: own rows" ON clients;
CREATE POLICY "clients: own rows" ON clients FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "projects: own rows" ON projects;
CREATE POLICY "projects: own rows" ON projects FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "goals: own rows" ON goals;
CREATE POLICY "goals: own rows" ON goals FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "streaks: own rows" ON streaks;
CREATE POLICY "streaks: own rows" ON streaks FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "focus_scores: own rows" ON focus_scores;
CREATE POLICY "focus_scores: own rows" ON focus_scores FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "tags: own rows" ON tags;
CREATE POLICY "tags: own rows" ON tags FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "distraction_rules: own rows" ON distraction_rules;
CREATE POLICY "distraction_rules: own rows" ON distraction_rules FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "blocker_profiles: own rows" ON blocker_profiles;
CREATE POLICY "blocker_profiles: own rows" ON blocker_profiles FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "break_settings: own rows" ON break_settings;
CREATE POLICY "break_settings: own rows" ON break_settings FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "tracking_settings: own rows" ON tracking_settings;
CREATE POLICY "tracking_settings: own rows" ON tracking_settings FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "tracking_exclusions: own rows" ON tracking_exclusions;
CREATE POLICY "tracking_exclusions: own rows" ON tracking_exclusions FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "pending_entries: own rows" ON pending_entries;
CREATE POLICY "pending_entries: own rows" ON pending_entries FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "tasks: own rows" ON tasks;
CREATE POLICY "tasks: own rows" ON tasks FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "calendar_connections: own rows" ON calendar_connections;
CREATE POLICY "calendar_connections: own rows" ON calendar_connections FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "calendar_events: own rows" ON calendar_events;
CREATE POLICY "calendar_events: own rows" ON calendar_events FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "ai_daily_scores: own rows" ON ai_daily_scores;
CREATE POLICY "ai_daily_scores: own rows" ON ai_daily_scores FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "ai_switch_events: own rows" ON ai_switch_events;
CREATE POLICY "ai_switch_events: own rows" ON ai_switch_events FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "ai_session_data: own rows" ON ai_session_data;
CREATE POLICY "ai_session_data: own rows" ON ai_session_data FOR ALL USING (user_id = auth.uid()::text);

-- session_tags has no user_id column directly — scope through the owning session.
DROP POLICY IF EXISTS "session_tags: own rows" ON session_tags;
CREATE POLICY "session_tags: own rows" ON session_tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_tags.session_id
        AND s.user_id = auth.uid()::text
    )
  );
