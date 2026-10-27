-- Jatayu accounts — Cloudflare D1 (SQLite).
--
-- Apply with:
--   wrangler d1 execute jatayu --remote --file=./schema.sql
--
-- Design notes:
--  * No passwords are stored anywhere. Sign-in is a 6-digit code by email.
--  * Only hashes of codes and session tokens are stored, so a database dump
--    does not hand anyone a live session or a usable code.
--  * saved_searches keeps the filters alongside the query, because "chai"
--    near Mumbai is a different search from "chai" anywhere.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,          -- lowercased
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  digest_freq    TEXT NOT NULL DEFAULT 'off'    -- off | daily | weekly
);

CREATE TABLE IF NOT EXISTS login_codes (
  email       TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS saved_searches (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query       TEXT NOT NULL,
  filters     TEXT,                             -- JSON: {type, location, radiusKm}
  pinned      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_searches(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS prefs (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme       TEXT,                             -- JSON theme object
  lang        TEXT,
  safe_search INTEGER NOT NULL DEFAULT 1,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key         TEXT PRIMARY KEY,
  count       INTEGER NOT NULL,
  reset_at    INTEGER NOT NULL
);
