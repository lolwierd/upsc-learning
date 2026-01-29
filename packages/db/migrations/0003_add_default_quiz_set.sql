-- Add default quiz set setting to user_settings table
ALTER TABLE user_settings ADD COLUMN default_quiz_set_id TEXT;
