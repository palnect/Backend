-- ============================================================
-- Palnect V2 Schema Evolution Migration
-- Run this in your Supabase SQL editor (Project > SQL Editor)
-- ============================================================

-- ─── learning_profiles ────────────────────────────────────────────────────────

-- Remove old school-centric columns
ALTER TABLE learning_profiles
  DROP COLUMN IF EXISTS subjects,
  DROP COLUMN IF EXISTS level;

-- Add new columns
ALTER TABLE learning_profiles
  ADD COLUMN IF NOT EXISTS learner_type TEXT CHECK (learner_type IN (
    'pupil','high_school','undergraduate','msc','phd','professional','self_learner','other'
  )),
  ADD COLUMN IF NOT EXISTS field TEXT,
  ADD COLUMN IF NOT EXISTS available_hours_per_day FLOAT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS longest_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_session_date DATE,
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- Rename hours column (if it existed)
-- Note: if available_hours_per_week doesn't exist this is a no-op
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'learning_profiles' AND column_name = 'available_hours_per_week'
  ) THEN
    ALTER TABLE learning_profiles RENAME COLUMN available_hours_per_week TO available_hours_per_day;
    -- Scale: old weekly hours → daily (divide by 7, min 0.5)
    UPDATE learning_profiles SET available_hours_per_day = GREATEST(0.5, available_hours_per_day / 7.0)
    WHERE available_hours_per_day > 16;
  END IF;
END $$;

-- ─── tutoring_sessions ────────────────────────────────────────────────────────

ALTER TABLE tutoring_sessions
  ADD COLUMN IF NOT EXISTS field TEXT DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS source_material TEXT;

-- Migrate subject → topic if topic was empty, then drop subject
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tutoring_sessions' AND column_name = 'subject'
  ) THEN
    -- Copy subject to field for historical sessions
    UPDATE tutoring_sessions SET field = subject WHERE field IS NULL OR field = 'General';
    ALTER TABLE tutoring_sessions DROP COLUMN subject;
  END IF;
END $$;

-- ─── learning_goals (new table) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS learning_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  field TEXT,
  scheduled_date DATE,
  completed_at TIMESTAMPTZ,
  linked_session_id UUID REFERENCES tutoring_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_goals_user_date ON learning_goals (user_id, scheduled_date);

-- RLS for learning_goals (if you use Supabase RLS)
ALTER TABLE learning_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own goals"
  ON learning_goals FOR ALL
  USING (auth.uid()::text = user_id::text);

-- ─── Grant service role access ────────────────────────────────────────────────

GRANT ALL ON learning_goals TO service_role;
