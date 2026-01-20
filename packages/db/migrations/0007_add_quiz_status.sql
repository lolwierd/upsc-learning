-- Migration: 0007_add_quiz_status.sql
-- Add status and error columns to quizzes table

ALTER TABLE quizzes ADD COLUMN status TEXT DEFAULT 'completed';
ALTER TABLE quizzes ADD COLUMN error TEXT;
