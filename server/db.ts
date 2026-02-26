import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export class BaseRepository {
  async query(text: string, params?: any[]) {
    return pool.query(text, params);
  }
}

export interface DbUser {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  password_hash: string;
  member_since: string;
  autopay_enabled: boolean;
  stripe_customer_id: string | null;
  is_admin: boolean;
  admin_role: string | null;
  created_at: string;
  updated_at: string;
  roles?: string[];
}

export interface DbProperty {
  id: string;
  user_id: string;
  address: string;
  service_type: string;
  in_hoa: boolean;
  community_name: string | null;
  has_gate_code: boolean;
  gate_code: string | null;
  notes: string | null;
  notification_preferences: any;
  transfer_status: string | null;
  pending_owner: any;
  service_status: string | null;
  service_status_updated_at: string | null;
  service_status_notes: string | null;
  pickup_frequency: string | null;
  pickup_day: string | null;
  pickup_day_detected_at: string | null;
  pickup_day_source: string | null;
  created_at: string;
  updated_at: string;
}
