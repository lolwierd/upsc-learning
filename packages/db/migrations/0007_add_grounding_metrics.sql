-- Migration: 0007_add_grounding_metrics.sql
-- Adds web grounding metadata for AI generation metrics.

ALTER TABLE ai_generation_metrics ADD COLUMN grounding_enabled INTEGER DEFAULT 0;
ALTER TABLE ai_generation_metrics ADD COLUMN grounding_source_count INTEGER;
