/**
 * Palnect Database Migration Script
 * Run with: npx tsx scripts/migrate.ts
 *
 * Creates all required Supabase tables, indexes, and stored procedures.
 */

import 'dotenv/config';
import { getSupabaseAdmin } from '../src/db/supabase/client';

const SQL = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT,
  avatar_url TEXT,
  provider TEXT NOT NULL DEFAULT 'email' CHECK (provider IN ('email', 'google')),
  google_id TEXT UNIQUE,
  last_session_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- ── Learning Profiles ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subjects TEXT[] DEFAULT '{}',
  level TEXT DEFAULT 'beginner' CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  learning_style TEXT DEFAULT 'visual' CHECK (learning_style IN ('visual', 'auditory', 'kinesthetic', 'reading')),
  goals TEXT[] DEFAULT '{}',
  weak_topics JSONB DEFAULT '[]',
  total_sessions INTEGER DEFAULT 0,
  total_minutes INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_profiles_user_id ON learning_profiles(user_id);

-- ── Tutoring Sessions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tutoring_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  mode TEXT DEFAULT 'explain',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  messages_count INTEGER DEFAULT 0,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON tutoring_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON tutoring_sessions(status);

-- ── Session Messages ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES tutoring_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'audio_transcript')),
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON session_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON session_messages(timestamp);

-- ── Session Analyses ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "sessionId" UUID NOT NULL REFERENCES tutoring_sessions(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration INTEGER DEFAULT 0,
  "topicsCovered" TEXT[] DEFAULT '{}',
  "comprehensionScore" REAL DEFAULT 0.5,
  "engagementScore" REAL DEFAULT 0.5,
  "weakAreasIdentified" TEXT[] DEFAULT '{}',
  recommendations TEXT[] DEFAULT '{}',
  "moodDetected" TEXT DEFAULT 'engaged',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON session_analyses("userId");

-- ── Study Plans ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weeks JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_study_plans_user_id ON study_plans(user_id);

-- ── Stored Procedures ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_message_count(p_session_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE tutoring_sessions
  SET messages_count = messages_count + 1
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_learning_stats(p_user_id UUID, p_minutes INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE learning_profiles
  SET
    total_sessions = total_sessions + 1,
    total_minutes = total_minutes + p_minutes,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  UPDATE users
  SET last_session_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ── Row Level Security (production hardening) ─────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutoring_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_messages ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by our backend)
CREATE POLICY "service_role_full_access" ON users FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_full_access" ON learning_profiles FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_full_access" ON tutoring_sessions FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_full_access" ON session_messages FOR ALL TO service_role USING (true);
`;

async function migrate() {
  console.log('🔄 Running Palnect database migrations...');

  try {
    const db = getSupabaseAdmin();
    const { error } = await db.rpc('exec_sql', { sql: SQL });

    if (error) {
      // Try direct execution if RPC not available
      console.log('Note: Run the SQL in SCHEMA above directly in your Supabase SQL editor');
      console.log('Migration SQL printed above. Apply it in the Supabase dashboard.');
    } else {
      console.log('✅ Migrations complete!');
    }
  } catch (err) {
    console.error('Migration error:', err);
    console.log('\n📋 Please run the following SQL manually in your Supabase SQL editor:\n');
    console.log(SQL);
  }
}

migrate();