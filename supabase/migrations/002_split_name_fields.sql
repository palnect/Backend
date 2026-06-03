-- ============================================================
-- Split users.name → first_name + last_name
-- Run in Supabase SQL Editor (Project → SQL Editor)
-- ============================================================

-- Add new columns
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name  TEXT NOT NULL DEFAULT '';

-- Migrate existing data: split on first space
UPDATE users
SET
  first_name = TRIM(SPLIT_PART(name, ' ', 1)),
  last_name  = TRIM(SUBSTRING(name FROM POSITION(' ' IN name) + 1))
WHERE name IS NOT NULL AND name <> '';

-- Drop the old column once data is migrated
-- (comment this out if you want a safety window before dropping)
ALTER TABLE users DROP COLUMN IF EXISTS name;
