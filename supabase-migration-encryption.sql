-- Encryption column migration
-- Run this in your Supabase SQL Editor

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false;

-- Update existing sensitive documents (if re-uploading, this stays false by default)
-- No backfill needed — new uploads will set this correctly.

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'documents'
  AND column_name = 'is_encrypted';
