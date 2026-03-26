-- Digital Vault Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  status VARCHAR(50) DEFAULT 'active', -- active, inactive, deceased
  pin_hash VARCHAR(255),
  checkin_interval_days INTEGER DEFAULT 30,
  last_checkin_at TIMESTAMPTZ DEFAULT NOW(),
  warning_sent_at TIMESTAMPTZ,
  switch_triggered_at TIMESTAMPTZ,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OTPs table
CREATE TABLE IF NOT EXISTS otps (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL, -- email, phone
  otp_code VARCHAR(10) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  icon VARCHAR(50),
  color VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default categories
INSERT INTO categories (name, slug, icon, color) VALUES
  ('Medical', 'medical', 'medical-bag', '#EF4444'),
  ('Financial', 'financial', 'cash', '#10B981'),
  ('Property', 'property', 'home', '#3B82F6'),
  ('Personal', 'personal', 'person', '#8B5CF6'),
  ('Legal', 'legal', 'document-text', '#F59E0B'),
  ('Insurance', 'insurance', 'shield-checkmark', '#06B6D4'),
  ('Other', 'other', 'folder', '#6B7280')
ON CONFLICT (slug) DO NOTHING;

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_path TEXT,
  file_name VARCHAR(255),
  file_type VARCHAR(100),
  file_size INTEGER,
  tags TEXT[], 
  is_sensitive BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nominees table
CREATE TABLE IF NOT EXISTS nominees (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  relationship VARCHAR(100),
  access_level VARCHAR(20) DEFAULT 'limited', -- full, limited
  is_verified BOOLEAN DEFAULT FALSE,
  notify_on_inactivity BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nominee Documents junction table
CREATE TABLE IF NOT EXISTS nominee_documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nominee_id UUID REFERENCES nominees(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(nominee_id, document_id)
);

-- Emergency Requests table
CREATE TABLE IF NOT EXISTS emergency_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nominee_id UUID REFERENCES nominees(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, expired
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours'),
  access_granted_until TIMESTAMPTZ
);

-- Activity Log table
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  metadata JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE nominees ENABLE ROW LEVEL SECURITY;
ALTER TABLE nominee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data (backend uses service role, so this mainly blocks direct client access)
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid()::text = id::text);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid()::text = id::text);
