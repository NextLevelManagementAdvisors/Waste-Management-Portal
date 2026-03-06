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

-- Locations (customer service addresses)
CREATE TABLE IF NOT EXISTS locations (
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
CREATE INDEX IF NOT EXISTS idx_locations_user_id ON locations(user_id);

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

-- Missed collection reports
CREATE TABLE IF NOT EXISTS missed_collection_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  collection_date DATE NOT NULL,
  notes TEXT,
  photos JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(50) DEFAULT 'pending',
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_missed_reports_location_id ON missed_collection_reports(location_id);

-- On-demand services catalog
CREATE TABLE IF NOT EXISTS on_demand_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  icon_name VARCHAR(100),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed a default on-demand service for fresh environments
INSERT INTO on_demand_services (name, description, price, icon_name, active)
SELECT
  'Bulk Pickup',
  'One-time pickup for large or overflow household items.',
  49.99,
  'TruckIcon',
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM on_demand_services WHERE active = TRUE);

-- On-demand requests
CREATE TABLE IF NOT EXISTS on_demand_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  service_name VARCHAR(255) NOT NULL,
  service_price NUMERIC(10,2) NOT NULL,
  requested_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  photos JSONB DEFAULT '[]',
  ai_estimate NUMERIC(10,2),
  ai_reasoning TEXT,
  admin_notes TEXT,
  assigned_driver_id UUID,
  cancellation_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE missed_collection_reports ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;

-- Collection intents
CREATE TABLE IF NOT EXISTS collection_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  intent VARCHAR(50) NOT NULL,
  collection_date DATE NOT NULL,
  optimo_order_no TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (location_id, collection_date)
);
ALTER TABLE collection_intents ADD COLUMN IF NOT EXISTS optimo_order_no TEXT;

-- Driver feedback / tips
CREATE TABLE IF NOT EXISTS driver_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  collection_date DATE NOT NULL,
  rating INTEGER,
  tip_amount NUMERIC(10,2),
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (location_id, collection_date)
);

-- Tip dismissals
CREATE TABLE IF NOT EXISTS tip_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  collection_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (location_id, collection_date)
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

-- User roles (multi-role support)
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  admin_role VARCHAR(50),
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- Invitations
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255),
  phone VARCHAR(50),
  name VARCHAR(255),
  roles TEXT[] NOT NULL,
  admin_role VARCHAR(50),
  invited_by UUID NOT NULL REFERENCES users(id),
  token VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(50) DEFAULT 'pending',
  accepted_by UUID REFERENCES users(id),
  accepted_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);

-- Migration: add name/phone columns if missing
DO $$ BEGIN
  ALTER TABLE invitations ADD COLUMN IF NOT EXISTS name VARCHAR(255);
  ALTER TABLE invitations ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
  ALTER TABLE invitations ALTER COLUMN email DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Driver profiles (role-specific extension of users)
CREATE TABLE IF NOT EXISTS driver_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_profiles_user_id ON driver_profiles(user_id);

-- Driver W9
CREATE TABLE IF NOT EXISTS driver_w9 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL UNIQUE REFERENCES driver_profiles(id) ON DELETE CASCADE,
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

