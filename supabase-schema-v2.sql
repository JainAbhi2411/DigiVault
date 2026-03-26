-- ============================================================
-- Digital Vault - Additional Schema (Phase 2)
-- Run this AFTER the main supabase-schema.sql
-- ============================================================

-- ── 1. Expand Categories ──────────────────────────────────────
INSERT INTO categories (name, slug, icon, color) VALUES
  ('Identity', 'identity', 'card-account-details', '#F97316'),
  ('Investments', 'investments', 'trending-up', '#84CC16'),
  ('Vehicle', 'vehicle', 'car', '#14B8A6'),
  ('Education', 'education', 'school', '#A78BFA'),
  ('Tax', 'tax', 'receipt', '#FB923C'),
  ('Passwords', 'passwords', 'lock', '#EC4899'),
  ('Contacts', 'contacts', 'contacts', '#38BDF8'),
  ('Wills & Trusts', 'wills', 'gavel', '#D97706')
ON CONFLICT (slug) DO NOTHING;

-- ── 2. Secrets / Personal Diary table ────────────────────────
CREATE TABLE IF NOT EXISTS secrets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  type VARCHAR(50) DEFAULT 'note',   -- note | diary | secret | letter | thought
  mood VARCHAR(30),                  -- happy | sad | anxious | grateful | neutral
  is_locked BOOLEAN DEFAULT FALSE,   -- PIN-lock this entry separately
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own secrets" ON secrets
  FOR ALL USING (auth.uid()::text = user_id::text);

-- ── 3. Prescriptions / Medication Reminders table ────────────
CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  medicine_name VARCHAR(255) NOT NULL,
  dosage VARCHAR(100),               -- e.g. "500mg", "1 tablet"
  frequency VARCHAR(50) DEFAULT 'daily',  -- daily | twice_daily | thrice_daily | weekly | custom
  times_of_day JSONB DEFAULT '[]',   -- e.g. ["08:00", "20:00"]
  start_date DATE NOT NULL,
  end_date DATE,                     -- null = ongoing
  doctor_name VARCHAR(255),
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  color VARCHAR(20) DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own prescriptions" ON prescriptions
  FOR ALL USING (auth.uid()::text = user_id::text);
