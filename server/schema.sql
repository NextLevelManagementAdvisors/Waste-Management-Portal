-- Waste Management Portal Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Session store (connect-pg-simple)
CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expire_idx ON session (expire);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  member_since DATE DEFAULT CURRENT_DATE,
  autopay_enabled BOOLEAN DEFAULT FALSE,
  stripe_customer_id VARCHAR(255),
  is_admin BOOLEAN DEFAULT FALSE,
  admin_role VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Properties
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  service_type VARCHAR(100) NOT NULL,
  in_hoa BOOLEAN DEFAULT FALSE,
  community_name VARCHAR(255),
  has_gate_code BOOLEAN DEFAULT FALSE,
  gate_code VARCHAR(50),
  notes TEXT,
  notification_preferences JSONB DEFAULT '{}',
  transfer_status VARCHAR(50),
  pending_owner JSONB,
  transfer_token VARCHAR(255),
  transfer_token_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Referral codes
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Referrals
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_email VARCHAR(255) NOT NULL,
  referred_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  reward_amount NUMERIC(10,2) DEFAULT 0,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Service alerts
CREATE TABLE IF NOT EXISTS service_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Missed pickup reports
CREATE TABLE IF NOT EXISTS missed_pickup_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  pickup_date DATE NOT NULL,
  notes TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Special pickup services catalog
CREATE TABLE IF NOT EXISTS special_pickup_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Special pickup requests
CREATE TABLE IF NOT EXISTS special_pickup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  service_name VARCHAR(255) NOT NULL,
  service_price NUMERIC(10,2) NOT NULL,
  pickup_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Collection intents
CREATE TABLE IF NOT EXISTS collection_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  intent VARCHAR(50) NOT NULL,
  pickup_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (property_id, pickup_date)
);

-- Driver feedback / tips
CREATE TABLE IF NOT EXISTS driver_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  pickup_date DATE NOT NULL,
  rating INTEGER,
  tip_amount NUMERIC(10,2),
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (property_id, pickup_date)
);

-- Tip dismissals
CREATE TABLE IF NOT EXISTS tip_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  pickup_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (property_id, pickup_date)
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Admin notes
CREATE TABLE IF NOT EXISTS admin_notes (
  id SERIAL PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Drivers
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(30),
  password_hash VARCHAR(255),
  optimoroute_driver_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  onboarding_status VARCHAR(50) DEFAULT 'pending',
  rating NUMERIC(3,2) DEFAULT 5.0,
  total_jobs_completed INTEGER DEFAULT 0,
  stripe_connect_account_id VARCHAR(255),
  stripe_connect_onboarded BOOLEAN DEFAULT FALSE,
  w9_completed BOOLEAN DEFAULT FALSE,
  direct_deposit_completed BOOLEAN DEFAULT FALSE,
  availability JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Driver W9
CREATE TABLE IF NOT EXISTS driver_w9 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL UNIQUE REFERENCES drivers(id) ON DELETE CASCADE,
  legal_name VARCHAR(255) NOT NULL,
  business_name VARCHAR(255),
  federal_tax_classification VARCHAR(100) NOT NULL,
  other_classification VARCHAR(100),
  exempt_payee_code VARCHAR(50),
  fatca_exemption_code VARCHAR(50),
  address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(50) NOT NULL,
  zip VARCHAR(20) NOT NULL,
  requester_name VARCHAR(255),
  requester_address TEXT,
  account_numbers TEXT,
  ssn_last4 VARCHAR(4),
  ein VARCHAR(20),
  tin_type VARCHAR(20) NOT NULL,
  signature_data TEXT,
  signature_date DATE NOT NULL,
  certified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Route jobs
CREATE TABLE IF NOT EXISTS route_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  area VARCHAR(255),
  scheduled_date DATE NOT NULL,
  start_time VARCHAR(20),
  end_time VARCHAR(20),
  estimated_stops INTEGER,
  estimated_hours NUMERIC(4,2),
  base_pay NUMERIC(10,2),
  status VARCHAR(50) DEFAULT 'open',
  assigned_driver_id UUID REFERENCES drivers(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Job bids
CREATE TABLE IF NOT EXISTS job_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES route_jobs(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  bid_amount NUMERIC(10,2) NOT NULL,
  message TEXT,
  driver_rating_at_bid NUMERIC(3,2),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (job_id, driver_id)
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject VARCHAR(255),
  type VARCHAR(50) NOT NULL DEFAULT 'support',
  created_by_id UUID NOT NULL,
  created_by_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Conversation participants
CREATE TABLE IF NOT EXISTS conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL,
  participant_type VARCHAR(50) NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT NOW(),
  last_read_at TIMESTAMP,
  UNIQUE (conversation_id, participant_id, participant_type)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_type VARCHAR(50) NOT NULL,
  body TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text',
  created_at TIMESTAMP DEFAULT NOW()
);
