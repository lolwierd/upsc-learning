-- Add prompt logging columns to ai_generation_metrics
-- Migration: 0009_add_prompt_logging.sql

ALTER TABLE ai_generation_metrics ADD COLUMN request_prompt TEXT;
ALTER TABLE ai_generation_metrics ADD COLUMN raw_response TEXT;
