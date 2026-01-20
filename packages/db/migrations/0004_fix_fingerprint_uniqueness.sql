-- Fix fingerprint uniqueness to be per-subject instead of global
-- Migration: 0004_fix_fingerprint_uniqueness.sql
-- 
-- Problem: The original schema had UNIQUE(fingerprint) globally, which:
--   1. Prevents storing the same fingerprint for different subjects
--   2. Causes unnecessary insert failures across subjects
-- 
-- Solution: Make fingerprint unique per subject

-- SQLite doesn't support ALTER TABLE to modify constraints, so we need to:
-- 1. Create new table with correct constraints
-- 2. Copy data
-- 3. Drop old table
-- 4. Rename new table

-- Step 1: Create new table with correct uniqueness constraint
CREATE TABLE IF NOT EXISTS question_fingerprints_new (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    subject TEXT NOT NULL,
    theme TEXT,
    question_text_preview TEXT NOT NULL,
    question_id TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(fingerprint, subject),  -- Unique per subject, not globally
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE SET NULL
);

-- Step 2: Copy existing data
INSERT OR IGNORE INTO question_fingerprints_new 
    (id, fingerprint, subject, theme, question_text_preview, question_id, created_at)
SELECT id, fingerprint, subject, theme, question_text_preview, question_id, created_at
FROM question_fingerprints;

-- Step 3: Drop old table
DROP TABLE IF EXISTS question_fingerprints;

-- Step 4: Rename new table
ALTER TABLE question_fingerprints_new RENAME TO question_fingerprints;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_fingerprints_fingerprint ON question_fingerprints(fingerprint);
CREATE INDEX IF NOT EXISTS idx_fingerprints_subject ON question_fingerprints(subject);
CREATE INDEX IF NOT EXISTS idx_fingerprints_subject_theme ON question_fingerprints(subject, theme);
CREATE INDEX IF NOT EXISTS idx_fingerprints_fp_subject ON question_fingerprints(fingerprint, subject);
