-- ============================================================
-- Digital Vault - Doctors & Medical Reports Schema
-- Run this in your Supabase SQL editor AFTER supabase-schema.sql
-- ============================================================

-- ── 1. Doctors table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctors (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  specialty       VARCHAR(100),
  phone           VARCHAR(30),
  hospital_clinic VARCHAR(255),
  email           VARCHAR(255),
  city            VARCHAR(100),
  notes           TEXT,
  color           VARCHAR(20) DEFAULT '#3D7EFF',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctors_user ON doctors (user_id);

ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own doctors" ON doctors
  FOR ALL USING (auth.uid()::text = user_id::text);

-- ── 2. Medical Reports table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS medical_reports (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  doctor_id   UUID REFERENCES doctors(id) ON DELETE SET NULL,
  title       VARCHAR(500) NOT NULL,
  report_type VARCHAR(100) DEFAULT 'Other',
  report_date DATE,
  notes       TEXT,
  file_path   TEXT,
  file_name   VARCHAR(255),
  file_type   VARCHAR(100),
  file_size   INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medical_reports_user ON medical_reports (user_id, report_date DESC);

ALTER TABLE medical_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own medical reports" ON medical_reports
  FOR ALL USING (auth.uid()::text = user_id::text);
