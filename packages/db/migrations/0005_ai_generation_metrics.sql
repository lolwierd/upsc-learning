-- AI Generation Metrics
-- Migration: 0005_ai_generation_metrics.sql
--
-- Stores lightweight observability metrics for LLM-based quiz generation.
-- Intentionally does NOT store prompts or raw model outputs (privacy + cost).

CREATE TABLE IF NOT EXISTS ai_generation_metrics (
    id TEXT PRIMARY KEY,

    -- Links
    quiz_id TEXT,                  -- Nullable (e.g., generation failed before quiz creation)
    user_id TEXT NOT NULL,

    -- Request context
    provider TEXT NOT NULL,        -- "gemini" | "openai" (currently "gemini")
    model TEXT NOT NULL,           -- e.g. "gemini-3-flash-preview"
    subject TEXT NOT NULL,
    theme TEXT,
    difficulty TEXT NOT NULL,
    styles TEXT NOT NULL,          -- JSON array of styles requested
    era TEXT,                      -- Optional UPSC era selection

    -- Outcome
    status TEXT NOT NULL,          -- "success" | "error"
    error_message TEXT,            -- Truncated error string (only when status="error")

    -- Counts
    requested_count INTEGER NOT NULL,
    returned_count INTEGER NOT NULL,
    dedup_enabled INTEGER NOT NULL DEFAULT 1,
    dedup_filtered_count INTEGER NOT NULL DEFAULT 0,

    -- Validation summary
    validation_is_valid INTEGER,          -- 0/1, null when generation failed before validation
    validation_invalid_count INTEGER,     -- Count of invalid questions
    validation_error_count INTEGER,       -- Total per-question error count (sum)
    validation_warning_count INTEGER,     -- Total per-question warning count (sum)
    validation_batch_warnings TEXT,       -- JSON array

    -- Parsing + size hints
    parse_strategy TEXT,            -- "direct" | "extracted" | null
    prompt_chars INTEGER,           -- system+user prompt length (chars)
    response_chars INTEGER,         -- model output length (chars)

    -- Timing
    total_duration_ms INTEGER,      -- End-to-end API latency (ms)
    generation_duration_ms INTEGER, -- LLM generation latency (ms)
    fact_check_enabled INTEGER NOT NULL DEFAULT 0,
    fact_check_duration_ms INTEGER,
    fact_check_checked_count INTEGER,
    fact_check_issue_count INTEGER,

    -- Token usage (if provider returns it)
    usage_prompt_tokens INTEGER,
    usage_completion_tokens INTEGER,
    usage_total_tokens INTEGER,

    created_at INTEGER DEFAULT (unixepoch()),

    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_metrics_user_created ON ai_generation_metrics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_quiz_id ON ai_generation_metrics(quiz_id);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_subject ON ai_generation_metrics(subject);
