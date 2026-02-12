-- Quiz set notifiers (extensible destinations)
-- Migration: 0013_quiz_set_notifiers.sql

CREATE TABLE IF NOT EXISTS notification_destinations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,

    -- Scope allows future expansion beyond quiz sets.
    scope_type TEXT NOT NULL,          -- e.g. "quiz_set"
    scope_id TEXT NOT NULL,            -- e.g. quiz_sets.id

    provider TEXT NOT NULL,            -- e.g. "discord_webhook"
    label TEXT,
    target_url TEXT NOT NULL,

    events TEXT NOT NULL,              -- JSON array of event names
    is_enabled INTEGER NOT NULL DEFAULT 1,

    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_notification_dest_scope
  ON notification_destinations(scope_type, scope_id, is_enabled);

CREATE INDEX IF NOT EXISTS idx_notification_dest_user
  ON notification_destinations(user_id, created_at DESC);
