-- Ensure question_clusters supports safe upserts per (cluster_hash, subject)
-- Migration: 0012_question_clusters_unique.sql
--
-- We use question_clusters for concept-level dedupe across quiz history.
-- The code relies on ON CONFLICT(cluster_hash, subject), which requires a UNIQUE constraint.

CREATE TABLE IF NOT EXISTS question_clusters_new (
    id TEXT PRIMARY KEY,
    cluster_hash TEXT NOT NULL,
    subject TEXT NOT NULL,
    representative_text TEXT NOT NULL,
    question_count INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(cluster_hash, subject)
);

-- Copy existing data; if duplicates exist, keep the first inserted.
INSERT OR IGNORE INTO question_clusters_new
    (id, cluster_hash, subject, representative_text, question_count, created_at, updated_at)
SELECT
    id, cluster_hash, subject, representative_text, question_count, created_at, updated_at
FROM question_clusters;

DROP TABLE IF EXISTS question_clusters;
ALTER TABLE question_clusters_new RENAME TO question_clusters;

CREATE INDEX IF NOT EXISTS idx_clusters_hash ON question_clusters(cluster_hash);
CREATE INDEX IF NOT EXISTS idx_clusters_subject ON question_clusters(subject);

