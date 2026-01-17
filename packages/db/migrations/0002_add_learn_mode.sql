-- Add learn mode setting to user_settings table
ALTER TABLE user_settings ADD COLUMN learn_mode_enabled INTEGER DEFAULT 0;
