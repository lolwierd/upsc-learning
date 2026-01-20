-- Add fact-check model used for verification (configurable via env)
ALTER TABLE ai_generation_metrics ADD COLUMN fact_check_model TEXT;
