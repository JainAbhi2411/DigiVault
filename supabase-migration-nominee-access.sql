-- Nominee Access System Migration
-- Run this in Supabase SQL Editor

-- 1. One-time access tokens for nominee account setup
CREATE TABLE IF NOT EXISTS nominee_access_tokens (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nominee_id    UUID NOT NULL REFERENCES nominees(id) ON DELETE CASCADE,
  vault_owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token         TEXT UNIQUE NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Mark nominees who have been granted user accounts
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_nominee           BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS nominee_for_user_id  UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS nominee_record_id    UUID REFERENCES nominees(id);

-- 3. Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_nominee_access_tokens_token
  ON nominee_access_tokens(token);

-- 4. Verify columns added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('is_nominee', 'nominee_for_user_id', 'nominee_record_id');
