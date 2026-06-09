-- ============================================================
-- Document Study Mode Migration
-- ============================================================

-- ─── document_sessions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES tutoring_sessions(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name         TEXT NOT NULL,
  file_type         TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx', 'txt')),
  total_sections    INTEGER NOT NULL DEFAULT 0,
  total_pages       INTEGER NOT NULL DEFAULT 0,
  resume_section_id TEXT,
  resume_page       INTEGER,
  linked_goal_id    UUID REFERENCES learning_goals(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_sessions_session_id ON document_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_document_sessions_user_id ON document_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_document_sessions_user_file ON document_sessions(user_id, file_name);

-- ─── document_section_progress ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_section_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES tutoring_sessions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id    TEXT NOT NULL,
  section_title TEXT,
  page          INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'not_started'
                  CHECK (status IN ('not_started', 'in_progress', 'done')),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  UNIQUE (session_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_section_progress_session ON document_section_progress(session_id);
CREATE INDEX IF NOT EXISTS idx_section_progress_user ON document_section_progress(user_id);

-- ─── Extend learning_goals ────────────────────────────────────────────────────

ALTER TABLE learning_goals
  ADD COLUMN IF NOT EXISTS doc_session_id     UUID REFERENCES tutoring_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS doc_sections_total INTEGER,
  ADD COLUMN IF NOT EXISTS doc_sections_done  INTEGER DEFAULT 0;
