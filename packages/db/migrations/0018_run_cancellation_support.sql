-- Support faster lookup for cancellable quiz set runs and combined run attempts.
-- Status values remain stored as TEXT; the application layer now also uses
-- `cancelled` for quiz set runs/items and `abandoned` for combined run attempts.

CREATE INDEX IF NOT EXISTS idx_quiz_set_runs_quiz_set_id_status
ON quiz_set_runs(quiz_set_id, status);

CREATE INDEX IF NOT EXISTS idx_quiz_set_run_items_run_id_status
ON quiz_set_run_items(run_id, status);

CREATE INDEX IF NOT EXISTS idx_run_attempts_status
ON run_attempts(status);
