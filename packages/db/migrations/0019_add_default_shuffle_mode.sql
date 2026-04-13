-- Add default shuffle mode setting to user_settings table
-- 1 = shuffled (jumbled, default), 0 = unshuffled (unjumbled / original order)
ALTER TABLE user_settings ADD COLUMN default_shuffle_mode INTEGER DEFAULT 1;
