-- Run attempts - tracks combined attempts across all quizzes in a run
CREATE TABLE IF NOT EXISTS run_attempts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    started_at INTEGER DEFAULT (unixepoch()),
    submitted_at INTEGER,
    score INTEGER,
    total_questions INTEGER NOT NULL,
    time_taken_seconds INTEGER,
    status TEXT DEFAULT 'in_progress',
    shuffle_seed TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES quiz_set_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_attempts_run_id ON run_attempts(run_id);
CREATE INDEX IF NOT EXISTS idx_run_attempts_user_id ON run_attempts(user_id);

-- Run attempt answers
CREATE TABLE IF NOT EXISTS run_attempt_answers (
    id TEXT PRIMARY KEY,
    run_attempt_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    quiz_id TEXT NOT NULL,
    shuffled_index INTEGER NOT NULL,
    selected_option INTEGER,
    is_correct INTEGER,
    marked_for_review INTEGER DEFAULT 0,
    answered_at INTEGER,
    FOREIGN KEY (run_attempt_id) REFERENCES run_attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_attempt_answers_run_attempt_id ON run_attempt_answers(run_attempt_id);
