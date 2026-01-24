-- Quiz Sets Feature
-- Migration: 0008_quiz_sets.sql
-- Adds support for quiz set collections with scheduling

-- Quiz Sets - metadata for quiz collections
CREATE TABLE IF NOT EXISTS quiz_sets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

-- Indexes for quiz_sets
CREATE INDEX IF NOT EXISTS idx_quiz_sets_user_id ON quiz_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sets_created_at ON quiz_sets(created_at DESC);

-- Quiz Set Items - individual quiz configurations within a set
CREATE TABLE IF NOT EXISTS quiz_set_items (
    id TEXT PRIMARY KEY,
    quiz_set_id TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    subject TEXT NOT NULL,
    theme TEXT,
    difficulty TEXT NOT NULL,
    styles TEXT NOT NULL,  -- JSON array of question styles
    question_count INTEGER NOT NULL,
    era TEXT DEFAULT 'current',
    enable_current_affairs INTEGER DEFAULT 0,
    current_affairs_theme TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (quiz_set_id) REFERENCES quiz_sets(id) ON DELETE CASCADE
);

-- Indexes for quiz_set_items
CREATE INDEX IF NOT EXISTS idx_quiz_set_items_quiz_set_id ON quiz_set_items(quiz_set_id);
CREATE INDEX IF NOT EXISTS idx_quiz_set_items_sequence ON quiz_set_items(quiz_set_id, sequence_number);

-- Quiz Set Schedules - cron-based scheduling (one per set)
CREATE TABLE IF NOT EXISTS quiz_set_schedules (
    id TEXT PRIMARY KEY,
    quiz_set_id TEXT NOT NULL UNIQUE,
    cron_expression TEXT NOT NULL,
    timezone TEXT DEFAULT 'Asia/Kolkata',
    is_enabled INTEGER DEFAULT 1,
    last_run_at INTEGER,
    next_run_at INTEGER,
    last_run_status TEXT,  -- success|partial|failed
    last_run_error TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (quiz_set_id) REFERENCES quiz_sets(id) ON DELETE CASCADE
);

-- Index for quiz_set_schedules
CREATE INDEX IF NOT EXISTS idx_quiz_set_schedules_enabled ON quiz_set_schedules(is_enabled, next_run_at);

-- Quiz Set Runs - tracks each generation run (manual or scheduled)
CREATE TABLE IF NOT EXISTS quiz_set_runs (
    id TEXT PRIMARY KEY,
    quiz_set_id TEXT NOT NULL,
    schedule_id TEXT,
    trigger_type TEXT NOT NULL,  -- manual|scheduled
    status TEXT DEFAULT 'running',  -- running|completed|partial|failed
    total_items INTEGER NOT NULL,
    completed_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,
    started_at INTEGER DEFAULT (unixepoch()),
    completed_at INTEGER,
    error TEXT,
    FOREIGN KEY (quiz_set_id) REFERENCES quiz_sets(id) ON DELETE CASCADE,
    FOREIGN KEY (schedule_id) REFERENCES quiz_set_schedules(id) ON DELETE SET NULL
);

-- Indexes for quiz_set_runs
CREATE INDEX IF NOT EXISTS idx_quiz_set_runs_quiz_set_id ON quiz_set_runs(quiz_set_id);
CREATE INDEX IF NOT EXISTS idx_quiz_set_runs_started_at ON quiz_set_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_set_runs_status ON quiz_set_runs(status);

-- Quiz Set Run Items - links generated quizzes to runs
CREATE TABLE IF NOT EXISTS quiz_set_run_items (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    quiz_set_item_id TEXT NOT NULL,
    quiz_id TEXT,
    status TEXT DEFAULT 'pending',  -- pending|generating|completed|failed
    error TEXT,
    started_at INTEGER,
    completed_at INTEGER,
    FOREIGN KEY (run_id) REFERENCES quiz_set_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (quiz_set_item_id) REFERENCES quiz_set_items(id) ON DELETE CASCADE,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE SET NULL
);

-- Indexes for quiz_set_run_items
CREATE INDEX IF NOT EXISTS idx_quiz_set_run_items_run_id ON quiz_set_run_items(run_id);
CREATE INDEX IF NOT EXISTS idx_quiz_set_run_items_status ON quiz_set_run_items(status);
