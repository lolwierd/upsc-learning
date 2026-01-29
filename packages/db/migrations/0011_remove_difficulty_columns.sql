-- Remove difficulty columns from quizzes, quiz_set_items, and ai_generation_metrics
-- SQLite requires table rebuilds to drop columns

PRAGMA foreign_keys=off;
BEGIN;

-- quizzes: drop difficulty
CREATE TABLE quizzes_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    theme TEXT,
    style TEXT NOT NULL,
    question_count INTEGER NOT NULL,
    model_used TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    status TEXT DEFAULT 'completed',
    error TEXT
);

INSERT INTO quizzes_new (
    id,
    user_id,
    subject,
    theme,
    style,
    question_count,
    model_used,
    created_at,
    status,
    error
)
SELECT
    id,
    user_id,
    subject,
    theme,
    style,
    question_count,
    model_used,
    created_at,
    status,
    error
FROM quizzes;

DROP TABLE quizzes;
ALTER TABLE quizzes_new RENAME TO quizzes;

CREATE INDEX IF NOT EXISTS idx_quizzes_user_id ON quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_created_at ON quizzes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quizzes_subject ON quizzes(subject);

-- quiz_set_items: drop difficulty
CREATE TABLE quiz_set_items_new (
    id TEXT PRIMARY KEY,
    quiz_set_id TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    subject TEXT NOT NULL,
    theme TEXT,
    styles TEXT NOT NULL,
    question_count INTEGER NOT NULL,
    era TEXT DEFAULT 'current',
    enable_current_affairs INTEGER DEFAULT 0,
    current_affairs_theme TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (quiz_set_id) REFERENCES quiz_sets(id) ON DELETE CASCADE
);

INSERT INTO quiz_set_items_new (
    id,
    quiz_set_id,
    sequence_number,
    subject,
    theme,
    styles,
    question_count,
    era,
    enable_current_affairs,
    current_affairs_theme,
    created_at,
    updated_at
)
SELECT
    id,
    quiz_set_id,
    sequence_number,
    subject,
    theme,
    styles,
    question_count,
    era,
    enable_current_affairs,
    current_affairs_theme,
    created_at,
    updated_at
FROM quiz_set_items;

DROP TABLE quiz_set_items;
ALTER TABLE quiz_set_items_new RENAME TO quiz_set_items;

CREATE INDEX IF NOT EXISTS idx_quiz_set_items_quiz_set_id ON quiz_set_items(quiz_set_id);
CREATE INDEX IF NOT EXISTS idx_quiz_set_items_sequence ON quiz_set_items(quiz_set_id, sequence_number);

-- ai_generation_metrics: drop difficulty
CREATE TABLE ai_generation_metrics_new (
    id TEXT PRIMARY KEY,
    quiz_id TEXT,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    fact_check_model TEXT,
    subject TEXT NOT NULL,
    theme TEXT,
    styles TEXT NOT NULL,
    era TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    requested_count INTEGER NOT NULL,
    returned_count INTEGER NOT NULL,
    dedup_enabled INTEGER NOT NULL DEFAULT 1,
    dedup_filtered_count INTEGER NOT NULL DEFAULT 0,
    validation_is_valid INTEGER,
    validation_invalid_count INTEGER,
    validation_error_count INTEGER,
    validation_warning_count INTEGER,
    validation_batch_warnings TEXT,
    parse_strategy TEXT,
    prompt_chars INTEGER,
    response_chars INTEGER,
    total_duration_ms INTEGER,
    generation_duration_ms INTEGER,
    fact_check_enabled INTEGER NOT NULL DEFAULT 0,
    fact_check_duration_ms INTEGER,
    fact_check_checked_count INTEGER,
    fact_check_issue_count INTEGER,
    usage_prompt_tokens INTEGER,
    usage_completion_tokens INTEGER,
    usage_total_tokens INTEGER,
    grounding_enabled INTEGER DEFAULT 0,
    grounding_source_count INTEGER,
    request_prompt TEXT,
    raw_response TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE SET NULL
);

INSERT INTO ai_generation_metrics_new (
    id,
    quiz_id,
    user_id,
    provider,
    model,
    fact_check_model,
    subject,
    theme,
    styles,
    era,
    status,
    error_message,
    requested_count,
    returned_count,
    dedup_enabled,
    dedup_filtered_count,
    validation_is_valid,
    validation_invalid_count,
    validation_error_count,
    validation_warning_count,
    validation_batch_warnings,
    parse_strategy,
    prompt_chars,
    response_chars,
    total_duration_ms,
    generation_duration_ms,
    fact_check_enabled,
    fact_check_duration_ms,
    fact_check_checked_count,
    fact_check_issue_count,
    usage_prompt_tokens,
    usage_completion_tokens,
    usage_total_tokens,
    grounding_enabled,
    grounding_source_count,
    request_prompt,
    raw_response,
    created_at
)
SELECT
    id,
    quiz_id,
    user_id,
    provider,
    model,
    fact_check_model,
    subject,
    theme,
    styles,
    era,
    status,
    error_message,
    requested_count,
    returned_count,
    dedup_enabled,
    dedup_filtered_count,
    validation_is_valid,
    validation_invalid_count,
    validation_error_count,
    validation_warning_count,
    validation_batch_warnings,
    parse_strategy,
    prompt_chars,
    response_chars,
    total_duration_ms,
    generation_duration_ms,
    fact_check_enabled,
    fact_check_duration_ms,
    fact_check_checked_count,
    fact_check_issue_count,
    usage_prompt_tokens,
    usage_completion_tokens,
    usage_total_tokens,
    grounding_enabled,
    grounding_source_count,
    request_prompt,
    raw_response,
    created_at
FROM ai_generation_metrics;

DROP TABLE ai_generation_metrics;
ALTER TABLE ai_generation_metrics_new RENAME TO ai_generation_metrics;

CREATE INDEX IF NOT EXISTS idx_ai_metrics_user_created ON ai_generation_metrics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_quiz_id ON ai_generation_metrics(quiz_id);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_subject ON ai_generation_metrics(subject);

COMMIT;
PRAGMA foreign_keys=on;
