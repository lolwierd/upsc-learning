-- Add quiz origin metadata for PYQ support
ALTER TABLE quizzes ADD COLUMN origin TEXT NOT NULL DEFAULT 'generated';
ALTER TABLE quizzes ADD COLUMN source_meta TEXT;

CREATE INDEX IF NOT EXISTS idx_quizzes_origin ON quizzes(origin);
