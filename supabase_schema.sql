-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS calls (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prospect     TEXT,
  company      TEXT,
  role         TEXT,
  date         TEXT,
  duration     INTEGER,
  outcome      TEXT CHECK (outcome IN ('closed','follow-up','lost','kb-scheduled','not-interested')),
  score        INTEGER CHECK (score BETWEEN 0 AND 100),
  transcript   TEXT,
  analysis     JSONB
);

-- Index for fast list queries
CREATE INDEX idx_calls_created ON calls (created_at DESC);

-- Enable Row Level Security (optional — add policies when you add auth)
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Temporary: allow all access via service role key (backend uses this)
-- When you add user auth, replace with user-scoped policies
CREATE POLICY "service role full access" ON calls
  USING (true)
  WITH CHECK (true);
