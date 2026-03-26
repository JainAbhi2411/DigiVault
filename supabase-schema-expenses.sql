-- ============================================================
-- Digital Vault - Expenses Schema
-- Run this in your Supabase SQL editor
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  category        VARCHAR(50) NOT NULL DEFAULT 'other',
  description     VARCHAR(500),
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method  VARCHAR(50) DEFAULT 'Cash',
  is_income       BOOLEAN DEFAULT FALSE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast monthly range queries (date_trunc cannot be indexed — STABLE not IMMUTABLE)
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses (user_id, date DESC);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own expenses" ON expenses
  FOR ALL USING (auth.uid()::text = user_id::text);
