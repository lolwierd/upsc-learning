-- Question Fingerprints for Deduplication
-- Migration: 0003_question_fingerprints.sql

-- Store fingerprints of generated questions to prevent duplicates
CREATE TABLE IF NOT EXISTS question_fingerprints (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL UNIQUE,  -- Normalized hash of question content
    subject TEXT NOT NULL,
    theme TEXT,
    question_text_preview TEXT NOT NULL,  -- First 200 chars for debugging
    question_id TEXT,  -- Optional link to actual question
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE SET NULL
);

-- Index for fast fingerprint lookup
CREATE INDEX IF NOT EXISTS idx_fingerprints_fingerprint ON question_fingerprints(fingerprint);
CREATE INDEX IF NOT EXISTS idx_fingerprints_subject ON question_fingerprints(subject);
CREATE INDEX IF NOT EXISTS idx_fingerprints_subject_theme ON question_fingerprints(subject, theme);

-- Store similar question clusters (for semantic similarity tracking)
CREATE TABLE IF NOT EXISTS question_clusters (
    id TEXT PRIMARY KEY,
    cluster_hash TEXT NOT NULL,  -- Hash of key concepts/entities in question
    subject TEXT NOT NULL,
    representative_text TEXT NOT NULL,  -- Sample question from this cluster
    question_count INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_clusters_hash ON question_clusters(cluster_hash);
CREATE INDEX IF NOT EXISTS idx_clusters_subject ON question_clusters(subject);