-- Routes
CREATE TABLE IF NOT EXISTS routes (
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
  assigned_driver_id UUID REFERENCES driver_profiles(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Route bids
CREATE TABLE IF NOT EXISTS route_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  bid_amount NUMERIC(10,2) NOT NULL,
  message TEXT,
  driver_rating_at_bid NUMERIC(3,2),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (route_id, driver_id)
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
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

-- Add bank account columns to driver_w9 for manual bank account entry
ALTER TABLE driver_w9 ADD COLUMN IF NOT EXISTS account_holder_name VARCHAR(255);
ALTER TABLE driver_w9 ADD COLUMN IF NOT EXISTS routing_number_encrypted VARCHAR(255);
ALTER TABLE driver_w9 ADD COLUMN IF NOT EXISTS account_number_encrypted VARCHAR(255);
ALTER TABLE driver_w9 ADD COLUMN IF NOT EXISTS account_type VARCHAR(20);

-- Message email opt-in
ALTER TABLE users ADD COLUMN IF NOT EXISTS message_email_notifications BOOLEAN DEFAULT FALSE;
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS message_email_notifications BOOLEAN DEFAULT FALSE;

-- Address serviceability review workflow
ALTER TABLE locations ADD COLUMN IF NOT EXISTS service_status VARCHAR(50) DEFAULT 'approved';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS service_status_updated_at TIMESTAMP;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS service_status_notes TEXT;
CREATE INDEX IF NOT EXISTS idx_locations_service_status ON locations(service_status);
ALTER TABLE locations ALTER COLUMN service_status SET DEFAULT 'pending_review';

-- Communication templates
CREATE TABLE IF NOT EXISTS communication_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'email',
  subject VARCHAR(255),
  body TEXT NOT NULL,
  variables TEXT[],
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Communication log (all outbound emails, SMS, in-app messages)
CREATE TABLE IF NOT EXISTS communication_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID,
  recipient_type VARCHAR(20),
  recipient_name VARCHAR(255),
  recipient_contact VARCHAR(255),
  channel VARCHAR(20) NOT NULL,
  direction VARCHAR(10) DEFAULT 'outbound',
  subject VARCHAR(255),
  body TEXT,
  template_id UUID REFERENCES communication_templates(id),
  status VARCHAR(20) DEFAULT 'sent',
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  sent_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comm_log_recipient ON communication_log(recipient_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_channel ON communication_log(channel);
CREATE INDEX IF NOT EXISTS idx_comm_log_status ON communication_log(status);
CREATE INDEX IF NOT EXISTS idx_comm_log_scheduled ON communication_log(scheduled_for) WHERE status = 'scheduled';

-- System settings (admin-configurable integrations & env overrides)
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  is_secret BOOLEAN DEFAULT false,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expenses (accounting)
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(100) NOT NULL,
  description TEXT,
  amount NUMERIC(10,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vendor VARCHAR(255),
  reference_id VARCHAR(255),
  reference_type VARCHAR(50),
  payment_method VARCHAR(100),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- Pending service selections (deferred billing until address approval)
CREATE TABLE IF NOT EXISTS pending_service_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  use_sticker BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_selections_location ON pending_service_selections(location_id);

-- On-demand enhancements: customer notes, photos, AI estimate, admin tools, driver assignment
ALTER TABLE on_demand_requests ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE on_demand_requests ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]';
ALTER TABLE on_demand_requests ADD COLUMN IF NOT EXISTS ai_estimate NUMERIC(10,2);
ALTER TABLE on_demand_requests ADD COLUMN IF NOT EXISTS ai_reasoning TEXT;
ALTER TABLE on_demand_requests ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE on_demand_requests ADD COLUMN IF NOT EXISTS assigned_driver_id UUID REFERENCES driver_profiles(id);
ALTER TABLE on_demand_requests ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'on_demand_requests'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY (assigned_driver_id)%REFERENCES driver_profiles(id)%'
  ) THEN
    ALTER TABLE on_demand_requests
      ADD CONSTRAINT fk_on_demand_requests_assigned_driver
      FOREIGN KEY (assigned_driver_id) REFERENCES driver_profiles(id);
  END IF;
END $$;
ALTER TABLE on_demand_services ADD COLUMN IF NOT EXISTS icon_name VARCHAR(100);

-- Collection scheduling fields on locations
ALTER TABLE locations ADD COLUMN IF NOT EXISTS collection_frequency VARCHAR(20) DEFAULT 'weekly';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS collection_day VARCHAR(10);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS collection_day_detected_at TIMESTAMP;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS collection_day_source VARCHAR(30);

-- OptimoRoute sync order ledger (tracks every order the sync system creates)
CREATE TABLE IF NOT EXISTS optimo_sync_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  order_no VARCHAR(100) NOT NULL UNIQUE,
  scheduled_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);
ALTER TABLE optimo_sync_orders ADD COLUMN IF NOT EXISTS customer_notified BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_optimo_sync_orders_location ON optimo_sync_orders(location_id);
CREATE INDEX IF NOT EXISTS idx_optimo_sync_orders_date ON optimo_sync_orders(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_optimo_sync_orders_order_no ON optimo_sync_orders(order_no);

-- OptimoRoute sync run audit log
CREATE TABLE IF NOT EXISTS optimo_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'running',
  locations_processed INT DEFAULT 0,
  orders_created INT DEFAULT 0,
  orders_skipped INT DEFAULT 0,
  orders_errored INT DEFAULT 0,
  orders_deleted INT DEFAULT 0,
  detection_updates INT DEFAULT 0,
  error_message TEXT,
  details JSONB DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_optimo_sync_log_started ON optimo_sync_log(started_at DESC);

-- Service zones for geographic grouping
CREATE TABLE IF NOT EXISTS service_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  center_lat NUMERIC(10,7),
  center_lng NUMERIC(10,7),
  radius_miles NUMERIC(6,2),
  color VARCHAR(7) DEFAULT '#10B981',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Route stops (links locations to routes)
CREATE TABLE IF NOT EXISTS route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id),
  order_type VARCHAR(30) DEFAULT 'recurring',
  on_demand_request_id UUID REFERENCES on_demand_requests(id),
  optimo_order_no VARCHAR(100),
  stop_number INTEGER,
  status VARCHAR(30) DEFAULT 'pending',
  scheduled_at VARCHAR(20),
  duration INTEGER DEFAULT 15,
  notes TEXT,
  location_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_route_stops_route ON route_stops(route_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_location ON route_stops(location_id);

-- Route extensions
ALTER TABLE routes ADD COLUMN IF NOT EXISTS route_type VARCHAR(30) DEFAULT 'daily_route';
ALTER TABLE routes ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES service_zones(id);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'manual';
ALTER TABLE routes ADD COLUMN IF NOT EXISTS on_demand_request_id UUID REFERENCES on_demand_requests(id);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS optimo_planning_id VARCHAR(100);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS accepted_bid_id UUID REFERENCES route_bids(id);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS actual_pay NUMERIC(10,2);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'unpaid';
ALTER TABLE routes ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_routes_date_status ON routes(scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_routes_zone ON routes(zone_id);
CREATE INDEX IF NOT EXISTS idx_routes_type ON routes(route_type);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS optimo_synced BOOLEAN DEFAULT FALSE;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS optimo_synced_at TIMESTAMP;

-- Zone and coordinate fields on locations
ALTER TABLE locations ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES service_zones(id);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);
CREATE INDEX IF NOT EXISTS idx_locations_zone ON locations(zone_id);

-- Waitlist auto-flagging: tracks when a waitlisted location gains driver coverage
ALTER TABLE locations ADD COLUMN IF NOT EXISTS coverage_flagged_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_locations_coverage_flagged ON locations(coverage_flagged_at) WHERE coverage_flagged_at IS NOT NULL;

-- Track how users signed up (local registration vs Google OAuth)
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'local';

-- OptimoRoute import support
ALTER TABLE routes ADD COLUMN IF NOT EXISTS optimo_route_key VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_optimo_route_key ON routes(optimo_route_key) WHERE optimo_route_key IS NOT NULL;
ALTER TABLE route_stops ALTER COLUMN location_id DROP NOT NULL;
ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS address TEXT;

-- In-portal notifications for customers
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read) WHERE read = FALSE;

-- Driver zone selections (many-to-many: drivers ↔ service_zones)
CREATE TABLE IF NOT EXISTS driver_zone_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES service_zones(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(driver_id, zone_id)
);
CREATE INDEX IF NOT EXISTS idx_dzs_driver ON driver_zone_selections(driver_id);
CREATE INDEX IF NOT EXISTS idx_dzs_zone ON driver_zone_selections(zone_id);
CREATE INDEX IF NOT EXISTS idx_dzs_status ON driver_zone_selections(status);

-- Zone change audit log
CREATE TABLE IF NOT EXISTS zone_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES service_zones(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zcl_driver ON zone_change_log(driver_id);
CREATE INDEX IF NOT EXISTS idx_zcl_zone ON zone_change_log(zone_id);
CREATE INDEX IF NOT EXISTS idx_zcl_created ON zone_change_log(created_at DESC);

-- Admin zones (parent grouping of service/driver zones)
CREATE TABLE IF NOT EXISTS admin_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Link service_zones to admin_zones
ALTER TABLE service_zones ADD COLUMN IF NOT EXISTS admin_zone_id UUID REFERENCES admin_zones(id);
CREATE INDEX IF NOT EXISTS idx_service_zones_admin_zone ON service_zones(admin_zone_id);

-- Driver-created custom zones (bottom-up zone creation)
CREATE TABLE IF NOT EXISTS driver_custom_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  zone_type VARCHAR(20) NOT NULL DEFAULT 'circle',
  center_lat NUMERIC(10,7),
  center_lng NUMERIC(10,7),
  radius_miles NUMERIC(6,2) DEFAULT 5,
  polygon_coords JSONB,
  zip_codes TEXT[],
  color VARCHAR(7) DEFAULT '#3B82F6',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
-- Ensure columns exist on pre-existing tables (CREATE TABLE IF NOT EXISTS won't add new columns)
ALTER TABLE driver_custom_zones ADD COLUMN IF NOT EXISTS zone_type VARCHAR(20) NOT NULL DEFAULT 'circle';
ALTER TABLE driver_custom_zones ADD COLUMN IF NOT EXISTS polygon_coords JSONB;
ALTER TABLE driver_custom_zones ADD COLUMN IF NOT EXISTS zip_codes TEXT[];
ALTER TABLE driver_custom_zones ADD COLUMN IF NOT EXISTS pickup_day VARCHAR(10);
CREATE INDEX IF NOT EXISTS idx_dcz_driver ON driver_custom_zones(driver_id);
CREATE INDEX IF NOT EXISTS idx_dcz_status ON driver_custom_zones(status);
CREATE INDEX IF NOT EXISTS idx_dcz_type ON driver_custom_zones(zone_type);

-- Waitlist auto-flagging FK (must come after driver_custom_zones table creation)
ALTER TABLE locations ADD COLUMN IF NOT EXISTS coverage_flagged_by_zone UUID REFERENCES driver_custom_zones(id) ON DELETE SET NULL;

-- Account deletion
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_scheduled_for TIMESTAMP;

-- Email verification
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMP;

-- Billing disputes
CREATE TABLE IF NOT EXISTS billing_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  invoice_id VARCHAR(255) NOT NULL,
  invoice_number VARCHAR(255),
  amount NUMERIC(10,2) NOT NULL,
  reason VARCHAR(100) NOT NULL,
  details TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  admin_notes TEXT,
  resolved_at TIMESTAMP,
  resolved_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_disputes_user ON billing_disputes(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_disputes_invoice ON billing_disputes(invoice_id);

-- ============================================================
-- Contract & Compensation Model (Phase 1 Foundation)
-- ============================================================

-- 1A. Driver Qualification Profile
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS equipment_types TEXT[] DEFAULT '{}';
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS certifications TEXT[] DEFAULT '{}';
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS max_stops_per_day INTEGER DEFAULT 50;
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS min_rating_for_assignment NUMERIC(3,2) DEFAULT 0;

-- 1B. Location Compensation & Requirements
ALTER TABLE locations ADD COLUMN IF NOT EXISTS difficulty_score NUMERIC(3,1) DEFAULT 1.0;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS custom_rate NUMERIC(10,2);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS required_equipment TEXT[] DEFAULT '{}';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS required_certifications TEXT[] DEFAULT '{}';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS min_driver_rating NUMERIC(3,2) DEFAULT 0;

-- OPT4: Customer Day Change Policy
ALTER TABLE locations ADD COLUMN IF NOT EXISTS day_change_preference VARCHAR(20) DEFAULT 'flexible';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS last_day_changed_at TIMESTAMP;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS collection_start_date DATE;

-- 1C. Compensation Rules Engine
CREATE TABLE IF NOT EXISTS compensation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  rule_type VARCHAR(30) NOT NULL,
  conditions JSONB DEFAULT '{}',
  rate_amount NUMERIC(10,2),
  rate_multiplier NUMERIC(4,2) DEFAULT 1.0,
  priority INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  effective_from DATE,
  effective_to DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comp_rules_type ON compensation_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_comp_rules_active ON compensation_rules(active, rule_type);

-- 1D. Route Contracts
CREATE TABLE IF NOT EXISTS route_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES driver_profiles(id),
  zone_id UUID NOT NULL REFERENCES service_zones(id),
  day_of_week VARCHAR(10) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  per_stop_rate NUMERIC(10,2),
  terms_notes TEXT,
  awarded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE route_contracts ADD COLUMN IF NOT EXISTS expiry_warned_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_rc_driver ON route_contracts(driver_id);
CREATE INDEX IF NOT EXISTS idx_rc_active ON route_contracts(status, end_date);
CREATE INDEX IF NOT EXISTS idx_rc_zone_day ON route_contracts(zone_id, day_of_week);
-- Partial unique: one active contract per zone+day
CREATE UNIQUE INDEX IF NOT EXISTS idx_rc_unique_active ON route_contracts(zone_id, day_of_week) WHERE status = 'active';

-- 1E. Dynamic Route Valuation
ALTER TABLE routes ADD COLUMN IF NOT EXISTS computed_value NUMERIC(10,2);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES route_contracts(id);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS pay_mode VARCHAR(20) DEFAULT 'dynamic';
ALTER TABLE routes ADD COLUMN IF NOT EXISTS pay_premium NUMERIC(10,2) DEFAULT 0;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS polyline TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS start_latitude NUMERIC;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS start_longitude NUMERIC;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS end_latitude NUMERIC;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS end_longitude NUMERIC;
CREATE INDEX IF NOT EXISTS idx_routes_contract ON routes(contract_id);

-- Route stop compensation
ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS compensation NUMERIC(10,2);
ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS pod_data JSONB;

-- Route bid enhancements (price discovery)
ALTER TABLE route_bids ADD COLUMN IF NOT EXISTS bid_type VARCHAR(20) DEFAULT 'route';
ALTER TABLE route_bids ADD COLUMN IF NOT EXISTS per_stop_rate NUMERIC(10,2);
ALTER TABLE route_bids ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';

-- ============================================================
-- Contract Lifecycle Tables (Phase 2+)
-- ============================================================

-- RC1: Contract Opportunities (for price discovery / awarding)
CREATE TABLE IF NOT EXISTS contract_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES service_zones(id),
  day_of_week VARCHAR(10) NOT NULL,
  start_date DATE NOT NULL,
  duration_months INTEGER NOT NULL,
  proposed_per_stop_rate NUMERIC(10,2),
  requirements JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'open',
  awarded_contract_id UUID REFERENCES route_contracts(id),
  discovery_route_id UUID REFERENCES routes(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_co_status ON contract_opportunities(status);

-- RC1: Contract Applications (driver bids on opportunities)
CREATE TABLE IF NOT EXISTS contract_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES contract_opportunities(id),
  driver_id UUID NOT NULL REFERENCES driver_profiles(id),
  proposed_rate NUMERIC(10,2),
  message TEXT,
  driver_rating_at_application NUMERIC(3,2),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(opportunity_id, driver_id)
);
CREATE INDEX IF NOT EXISTS idx_ca_opportunity ON contract_applications(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_ca_driver ON contract_applications(driver_id);

-- RC4: Coverage / Substitute Driver Requests
CREATE TABLE IF NOT EXISTS coverage_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES route_contracts(id),
  requesting_driver_id UUID NOT NULL REFERENCES driver_profiles(id),
  coverage_date DATE NOT NULL,
  reason VARCHAR(50),
  reason_notes TEXT,
  substitute_driver_id UUID REFERENCES driver_profiles(id),
  substitute_pay NUMERIC(10,2),
  status VARCHAR(20) DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cr_contract ON coverage_requests(contract_id);
CREATE INDEX IF NOT EXISTS idx_cr_date ON coverage_requests(coverage_date);

-- Auto-assignment activity log
CREATE TABLE IF NOT EXISTS auto_assignment_log (
  id SERIAL PRIMARY KEY,
  location_id UUID REFERENCES locations(id),
  contract_id UUID REFERENCES route_contracts(id),
  route_id UUID REFERENCES routes(id),
  assigned BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  details TEXT,
  compensation NUMERIC(10,2),
  capacity_warning BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aal_created ON auto_assignment_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aal_assigned ON auto_assignment_log(assigned);

-- ============================================================
-- Compensation Lifecycle Tables (Phase 5)
-- ============================================================

-- CO3: Pay Periods
CREATE TABLE IF NOT EXISTS pay_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'open',
  processed_at TIMESTAMP,
  processed_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pp_status ON pay_periods(status);

-- CO3: Pay Statements (per driver per period)
CREATE TABLE IF NOT EXISTS pay_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_period_id UUID NOT NULL REFERENCES pay_periods(id),
  driver_id UUID NOT NULL REFERENCES driver_profiles(id),
  total_route_pay NUMERIC(10,2) DEFAULT 0,
  total_adjustments NUMERIC(10,2) DEFAULT 0,
  total_bonuses NUMERIC(10,2) DEFAULT 0,
  total_penalties NUMERIC(10,2) DEFAULT 0,
  net_pay NUMERIC(10,2) DEFAULT 0,
  route_count INTEGER DEFAULT 0,
  stop_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ps_period ON pay_statements(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_ps_driver ON pay_statements(driver_id);

-- CO4: Pay Adjustments (bonuses, penalties, credits)
CREATE TABLE IF NOT EXISTS pay_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES driver_profiles(id),
  pay_period_id UUID REFERENCES pay_periods(id),
  route_id UUID REFERENCES routes(id),
  type VARCHAR(30) NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pa_driver ON pay_adjustments(driver_id);
CREATE INDEX IF NOT EXISTS idx_pa_period ON pay_adjustments(pay_period_id);

-- ============================================================
-- Optimization Audit (Phase 6)
-- ============================================================

-- OPT6: Optimization Proposals
CREATE TABLE IF NOT EXISTS optimization_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES service_zones(id),
  proposed_by UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'pending',
  proposal_data JSONB NOT NULL,
  applied_changes JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  applied_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_op_zone ON optimization_proposals(zone_id);
CREATE INDEX IF NOT EXISTS idx_op_status ON optimization_proposals(status);

-- ============================================================
-- Lifecycle Hardening (Phase 12)
-- ============================================================

-- US-12: Add status column to route_bids
ALTER TABLE route_bids ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';

-- US-16: Resolution tracking for missed collection reports
ALTER TABLE missed_collection_reports ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id);
ALTER TABLE missed_collection_reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;

-- US-7: Coverage request deadline
ALTER TABLE coverage_requests ADD COLUMN IF NOT EXISTS deadline DATE;

-- US-19: CHECK constraints for status columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_routes_status') THEN
    ALTER TABLE routes ADD CONSTRAINT chk_routes_status CHECK (status IN ('draft','open','bidding','assigned','in_progress','completed','cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_on_demand_status') THEN
    ALTER TABLE on_demand_requests ADD CONSTRAINT chk_on_demand_status CHECK (status IN ('pending','scheduled','completed','cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_missed_collection_status') THEN
    ALTER TABLE missed_collection_reports ADD CONSTRAINT chk_missed_collection_status CHECK (status IN ('pending','investigating','escalated','resolved','dismissed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_coverage_status') THEN
    ALTER TABLE coverage_requests ADD CONSTRAINT chk_coverage_status CHECK (status IN ('pending','approved','filled','denied'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contract_status') THEN
    ALTER TABLE route_contracts ADD CONSTRAINT chk_contract_status CHECK (status IN ('active','expired','terminated','pending'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_opportunity_status') THEN
    ALTER TABLE contract_opportunities ADD CONSTRAINT chk_opportunity_status CHECK (status IN ('open','awarded','cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_application_status') THEN
    ALTER TABLE contract_applications ADD CONSTRAINT chk_application_status CHECK (status IN ('pending','accepted','rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bid_status') THEN
    ALTER TABLE route_bids ADD CONSTRAINT chk_bid_status CHECK (status IN ('pending','accepted','rejected','withdrawn','expired'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_zar_status') THEN
    ALTER TABLE zone_assignment_requests ADD CONSTRAINT chk_zar_status
      CHECK (status IN ('pending','approved','denied','expired','cancelled'));
  END IF;
END $$;

-- ============================================================
-- Zone Assignment Requests
-- Admin drags a location to a zone → request sent to driver for approval
-- ============================================================
CREATE TABLE IF NOT EXISTS zone_assignment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES driver_custom_zones(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  deadline TIMESTAMPTZ NOT NULL,
  response_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_zar_location ON zone_assignment_requests(location_id);
CREATE INDEX IF NOT EXISTS idx_zar_zone ON zone_assignment_requests(zone_id);
CREATE INDEX IF NOT EXISTS idx_zar_driver ON zone_assignment_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_zar_status ON zone_assignment_requests(status);

-- Confirmed zone assignment (set when driver approves assignment request)
ALTER TABLE locations ADD COLUMN IF NOT EXISTS coverage_zone_id UUID REFERENCES driver_custom_zones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_locations_coverage_zone ON locations(coverage_zone_id);

-- Skip credit amount (in cents, default $1.00)
INSERT INTO system_settings (key, value, category, is_secret)
VALUES ('SKIP_CREDIT_AMOUNT_CENTS', '100', 'billing', FALSE)
ON CONFLICT (key) DO NOTHING;
