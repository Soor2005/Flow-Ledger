-- ============================================================
-- Flow Ledger — Supabase Schema (full sync with local SQLite)
-- Paste into: supabase.com → your project → SQL Editor → New query
-- Run once on a fresh project. Safe to re-run (IF NOT EXISTS guards).
-- ============================================================

-- ─── EXTENSIONS ──────────────────────────────────────────────────────────────
-- uuid_generate_v4() used for default IDs if you insert from Supabase directly
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS ───────────────────────────────────────────────────────────────────
-- NOTE: password_hash is stored locally only and intentionally omitted here.
--       Auth is handled by Electron; Supabase is used as a sync/backup store.
CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  username            TEXT UNIQUE NOT NULL,
  email               TEXT UNIQUE,
  daily_target_hours  REAL        NOT NULL DEFAULT 6,
  created_at          BIGINT,
  last_login          BIGINT
);

-- ─── SESSIONS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT    PRIMARY KEY,
  user_id          TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category         TEXT    NOT NULL DEFAULT 'General',
  project_id       TEXT,
  client_id        TEXT,
  title            TEXT,
  started_at       BIGINT  NOT NULL,
  ended_at         BIGINT,
  duration_seconds INTEGER,
  is_deep_work     BOOLEAN NOT NULL DEFAULT FALSE,
  session_type     TEXT    NOT NULL DEFAULT 'focus'
                   CHECK (session_type IN ('focus','meeting','break','other')),
  notes            TEXT,
  context_switches INTEGER NOT NULL DEFAULT 0,
  is_billable      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_user_started ON sessions(user_id, started_at);
CREATE INDEX IF NOT EXISTS sessions_user_project  ON sessions(user_id, project_id);

-- ─── AUTO SESSIONS (automatic window/URL tracking) ───────────────────────────
CREATE TABLE IF NOT EXISTS auto_sessions (
  id               TEXT    PRIMARY KEY,
  user_id          TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_name         TEXT    NOT NULL,
  window_title     TEXT,
  url              TEXT,
  started_at       BIGINT  NOT NULL,
  ended_at         BIGINT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  date_key         TEXT    NOT NULL,
  is_idle          BOOLEAN NOT NULL DEFAULT FALSE
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
  id           TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  email        TEXT,
  company      TEXT,
  color        TEXT    NOT NULL DEFAULT '#6366f1',
  hourly_rate  REAL    NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PROJECTS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id           TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id    TEXT    REFERENCES clients(id) ON DELETE SET NULL,
  name         TEXT    NOT NULL,
  color        TEXT    NOT NULL DEFAULT '#3b82f6',
  hourly_rate  REAL    NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── GOALS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id           TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  target_hours REAL    NOT NULL,
  period       TEXT    NOT NULL DEFAULT 'daily'
               CHECK (period IN ('daily','weekly','monthly')),
  category     TEXT,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── STREAKS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS streaks (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id              TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  current_streak       INTEGER NOT NULL DEFAULT 0,
  longest_streak       INTEGER NOT NULL DEFAULT 0,
  last_completed_date  TEXT
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
  rule_type  TEXT    NOT NULL DEFAULT 'app'
             CHECK (rule_type IN ('app','url','title')),
  pattern    TEXT    NOT NULL,
  label      TEXT,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── BREAK SETTINGS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS break_settings (
  id                  TEXT    PRIMARY KEY,
  user_id             TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  work_interval_mins  INTEGER NOT NULL DEFAULT 52,
  break_duration_mins INTEGER NOT NULL DEFAULT 17,
  reminder_style      TEXT    NOT NULL DEFAULT 'gentle'
                      CHECK (reminder_style IN ('gentle','firm','silent')),
  UNIQUE (user_id)
);

-- ─── TRACKING SETTINGS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracking_settings (
  id                  TEXT    PRIMARY KEY,
  user_id             TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auto_track          BOOLEAN NOT NULL DEFAULT TRUE,
  start_on_login      BOOLEAN NOT NULL DEFAULT FALSE,
  idle_threshold_secs INTEGER NOT NULL DEFAULT 60,
  blocked_attempts    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id)
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

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_usage          ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_scores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags               ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_tags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE distraction_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE break_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_entries    ENABLE ROW LEVEL SECURITY;

-- ─── RLS POLICIES ────────────────────────────────────────────────────────────
-- Uses auth.uid()::text to match the TEXT user_id stored by Electron.
-- The app sets the Supabase anon key and passes user_id from local auth.

CREATE POLICY "users: own row"             ON users             FOR ALL USING (id = auth.uid()::text);
CREATE POLICY "sessions: own rows"         ON sessions          FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "auto_sessions: own rows"    ON auto_sessions     FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "app_usage: own rows"        ON app_usage         FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "categories: own rows"       ON categories        FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "clients: own rows"          ON clients           FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "projects: own rows"         ON projects          FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "goals: own rows"            ON goals             FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "streaks: own rows"          ON streaks           FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "focus_scores: own rows"     ON focus_scores      FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "tags: own rows"             ON tags              FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "distraction_rules: own"     ON distraction_rules FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "break_settings: own"        ON break_settings    FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "tracking_settings: own"     ON tracking_settings FOR ALL USING (user_id = auth.uid()::text);
CREATE POLICY "pending_entries: own"       ON pending_entries   FOR ALL USING (user_id = auth.uid()::text);

-- session_tags: allow if the user owns the session
CREATE POLICY "session_tags: own rows" ON session_tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_tags.session_id
        AND s.user_id = auth.uid()::text
    )
  );
