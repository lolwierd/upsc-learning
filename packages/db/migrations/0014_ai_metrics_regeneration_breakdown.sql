-- Add regeneration/call-stage observability fields for AI generation metrics
-- Migration: 0014_ai_metrics_regeneration_breakdown.sql

ALTER TABLE ai_generation_metrics
  ADD COLUMN emergency_no_dedupe_accepted_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ai_generation_metrics
  ADD COLUMN regeneration_attempts_used INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ai_generation_metrics
  ADD COLUMN emergency_regeneration_attempts_used INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ai_generation_metrics
  ADD COLUMN generation_call_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ai_generation_metrics
  ADD COLUMN initial_generation_call_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ai_generation_metrics
  ADD COLUMN regeneration_call_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ai_generation_metrics
  ADD COLUMN emergency_regeneration_call_count INTEGER NOT NULL DEFAULT 0;
