-- Ensure quiz-set scoped notification destinations are cleaned up with quiz set deletions
-- Migration: 0015_notification_destinations_quiz_set_linkage.sql

-- Backfill cleanup for any existing orphaned quiz-set destinations.
DELETE FROM notification_destinations
WHERE scope_type = 'quiz_set'
  AND scope_id NOT IN (SELECT id FROM quiz_sets);

-- Keep notifier rows linked to quiz set lifecycle.
CREATE TRIGGER IF NOT EXISTS trg_notification_destinations_quiz_set_delete
AFTER DELETE ON quiz_sets
FOR EACH ROW
BEGIN
  DELETE FROM notification_destinations
  WHERE scope_type = 'quiz_set' AND scope_id = OLD.id;
END;
