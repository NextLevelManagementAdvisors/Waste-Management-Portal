import crypto from 'crypto';
import { pool } from './db';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon as turfPolygon } from '@turf/helpers';
import { zoneService } from '../services/zoneService.js';
export { pool };

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
  auth_provider?: string;
  email_verified?: boolean;
  email_verification_token?: string;
  email_verification_sent_at?: string;
}

export interface DbDriverProfile {
  id: string;
  user_id: string;
  name: string;
  optimoroute_driver_id: string | null;
  status: string;
  onboarding_status: string;
  rating: number;
  total_jobs_completed: number;
  stripe_connect_account_id: string | null;
  stripe_connect_onboarded: boolean;
  w9_completed: boolean;
  direct_deposit_completed: boolean;
  availability: any;
  message_email_notifications: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbLocation {
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
  collection_frequency: string | null;
  collection_day: string | null;
  collection_day_detected_at: string | null;
  collection_day_source: string | null;
  latitude: string | null;
  longitude: string | null;
  zone_id: string | null;
  created_at: string;
  updated_at: string;
}

/** @deprecated Use DbLocation instead */
export type DbProperty = DbLocation;

export interface DbNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  metadata: any;
  read: boolean;
  created_at: string;
}

/** Raw DB row from pending_service_selections (snake_case columns). */
export interface DbPendingSelection {
  id: string;
  location_id: string;
  user_id: string;
  service_id: string;
  quantity: number;
  use_sticker: boolean;
  created_at: Date;
}

export class Storage {
  async query(text: string, params?: any[]) {
    const result = await pool.query(text, params);
    return result;
  }

  async createUser(data: { firstName: string; lastName: string; phone: string; email: string; passwordHash: string; stripeCustomerId?: string; authProvider?: string }): Promise<DbUser> {
    const result = await this.query(
      `INSERT INTO users (first_name, last_name, phone, email, password_hash, stripe_customer_id, auth_provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [data.firstName, data.lastName, data.phone, data.email, data.passwordHash, data.stripeCustomerId || null, data.authProvider || 'local']
    );
    return result.rows[0];
  }

  async getUserByEmail(email: string): Promise<DbUser | null> {
    const result = await this.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] || null;
  }

  async getUserById(id: string): Promise<DbUser | null> {
    const result = await this.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async updateUser(id: string, data: Partial<{ first_name: string; last_name: string; phone: string; email: string; password_hash: string; autopay_enabled: boolean; stripe_customer_id: string; auth_provider: string; total_referral_credits: number }>): Promise<DbUser> {
    const ALLOWED_COLUMNS = ['first_name', 'last_name', 'phone', 'email', 'password_hash', 'autopay_enabled', 'stripe_customer_id', 'auth_provider', 'total_referral_credits'];
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined && ALLOWED_COLUMNS.includes(key)) {
        fields.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
    }
    fields.push(`updated_at = NOW()`);
    values.push(id);
    const result = await this.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async getLocationsForUser(userId: string): Promise<DbLocation[]> {
    const result = await this.query(
      'SELECT * FROM locations WHERE user_id = $1 ORDER BY created_at',
      [userId]
    );
    return result.rows;
  }

  async findLocationByAddress(address: string, excludeUserId?: string): Promise<DbLocation | null> {
    const normalized = address.trim().toLowerCase();
    const result = excludeUserId
      ? await this.query(
          `SELECT * FROM locations WHERE LOWER(TRIM(address)) = $1 AND user_id != $2 AND service_status NOT IN ('denied') ORDER BY created_at LIMIT 1`,
          [normalized, excludeUserId]
        )
      : await this.query(
          `SELECT * FROM locations WHERE LOWER(TRIM(address)) = $1 AND service_status NOT IN ('denied') ORDER BY created_at LIMIT 1`,
          [normalized]
        );
    return result.rows[0] || null;
  }

  async createLocation(data: { userId: string; address: string; serviceType: string; inHoa: boolean; communityName?: string; hasGateCode: boolean; gateCode?: string; notes?: string; notificationPreferences?: any }): Promise<DbLocation> {
    const result = await this.query(
      `INSERT INTO locations (user_id, address, service_type, in_hoa, community_name, has_gate_code, gate_code, notes, notification_preferences, service_status, service_status_updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending_review', NOW())
       RETURNING *`,
      [
        data.userId, data.address, data.serviceType, data.inHoa,
        data.communityName || null, data.hasGateCode, data.gateCode || null,
        data.notes || null,
        JSON.stringify(data.notificationPreferences || { collectionReminders: { email: true, sms: false }, scheduleChanges: { email: true, sms: false }, driverUpdates: { email: true, sms: false }, invoiceDue: true, paymentConfirmation: true, autopayReminder: true, serviceUpdates: true, promotions: false, referralUpdates: true })
      ]
    );
    return result.rows[0];
  }

  async getLocationById(propertyId: string): Promise<DbLocation | null> {
    const result = await this.query('SELECT * FROM locations WHERE id = $1', [propertyId]);
    return result.rows[0] || null;
  }

  async deleteLocation(propertyId: string): Promise<void> {
    await this.query('DELETE FROM pending_service_selections WHERE location_id = $1', [propertyId]);
    await this.query('DELETE FROM locations WHERE id = $1', [propertyId]);
  }

  async updateLocation(propertyId: string, data: Partial<{ address: string; service_type: string; in_hoa: boolean; community_name: string | null; has_gate_code: boolean; gate_code: string | null; notes: string | null; notification_preferences: any; transfer_status: string | null; pending_owner: any; collection_day: string | null; collection_day_source: string | null; collection_day_detected_at: string | null; collection_frequency: string | null; zone_id: string | null; latitude: number | null; longitude: number | null }>): Promise<DbLocation> {
    const ALLOWED_COLUMNS = ['address', 'service_type', 'in_hoa', 'community_name', 'has_gate_code', 'gate_code', 'notes', 'notification_preferences', 'transfer_status', 'pending_owner', 'collection_frequency', 'collection_day', 'collection_day_detected_at', 'collection_day_source', 'zone_id', 'latitude', 'longitude'];
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined && ALLOWED_COLUMNS.includes(key)) {
        fields.push(`${key} = $${idx}`);
        values.push(key === 'notification_preferences' || key === 'pending_owner' ? JSON.stringify(val) : val);
        idx++;
      }
    }
    fields.push(`updated_at = NOW()`);
    values.push(propertyId);
    const result = await this.query(
      `UPDATE locations SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await this.query(
      'UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false',
      [userId]
    );
    await this.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, token, expiresAt]
    );
  }

  async getValidResetToken(token: string): Promise<{ id: string; user_id: string; token: string; expires_at: string } | null> {
    const result = await this.query(
      `SELECT * FROM password_reset_tokens
       WHERE token = $1 AND used = false AND expires_at > NOW()`,
      [token]
    );
    return result.rows[0] || null;
  }

  async markResetTokenUsed(token: string): Promise<void> {
    await this.query(
      'UPDATE password_reset_tokens SET used = true WHERE token = $1',
      [token]
    );
  }

  async getProduct(productId: string) {
    const result = await this.query(
      'SELECT * FROM stripe.products WHERE id = $1',
      [productId]
    );
    return result.rows[0] || null;
  }

  async listProducts(active = true) {
    const result = await this.query(
      'SELECT * FROM stripe.products WHERE active = $1 ORDER BY created DESC',
      [active]
    );
    return result.rows;
  }

  async listProductsWithPrices(active = true) {
    const result = await this.query(
      `SELECT 
        p.id as product_id,
        p.name as product_name,
        p.description as product_description,
        p.active as product_active,
        p.metadata as product_metadata,
        pr.id as price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring,
        pr.active as price_active,
        pr.metadata as price_metadata
      FROM stripe.products p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = $1
      ORDER BY p.name, pr.unit_amount`,
      [active]
    );
    return result.rows;
  }

  async getPrice(priceId: string) {
    const result = await this.query(
      'SELECT * FROM stripe.prices WHERE id = $1',
      [priceId]
    );
    return result.rows[0] || null;
  }

  async listPrices(active = true) {
    const result = await this.query(
      'SELECT * FROM stripe.prices WHERE active = $1',
      [active]
    );
    return result.rows;
  }

  async getPricesForProduct(productId: string) {
    const result = await this.query(
      'SELECT * FROM stripe.prices WHERE product = $1 AND active = true',
      [productId]
    );
    return result.rows;
  }

  async getSubscription(subscriptionId: string) {
    const result = await this.query(
      'SELECT * FROM stripe.subscriptions WHERE id = $1',
      [subscriptionId]
    );
    return result.rows[0] || null;
  }

  async listSubscriptions(customerId: string) {
    const result = await this.query(
      'SELECT * FROM stripe.subscriptions WHERE customer = $1 ORDER BY created DESC',
      [customerId]
    );
    return result.rows;
  }

  async getCustomer(customerId: string) {
    const result = await this.query(
      'SELECT * FROM stripe.customers WHERE id = $1',
      [customerId]
    );
    return result.rows[0] || null;
  }

  async listInvoices(customerId: string) {
    const result = await this.query(
      'SELECT * FROM stripe.invoices WHERE customer = $1 ORDER BY created DESC',
      [customerId]
    );
    return result.rows;
  }

  async getInvoice(invoiceId: string) {
    const result = await this.query(
      'SELECT * FROM stripe.invoices WHERE id = $1',
      [invoiceId]
    );
    return result.rows[0] || null;
  }

  async listPaymentMethods(customerId: string) {
    const result = await this.query(
      `SELECT pm.* FROM stripe.payment_methods pm
       WHERE pm.customer = $1
       ORDER BY pm.created DESC`,
      [customerId]
    );
    return result.rows;
  }

  async getActiveServiceAlerts() {
    const result = await this.query(
      'SELECT * FROM service_alerts WHERE active = true ORDER BY created_at DESC'
    );
    return result.rows;
  }

  async createMissedCollectionReport(data: { userId: string; locationId: string; collectionDate: string; notes: string; photos?: string[] }) {
    const result = await this.query(
      `INSERT INTO missed_collection_reports (user_id, location_id, collection_date, notes, photos)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.userId, data.locationId, data.collectionDate, data.notes, JSON.stringify(data.photos || [])]
    );
    return result.rows[0];
  }

  async getMissedCollectionReports(userId: string) {
    const result = await this.query(
      `SELECT m.*, l.address FROM missed_collection_reports m
       JOIN locations l ON m.location_id = l.id
       WHERE m.user_id = $1 ORDER BY m.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  async createOnDemandRequest(data: {
    userId: string; locationId: string; serviceName: string; servicePrice: number;
    requestedDate: string; notes?: string; photos?: any[]; aiEstimate?: number; aiReasoning?: string;
  }) {
    const result = await this.query(
      `INSERT INTO on_demand_requests (user_id, location_id, service_name, service_price, requested_date, notes, photos, ai_estimate, ai_reasoning)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [data.userId, data.locationId, data.serviceName, data.servicePrice, data.requestedDate,
       data.notes || null, JSON.stringify(data.photos || []), data.aiEstimate || null, data.aiReasoning || null]
    );
    return result.rows[0];
  }

  async updateOnDemandRequest(id: string, data: {
    pickupDate?: string; requestedDate?: string; status?: string; cancellationReason?: string;
    adminNotes?: string; assignedDriverId?: string | null; servicePrice?: number;
  }) {
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let idx = 1;
    const nextRequestedDate = data.requestedDate ?? data.pickupDate;
    if (nextRequestedDate !== undefined) { sets.push(`requested_date = $${idx++}`); params.push(nextRequestedDate); }
    if (data.status !== undefined) { sets.push(`status = $${idx++}`); params.push(data.status); }
    if (data.cancellationReason !== undefined) { sets.push(`cancellation_reason = $${idx++}`); params.push(data.cancellationReason); }
    if (data.adminNotes !== undefined) { sets.push(`admin_notes = $${idx++}`); params.push(data.adminNotes); }
    if (data.assignedDriverId !== undefined) { sets.push(`assigned_driver_id = $${idx++}`); params.push(data.assignedDriverId); }
    if (data.servicePrice !== undefined) { sets.push(`service_price = $${idx++}`); params.push(data.servicePrice); }
    params.push(id);
    const result = await this.query(
      `UPDATE on_demand_requests SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return result.rows[0] || null;
  }

  async getOnDemandRequestById(id: string) {
    const result = await this.query(
      `SELECT s.*, u.first_name, u.last_name, u.email, u.phone, p.address
       FROM on_demand_requests s
       JOIN users u ON s.user_id = u.id
       JOIN locations p ON s.location_id = p.id
       WHERE s.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async getOnDemandRequestsForDriver(driverProfileId: string) {
    const result = await this.query(
      `SELECT s.*, p.address
       FROM on_demand_requests s
       JOIN locations p ON s.location_id = p.id
       WHERE s.assigned_driver_id = $1 AND s.status IN ('scheduled', 'pending')
       ORDER BY s.requested_date ASC`,
      [driverProfileId]
    );
    return result.rows;
  }

  async getOnDemandRequests(userId: string) {
    const result = await this.query(
      'SELECT * FROM on_demand_requests WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async upsertCollectionIntent(data: { userId: string; locationId: string; intent: string; collectionDate: string; optimoOrderNo?: string }) {
    const result = await this.query(
      `INSERT INTO collection_intents (user_id, location_id, intent, collection_date, optimo_order_no)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (location_id, collection_date) DO UPDATE SET intent = $3, optimo_order_no = $5
       RETURNING *`,
      [data.userId, data.locationId, data.intent, data.collectionDate, data.optimoOrderNo || null]
    );
    return result.rows[0];
  }

  async deleteCollectionIntent(propertyId: string, pickupDate: string) {
    await this.query(
      'DELETE FROM collection_intents WHERE location_id = $1 AND collection_date = $2',
      [propertyId, pickupDate]
    );
  }

  async getCollectionIntent(propertyId: string, pickupDate: string) {
    const result = await this.query(
      'SELECT * FROM collection_intents WHERE location_id = $1 AND collection_date = $2',
      [propertyId, pickupDate]
    );
    return result.rows[0] || null;
  }

  async upsertDriverFeedback(data: { userId: string; locationId: string; collectionDate: string; rating?: number; tipAmount?: number; note?: string }) {
    const result = await this.query(
      `INSERT INTO driver_feedback (user_id, location_id, collection_date, rating, tip_amount, note)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (location_id, collection_date) DO UPDATE SET rating = $4, tip_amount = $5, note = $6
       RETURNING *`,
      [data.userId, data.locationId, data.collectionDate, data.rating || null, data.tipAmount || null, data.note || null]
    );
    return result.rows[0];
  }

  async getDriverFeedback(propertyId: string, pickupDate: string) {
    const result = await this.query(
      'SELECT * FROM driver_feedback WHERE location_id = $1 AND collection_date = $2',
      [propertyId, pickupDate]
    );
    return result.rows[0] || null;
  }

  async getDriverFeedbackForLocation(propertyId: string) {
    const result = await this.query(
      'SELECT * FROM driver_feedback WHERE location_id = $1 ORDER BY collection_date DESC',
      [propertyId]
    );
    return result.rows;
  }

  async getOrCreateReferralCode(userId: string, userName: string): Promise<string> {
    const existing = await this.query('SELECT code FROM referral_codes WHERE user_id = $1', [userId]);
    if (existing.rows.length > 0) return existing.rows[0].code;
    const namePart = userName.replace(/[^A-Z]/gi, '').substring(0, 6).toUpperCase() || 'USER';
    const randPart = crypto.randomInt(1000, 10000);
    const code = `${namePart}-${randPart}`;
    await this.query(
      'INSERT INTO referral_codes (user_id, code) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING',
      [userId, code]
    );
    return code;
  }

  async getReferralsByUser(userId: string) {
    const result = await this.query(
      'SELECT * FROM referrals WHERE referrer_user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async getRedemptionsForUser(userId: string) {
    const result = await this.query(
      'SELECT * FROM redemptions WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async createRedemption(data: { userId: string; amount: number; method: string; status: string; }) {
    const result = await this.query(
      `INSERT INTO redemptions (user_id, amount, method, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.userId, data.amount, data.method, data.status]
    );
    return result.rows[0];
  }

  async getReferralCodeForUser(userId: string) {
    const result = await this.query(
      'SELECT * FROM referral_codes WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }

  async getReferralsForUser(userId: string) {
    const result = await this.query(
      'SELECT * FROM referrals WHERE referrer_user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async getReferralTotalRewards(userId: string): Promise<number> {
    const result = await this.query(
      "SELECT COALESCE(SUM(reward_amount), 0) as total FROM referrals WHERE referrer_user_id = $1 AND status = 'completed'",
      [userId]
    );
    return parseFloat(result.rows[0].total);
  }

  async createReferral(referrerUserId: string, referredEmail: string, referredName: string) {
    const result = await this.query(
      'INSERT INTO referrals (referrer_user_id, referred_email, referred_name) VALUES ($1, $2, $3) RETURNING *',
      [referrerUserId, referredEmail, referredName]
    );
    return result.rows[0];
  }

  async findReferrerByCode(code: string): Promise<string | null> {
    const result = await this.query('SELECT user_id FROM referral_codes WHERE code = $1', [code]);
    return result.rows[0]?.user_id || null;
  }

  async completeReferral(referrerUserId: string, referredEmail: string, rewardAmount: number = 10) {
    await this.query(
      "UPDATE referrals SET status = 'completed', completed_at = NOW(), reward_amount = $3 WHERE referrer_user_id = $1 AND referred_email = $2 AND status = 'pending'",
      [referrerUserId, referredEmail, rewardAmount]
    );
  }

  async getPendingReferralForEmail(email: string) {
    const result = await this.query(
      "SELECT r.*, rc.user_id as referrer_user_id FROM referrals r JOIN referral_codes rc ON r.referrer_user_id = rc.user_id WHERE r.referred_email = $1 AND r.status = 'pending' LIMIT 1",
      [email]
    );
    return result.rows[0] || null;
  }

  async initiateTransfer(propertyId: string, newOwner: { firstName: string; lastName: string; email: string }, token: string, expiresAt: Date) {
    await this.query(
      `UPDATE locations SET transfer_status = 'pending', pending_owner = $1, transfer_token = $2, transfer_token_expires = $3 WHERE id = $4`,
      [JSON.stringify(newOwner), token, expiresAt, propertyId]
    );
  }

  async getLocationByTransferToken(token: string): Promise<DbLocation | null> {
    const result = await this.query(
      "SELECT * FROM locations WHERE transfer_token = $1 AND transfer_status = 'pending' AND transfer_token_expires > NOW()",
      [token]
    );
    return result.rows[0] || null;
  }

  async completeTransfer(propertyId: string, newUserId: string) {
    await this.query(
      `UPDATE locations SET user_id = $1, transfer_status = NULL, pending_owner = NULL, transfer_token = NULL, transfer_token_expires = NULL WHERE id = $2`,
      [newUserId, propertyId]
    );
  }

  async cancelTransfer(propertyId: string) {
    await this.query(
      `UPDATE locations SET transfer_status = NULL, pending_owner = NULL, transfer_token = NULL, transfer_token_expires = NULL WHERE id = $1`,
      [propertyId]
    );
  }

  async getAllUsers(): Promise<DbUser[]> {
    const result = await this.query(
      `SELECT * FROM users ORDER BY created_at DESC`
    );
    return result.rows;
  }

  async getAllLocations(): Promise<(DbLocation & { user_email?: string; user_name?: string })[]> {
    const result = await this.query(
      `SELECT p.*, u.email as user_email, u.first_name || ' ' || u.last_name as user_name
       FROM locations p
       LEFT JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC`
    );
    return result.rows;
  }

  async getLocationsPaginated(opts: {
    search?: string;
    status?: string;
    pickupDay?: string;
    page?: number;
    limit?: number;
  }): Promise<{ rows: (DbLocation & { user_email?: string; user_name?: string })[]; total: number }> {
    const page = opts.page || 1;
    const limit = opts.limit || 50;
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (opts.search) {
      conditions.push(`(p.address ILIKE $${idx} OR u.first_name || ' ' || u.last_name ILIKE $${idx} OR u.email ILIKE $${idx})`);
      params.push(`%${opts.search}%`);
      idx++;
    }
    if (opts.status) {
      conditions.push(`p.service_status = $${idx}`);
      params.push(opts.status);
      idx++;
    }
    if (opts.pickupDay) {
      conditions.push(`p.collection_day = $${idx}`);
      params.push(opts.pickupDay);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.query(
      `SELECT COUNT(*) as count FROM locations p LEFT JOIN users u ON p.user_id = u.id ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await this.query(
      `SELECT p.*, u.email as user_email, u.first_name || ' ' || u.last_name as user_name
       FROM locations p
       LEFT JOIN users u ON p.user_id = u.id
       ${where}
       ORDER BY p.address ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    return { rows: dataResult.rows, total };
  }

  async getAdminStats(): Promise<{
    totalUsers: number;
    totalLocations: number;
    recentUsers: number;
    activeTransfers: number;
    totalReferrals: number;
    pendingReferrals: number;
    pendingReviews: number;
    pendingMissedCollections: number;
    locationsWithoutCollectionDay: number;
  }> {
    const [users, locations, recentUsers, transfers, referrals, pendingRefs, pendingReviews, pendingMissedCollections, noCollectionDay] = await Promise.all([
      this.query('SELECT COUNT(*) as count FROM users'),
      this.query('SELECT COUNT(*) as count FROM locations'),
      this.query(`SELECT COUNT(*) as count FROM users WHERE created_at > NOW() - INTERVAL '30 days'`),
      this.query(`SELECT COUNT(*) as count FROM locations WHERE transfer_status = 'pending'`),
      this.query('SELECT COUNT(*) as count FROM referrals'),
      this.query(`SELECT COUNT(*) as count FROM referrals WHERE status = 'pending'`),
      this.query(`SELECT COUNT(*) as count FROM locations WHERE service_status = 'pending_review'`),
      this.query(`SELECT COUNT(*) as count FROM missed_collection_reports WHERE status = 'pending'`),
      this.query(`SELECT COUNT(*) as count FROM locations WHERE service_status = 'approved' AND collection_day IS NULL`),
    ]);
    return {
      totalUsers: parseInt(users.rows[0].count),
      totalLocations: parseInt(locations.rows[0].count),
      recentUsers: parseInt(recentUsers.rows[0].count),
      activeTransfers: parseInt(transfers.rows[0].count),
      totalReferrals: parseInt(referrals.rows[0].count),
      pendingReferrals: parseInt(pendingRefs.rows[0].count),
      pendingReviews: parseInt(pendingReviews.rows[0].count),
      pendingMissedCollections: parseInt(pendingMissedCollections.rows[0].count),
      locationsWithoutCollectionDay: parseInt(noCollectionDay.rows[0].count),
    };
  }

  async getApprovedLocationsWithoutCollectionDay() {
    const result = await this.query(
      `SELECT * FROM locations
       WHERE service_status = 'approved'
         AND collection_day IS NULL
         AND (collection_day_source IS NULL OR collection_day_source != 'manual')`
    );
    return result.rows;
  }

  async setUserAdmin(userId: string, isAdmin: boolean): Promise<void> {
    if (isAdmin) {
      await this.query(
        `INSERT INTO user_roles (user_id, role, admin_role) VALUES ($1, 'admin', 'full_admin')
         ON CONFLICT (user_id, role) DO UPDATE SET admin_role = 'full_admin'`,
        [userId]
      );
    } else {
      await this.query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'admin'`, [userId]);
    }
  }

  async getOnDemandServices() {
    const result = await this.query(
      'SELECT * FROM on_demand_services WHERE active = true ORDER BY name'
    );
    return result.rows;
  }

  async getTipDismissal(propertyId: string, pickupDate: string) {
    const result = await this.query(
      'SELECT * FROM tip_dismissals WHERE location_id = $1 AND collection_date = $2',
      [propertyId, pickupDate]
    );
    return result.rows[0] || null;
  }

  async createTipDismissal(userId: string, propertyId: string, pickupDate: string) {
    await this.query(
      'INSERT INTO tip_dismissals (user_id, location_id, collection_date) VALUES ($1, $2, $3) ON CONFLICT (location_id, collection_date) DO NOTHING',
      [userId, propertyId, pickupDate]
    );
  }

  async getTipDismissalsForLocation(propertyId: string) {
    const result = await this.query(
      'SELECT collection_date FROM tip_dismissals WHERE location_id = $1',
      [propertyId]
    );
    return result.rows.map(r => r.collection_date);
  }

  async searchUsers(query: string): Promise<DbUser[]> {
    const result = await this.query(
      `SELECT * FROM users WHERE 
       LOWER(email) LIKE LOWER($1) OR 
       LOWER(first_name || ' ' || last_name) LIKE LOWER($1)
       ORDER BY created_at DESC LIMIT 50`,
      [`%${query}%`]
    );
    return result.rows;
  }

  async createAuditLog(adminId: string, action: string, entityType?: string, entityId?: string, details?: any) {
    await this.query(
      `INSERT INTO audit_log (admin_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)`,
      [adminId, action, entityType || null, entityId || null, details ? JSON.stringify(details) : '{}']
    );
  }

  async getAuditLogs(options: { limit?: number; offset?: number; adminId?: string; action?: string; entityType?: string; entityId?: string }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (options.adminId) { conditions.push(`al.admin_id = $${idx++}`); params.push(options.adminId); }
    if (options.action) { conditions.push(`al.action ILIKE $${idx++}`); params.push(`%${options.action}%`); }
    if (options.entityType) { conditions.push(`al.entity_type = $${idx++}`); params.push(options.entityType); }
    if (options.entityId) { conditions.push(`al.entity_id = $${idx++}`); params.push(options.entityId); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);
    const result = await this.query(
      `SELECT al.*, u.first_name, u.last_name, u.email as admin_email
       FROM audit_log al JOIN users u ON al.admin_id = u.id
       ${where} ORDER BY al.created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    const countResult = await this.query(`SELECT COUNT(*) as count FROM audit_log al ${where}`, params.slice(0, -2));
    return { logs: result.rows, total: parseInt(countResult.rows[0].count) };
  }

  async createAdminNote(customerId: string, adminId: string, note: string, tags: string[] = []) {
    const result = await this.query(
      `INSERT INTO admin_notes (customer_id, admin_id, note, tags) VALUES ($1, $2, $3, $4) RETURNING *`,
      [customerId, adminId, note, tags]
    );
    return result.rows[0];
  }

  async getAdminNotes(customerId: string) {
    const result = await this.query(
      `SELECT n.*, u.first_name as admin_first_name, u.last_name as admin_last_name
       FROM admin_notes n JOIN users u ON n.admin_id = u.id
       WHERE n.customer_id = $1 ORDER BY n.created_at DESC`,
      [customerId]
    );
    return result.rows;
  }

  async deleteAdminNote(noteId: number, adminId: string) {
    await this.query(`DELETE FROM admin_notes WHERE id = $1 AND admin_id = $2`, [noteId, adminId]);
  }

  async getSignupTrends(days: number = 90) {
    const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
    const result = await this.query(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM users WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
       GROUP BY DATE(created_at) ORDER BY date`,
      [safeDays.toString()]
    );
    return result.rows;
  }

  async getLocationStats() {
    const result = await this.query(
      `SELECT service_type, COUNT(*) as count FROM locations GROUP BY service_type ORDER BY count DESC`
    );
    return result.rows;
  }

  async getPendingReviewLocations(): Promise<(DbLocation & { first_name: string; last_name: string; email: string; phone: string; coverage_flagged_at: string | null; coverage_zone_name: string | null })[]> {
    const result = await this.query(
      `SELECT p.*, u.first_name, u.last_name, u.email, u.phone,
              dcz.name AS coverage_zone_name
       FROM locations p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN driver_custom_zones dcz ON p.coverage_flagged_by_zone = dcz.id
       WHERE p.service_status IN ('pending_review', 'waitlist')
       ORDER BY
         CASE WHEN p.service_status = 'waitlist' AND p.coverage_flagged_at IS NOT NULL THEN 0 ELSE 1 END,
         p.created_at ASC`
    );
    return result.rows;
  }

  async getPendingReviewCount(): Promise<number> {
    const result = await this.query(`SELECT COUNT(*) as count FROM locations WHERE service_status IN ('pending_review', 'waitlist')`);
    return parseInt(result.rows[0].count);
  }

  async updateServiceStatus(propertyId: string, status: string, notes?: string): Promise<DbLocation> {
    const result = await this.query(
      `UPDATE locations SET service_status = $1, service_status_notes = $2, service_status_updated_at = NOW(), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, notes || null, propertyId]
    );
    return result.rows[0];
  }

  /** Approve only if still pending_review or waitlist. Returns true if the update happened (no one else decided first). */
  async approveIfPending(propertyId: string): Promise<boolean> {
    const result = await this.query(
      `UPDATE locations SET service_status = 'approved', service_status_updated_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND service_status IN ('pending_review', 'waitlist') RETURNING id`,
      [propertyId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ── Pending Service Selections (deferred billing) ─────────────────

  async savePendingSelections(propertyId: string, userId: string, selections: { serviceId: string; quantity: number; useSticker: boolean }[]): Promise<void> {
    // Delete existing selections for this property, then insert new ones
    await this.query(`DELETE FROM pending_service_selections WHERE location_id = $1`, [propertyId]);
    for (const sel of selections) {
      await this.query(
        `INSERT INTO pending_service_selections (location_id, user_id, service_id, quantity, use_sticker)
         VALUES ($1, $2, $3, $4, $5)`,
        [propertyId, userId, sel.serviceId, sel.quantity, sel.useSticker]
      );
    }
  }

  async getPendingSelections(propertyId: string): Promise<{ id: string; propertyId: string; userId: string; serviceId: string; quantity: number; useSticker: boolean; createdAt: Date }[]> {
    const result = await this.query(
      `SELECT id, location_id, user_id, service_id, quantity, use_sticker, created_at
       FROM pending_service_selections WHERE location_id = $1 ORDER BY created_at`,
      [propertyId]
    );
    return result.rows.map((r: any) => ({
      id: r.id,
      propertyId: r.location_id,
      userId: r.user_id,
      serviceId: r.service_id,
      quantity: r.quantity,
      useSticker: r.use_sticker,
      createdAt: r.created_at,
    }));
  }

  async deletePendingSelections(propertyId: string): Promise<void> {
    await this.query(`DELETE FROM pending_service_selections WHERE location_id = $1`, [propertyId]);
  }

  /** Atomically delete and return pending selections (prevents race condition on concurrent activation). */
  async claimPendingSelections(propertyId: string): Promise<DbPendingSelection[]> {
    const result = await this.query(
      `DELETE FROM pending_service_selections WHERE location_id = $1 RETURNING *`,
      [propertyId],
    );
    return result.rows;
  }

  async getAllUsersPaginated(options: { limit?: number; offset?: number; search?: string; sortBy?: string; sortDir?: string; serviceType?: string; hasStripe?: string }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (options.search) {
      conditions.push(`(LOWER(u.email) LIKE LOWER($${idx}) OR LOWER(u.first_name || ' ' || u.last_name) LIKE LOWER($${idx}))`);
      params.push(`%${options.search}%`);
      idx++;
    }
    if (options.hasStripe === 'yes') conditions.push(`u.stripe_customer_id IS NOT NULL`);
    if (options.hasStripe === 'no') conditions.push(`u.stripe_customer_id IS NULL`);
    if (options.serviceType) {
      conditions.push(`EXISTS (SELECT 1 FROM locations p WHERE p.user_id = u.id AND p.service_type = $${idx})`);
      params.push(options.serviceType);
      idx++;
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const validSorts: Record<string, string> = { name: 'u.first_name', email: 'u.email', created_at: 'u.created_at', member_since: 'u.member_since' };
    const sortCol = validSorts[options.sortBy || ''] || 'u.created_at';
    const sortDir = options.sortDir === 'asc' ? 'ASC' : 'DESC';
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);
    const result = await this.query(
      `SELECT u.*, (SELECT COUNT(*) FROM locations p WHERE p.user_id = u.id) as location_count
       FROM users u ${where} ORDER BY ${sortCol} ${sortDir} LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    const countResult = await this.query(`SELECT COUNT(*) as count FROM users u ${where}`, params.slice(0, -2));
    return { users: result.rows, total: parseInt(countResult.rows[0].count) };
  }

  async getAdminUsers() {
    const result = await this.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.created_at,
              ur.admin_role, true as is_admin
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'admin'
       ORDER BY u.created_at ASC`
    );
    return result.rows;
  }

  async updateAdminRole(userId: string, role: string | null) {
    if (role) {
      await this.query(
        `INSERT INTO user_roles (user_id, role, admin_role) VALUES ($1, 'admin', $2)
         ON CONFLICT (user_id, role) DO UPDATE SET admin_role = $2`,
        [userId, role]
      );
    } else {
      await this.query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'admin'`, [userId]);
    }
  }

  async bulkUpdateAdminStatus(userIds: string[], isAdmin: boolean) {
    if (userIds.length === 0) return;
    for (const userId of userIds) {
      if (isAdmin) {
        await this.query(
          `INSERT INTO user_roles (user_id, role, admin_role) VALUES ($1, 'admin', 'full_admin')
           ON CONFLICT (user_id, role) DO UPDATE SET admin_role = 'full_admin'`,
          [userId]
        );
      } else {
        await this.query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'admin'`, [userId]);
      }
    }
  }

  async updateUserAdmin(userId: string, data: Partial<{ first_name: string; last_name: string; phone: string; email: string }>) {
    const ALLOWED_COLUMNS = ['first_name', 'last_name', 'phone', 'email'];
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined && ALLOWED_COLUMNS.includes(key)) {
        fields.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
    }
    if (fields.length === 0) return;
    fields.push(`updated_at = NOW()`);
    values.push(userId);
    await this.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, values);
  }

  async globalSearch(query: string) {
    const searchParam = `%${query}%`;
    const [users, locations] = await Promise.all([
      this.query(
        `SELECT id, first_name, last_name, email, 'user' as type FROM users
         WHERE LOWER(email) LIKE LOWER($1) OR LOWER(first_name || ' ' || last_name) LIKE LOWER($1) LIMIT 10`,
        [searchParam]
      ),
      this.query(
        `SELECT p.id, p.address, p.service_type, u.first_name || ' ' || u.last_name as owner_name, 'location' as type
         FROM locations p JOIN users u ON p.user_id = u.id
         WHERE LOWER(p.address) LIKE LOWER($1) LIMIT 10`,
        [searchParam]
      ),
    ]);
    return { users: users.rows, locations: locations.rows };
  }

  async getMissedCollectionReportsAdmin(options: { status?: string; limit?: number; offset?: number }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (options.status) { conditions.push(`m.status = $${idx++}`); params.push(options.status); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);
    const result = await this.query(
      `SELECT m.*, u.first_name, u.last_name, u.email, p.address
       FROM missed_collection_reports m
       JOIN users u ON m.user_id = u.id
       JOIN locations p ON m.location_id = p.id
       ${where} ORDER BY m.created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    const countResult = await this.query(`SELECT COUNT(*) as count FROM missed_collection_reports m ${where}`, params.slice(0, -2));
    return { reports: result.rows, total: parseInt(countResult.rows[0].count) };
  }

  async updateMissedCollectionStatus(reportId: string, status: string, resolutionNotes?: string) {
    await this.query(
      `UPDATE missed_collection_reports SET status = $1, resolution_notes = $2, updated_at = NOW() WHERE id = $3`,
      [status, resolutionNotes || null, reportId]
    );
  }

  async getOnDemandRequestsAdmin(options: { status?: string; limit?: number; offset?: number }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (options.status && options.status !== 'all') { conditions.push(`s.status = $${idx++}`); params.push(options.status); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);
    const result = await this.query(
      `SELECT s.*, u.first_name, u.last_name, u.email, p.address
       FROM on_demand_requests s
       JOIN users u ON s.user_id = u.id
       JOIN locations p ON s.location_id = p.id
       ${where} ORDER BY s.created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    const countResult = await this.query(`SELECT COUNT(*) as count FROM on_demand_requests s ${where}`, params.slice(0, -2));
    return { requests: result.rows, total: parseInt(countResult.rows[0].count) };
  }

  async getUsersForExport(options: { search?: string; serviceType?: string; hasStripe?: string }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (options.search) {
      conditions.push(`(LOWER(u.email) LIKE LOWER($${idx}) OR LOWER(u.first_name || ' ' || u.last_name) LIKE LOWER($${idx}))`);
      params.push(`%${options.search}%`);
      idx++;
    }
    if (options.hasStripe === 'yes') conditions.push(`u.stripe_customer_id IS NOT NULL`);
    if (options.hasStripe === 'no') conditions.push(`u.stripe_customer_id IS NULL`);
    if (options.serviceType) {
      conditions.push(`EXISTS (SELECT 1 FROM locations p2 WHERE p2.user_id = u.id AND p2.service_type = $${idx})`);
      params.push(options.serviceType);
      idx++;
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.member_since, u.stripe_customer_id,
       EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin') as is_admin,
       u.created_at,
       (SELECT COUNT(*) FROM locations p WHERE p.user_id = u.id) as location_count,
       (SELECT string_agg(p.address, '; ') FROM locations p WHERE p.user_id = u.id) as addresses
       FROM users u ${where} ORDER BY u.created_at DESC`,
      params
    );
    return result.rows;
  }
  async getUserRoles(userId: string): Promise<string[]> {
    const result = await this.query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
    return result.rows.map((r: any) => r.role);
  }

  async addUserRole(userId: string, role: string, adminRole?: string, grantedBy?: string): Promise<void> {
    await this.query(
      `INSERT INTO user_roles (user_id, role, admin_role, granted_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, role) DO UPDATE SET admin_role = COALESCE($3, user_roles.admin_role)`,
      [userId, role, adminRole || null, grantedBy || null]
    );
  }

  async removeUserRole(userId: string, role: string): Promise<void> {
    await this.query('DELETE FROM user_roles WHERE user_id = $1 AND role = $2', [userId, role]);
  }

  // ==================== Communications ====================

  async createDriver(data: { name: string; email?: string; phone?: string; optimorouteDriverId?: string }) {
    const result = await this.query(
      `INSERT INTO driver_profiles (name, optimoroute_driver_id) VALUES ($1, $2) RETURNING *`,
      [data.name, data.optimorouteDriverId || null]
    );
    return result.rows[0];
  }

  async createDriverProfile(data: { userId: string; name: string; optimorouteDriverId?: string }) {
    const result = await this.query(
      `INSERT INTO driver_profiles (user_id, name, optimoroute_driver_id, onboarding_status)
       VALUES ($1, $2, $3, 'w9_pending') RETURNING *`,
      [data.userId, data.name, data.optimorouteDriverId || null]
    );
    return result.rows[0];
  }

  async getDrivers() {
    const result = await this.query(`SELECT dp.*, u.first_name, u.last_name, u.email as user_email, u.phone as user_phone FROM driver_profiles dp JOIN users u ON dp.user_id = u.id WHERE dp.status = 'active' ORDER BY dp.name`);
    return result.rows;
  }

  async getDriverById(id: string) {
    const result = await this.query(`SELECT * FROM driver_profiles WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }

  async createConversation(data: { subject?: string; type: string; createdById: string; createdByType: string; participants: { id: string; type: string; role: string }[] }) {
    const conv = await this.query(
      `INSERT INTO conversations (subject, type, created_by_id, created_by_type) VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.subject || null, data.type, data.createdById, data.createdByType]
    );
    const conversation = conv.rows[0];
    for (const p of data.participants) {
      await this.query(
        `INSERT INTO conversation_participants (conversation_id, participant_id, participant_type, role) VALUES ($1, $2, $3, $4)`,
        [conversation.id, p.id, p.type, p.role]
      );
    }
    return conversation;
  }

  async getConversations(participantId: string, participantType: string, options: { limit?: number; offset?: number; status?: string } = {}) {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const listParams: any[] = [participantId, participantType, limit, offset];
    const countParams: any[] = [participantId, participantType];
    let statusFilter = '';
    if (options.status && options.status !== 'all') {
      statusFilter = `AND c.status = $5`;
      listParams.push(options.status);
      countParams.push(options.status);
    }
    const countStatusFilter = options.status && options.status !== 'all' ? `AND c.status = $3` : '';

    const result = await this.query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
        (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
        (SELECT sender_type FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_sender_type,
        (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')) as unread_count
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.participant_id = $1 AND cp.participant_type = $2
       ${statusFilter}
       ORDER BY COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.conversation_id = c.id), c.created_at) DESC
       LIMIT $3 OFFSET $4`,
      listParams
    );

    const countResult = await this.query(
      `SELECT COUNT(*) FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.participant_id = $1 AND cp.participant_type = $2
       ${countStatusFilter}`,
      countParams
    );

    return { conversations: result.rows, total: parseInt(countResult.rows[0].count) };
  }

  async getAllConversations(options: { limit?: number; offset?: number; status?: string } = {}) {
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (options.status && options.status !== 'all') {
      conditions.push(`c.status = $${idx++}`);
      params.push(options.status);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
        (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
        (SELECT sender_type FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_sender_type,
        (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at
       FROM conversations c ${where}
       ORDER BY COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.conversation_id = c.id), c.created_at) DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    const countResult = await this.query(
      `SELECT COUNT(*) FROM conversations c ${where}`,
      params
    );

    return { conversations: result.rows, total: parseInt(countResult.rows[0].count) };
  }

  async getConversationById(conversationId: string) {
    const result = await this.query(`SELECT * FROM conversations WHERE id = $1`, [conversationId]);
    return result.rows[0] || null;
  }

  async getConversationParticipants(conversationId: string) {
    const result = await this.query(
      `SELECT cp.*,
        (SELECT first_name || ' ' || last_name FROM users WHERE id = cp.participant_id) as participant_name,
        (SELECT email FROM users WHERE id = cp.participant_id) as participant_email
       FROM conversation_participants cp
       WHERE cp.conversation_id = $1
       ORDER BY cp.joined_at`,
      [conversationId]
    );
    return result.rows;
  }

  async isParticipant(conversationId: string, participantId: string, participantType: string) {
    const result = await this.query(
      `SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND participant_id = $2 AND participant_type = $3`,
      [conversationId, participantId, participantType]
    );
    return result.rows.length > 0;
  }

  async getMessages(conversationId: string, options: { limit?: number; before?: string } = {}) {
    const limit = options.limit || 50;
    const params: any[] = [conversationId, limit];
    let beforeClause = '';
    if (options.before) {
      beforeClause = `AND m.created_at < $3`;
      params.push(options.before);
    }

    const result = await this.query(
      `SELECT m.*,
        (SELECT first_name || ' ' || last_name FROM users WHERE id = m.sender_id) as sender_name
       FROM messages m
       WHERE m.conversation_id = $1 ${beforeClause}
       ORDER BY m.created_at ASC
       LIMIT $2`,
      params
    );
    return result.rows;
  }

  async createMessage(data: { conversationId: string; senderId: string; senderType: string; body: string; messageType?: string }) {
    const result = await this.query(
      `INSERT INTO messages (conversation_id, sender_id, sender_type, body, message_type) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.conversationId, data.senderId, data.senderType, data.body, data.messageType || 'text']
    );
    await this.query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [data.conversationId]);
    return result.rows[0];
  }

  async markConversationRead(conversationId: string, participantId: string, participantType: string) {
    await this.query(
      `UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND participant_id = $2 AND participant_type = $3`,
      [conversationId, participantId, participantType]
    );
  }

  async updateConversationStatus(conversationId: string, status: string) {
    await this.query(`UPDATE conversations SET status = $1, updated_at = NOW() WHERE id = $2`, [status, conversationId]);
  }

  async getConversationsForCustomer(userId: string) {
    const result = await this.query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
        (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')) as unread_count
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.participant_id = $1 AND cp.participant_type = 'user'
       WHERE c.status != 'archived'
       ORDER BY COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.conversation_id = c.id), c.created_at) DESC`,
      [userId]
    );
    return result.rows;
  }

  async getConversationsForDriver(driverId: string) {
    const result = await this.query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
        (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')) as unread_count
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.participant_id = $1 AND cp.participant_type = 'driver'
       WHERE c.status != 'archived'
       ORDER BY COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.conversation_id = c.id), c.created_at) DESC`,
      [driverId]
    );
    return result.rows;
  }

  async getUnreadCount(participantId: string, participantType: string) {
    const result = await this.query(
      `SELECT COUNT(DISTINCT c.id) as count FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.participant_id = $1 AND cp.participant_type = $2
       WHERE c.status = 'open'
       AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01'))`,
      [participantId, participantType]
    );
    return parseInt(result.rows[0].count);
  }

  async getDriverByEmail(email: string) {
    const result = await this.query(
      `SELECT dp.*, u.email, u.phone, u.password_hash, u.first_name, u.last_name
       FROM driver_profiles dp
       JOIN users u ON dp.user_id = u.id
       WHERE LOWER(u.email) = LOWER($1)`,
      [email]
    );
    return result.rows[0] || null;
  }

  async getDriverProfileByUserId(userId: string) {
    const result = await this.query('SELECT * FROM driver_profiles WHERE user_id = $1', [userId]);
    return result.rows[0] || null;
  }

  async updateDriver(id: string, data: Partial<{ name: string; email: string; phone: string; password_hash: string; status: string; onboarding_status: string; rating: number; total_jobs_completed: number; stripe_connect_account_id: string; stripe_connect_onboarded: boolean; w9_completed: boolean; direct_deposit_completed: boolean; availability: any; optimoroute_driver_id: string | null }>) {
    const ALLOWED_COLUMNS = ['name', 'email', 'phone', 'password_hash', 'status', 'onboarding_status', 'rating', 'total_jobs_completed', 'stripe_connect_account_id', 'stripe_connect_onboarded', 'w9_completed', 'direct_deposit_completed', 'availability', 'optimoroute_driver_id'];
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined && ALLOWED_COLUMNS.includes(key)) {
        fields.push(`${key} = $${idx}`);
        values.push(key === 'availability' ? JSON.stringify(val) : val);
        idx++;
      }
    }
    if (fields.length === 0) return null;
    fields.push(`updated_at = NOW()`);
    values.push(id);
    const result = await this.query(
      `UPDATE driver_profiles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async createW9(driverId: string, data: { legal_name: string; business_name?: string; federal_tax_classification: string; other_classification?: string; exempt_payee_code?: string; fatca_exemption_code?: string; address: string; city: string; state: string; zip: string; requester_name?: string; requester_address?: string; account_numbers?: string; ssn_last4?: string; ein?: string; tin_type: string; signature_data?: string; signature_date: string; certified?: boolean }) {
    const result = await this.query(
      `INSERT INTO driver_w9 (driver_id, legal_name, business_name, federal_tax_classification, other_classification, exempt_payee_code, fatca_exemption_code, address, city, state, zip, requester_name, requester_address, account_numbers, ssn_last4, ein, tin_type, signature_data, signature_date, certified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING *`,
      [driverId, data.legal_name, data.business_name || null, data.federal_tax_classification, data.other_classification || null, data.exempt_payee_code || null, data.fatca_exemption_code || null, data.address, data.city, data.state, data.zip, data.requester_name || null, data.requester_address || null, data.account_numbers || null, data.ssn_last4 || null, data.ein || null, data.tin_type, data.signature_data || null, data.signature_date, data.certified ?? false]
    );
    return result.rows[0];
  }

  async getW9ByDriverId(driverId: string) {
    const result = await this.query('SELECT * FROM driver_w9 WHERE driver_id = $1', [driverId]);
    return result.rows[0] || null;
  }

  async createRoute(data: {
    title: string;
    description?: string;
    scheduled_date: string;
    start_time?: string;
    end_time?: string;
    estimated_orders?: number;
    estimated_hours?: number;
    base_pay?: number;
    notes?: string;
    assigned_driver_id?: string | null;
    route_type?: string;
    zone_id?: string;
    source?: string;
    on_demand_request_id?: string;
    status?: string;
    polyline?: string | null;
  }) {
    const status = data.status ?? (data.assigned_driver_id ? 'assigned' : 'open');
    const result = await this.query(
      `INSERT INTO routes
         (title, description, scheduled_date, start_time, end_time,
          estimated_orders, estimated_hours, base_pay, notes, assigned_driver_id, status,
          route_type, zone_id, source, on_demand_request_id, polyline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        data.title,
        data.description ?? null,
        data.scheduled_date,
        data.start_time ?? null,
        data.end_time ?? null,
        data.estimated_orders ?? null,
        data.estimated_hours ?? null,
        data.base_pay ?? null,
        data.notes ?? null,
        data.assigned_driver_id ?? null,
        status,
        data.route_type ?? 'daily_route',
        data.zone_id ?? null,
        data.source ?? 'manual',
        data.on_demand_request_id ?? null,
        data.polyline ?? null,
      ]
    );
    return result.rows[0];
  }

  async getAllRoutes(filters?: { route_type?: string; status?: string; date_from?: string; date_to?: string; zoneIds?: string[] }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (filters?.route_type) { conditions.push(`r.route_type = $${idx++}`); params.push(filters.route_type); }
    if (filters?.status) { conditions.push(`r.status = $${idx++}`); params.push(filters.status); }
    if (filters?.date_from) { conditions.push(`r.scheduled_date >= $${idx++}`); params.push(filters.date_from); }
    if (filters?.date_to) { conditions.push(`r.scheduled_date <= $${idx++}`); params.push(filters.date_to); }
    if (filters?.zoneIds && filters.zoneIds.length > 0) {
      conditions.push(`r.zone_id = ANY($${idx++}::uuid[])`);
      params.push(filters.zoneIds);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.query(
      `SELECT r.*, r.optimo_synced, r.optimo_synced_at,
              d.name AS driver_name, d.optimoroute_driver_id AS driver_optimo_serial,
              COALESCE(bc.bid_count, 0)::int AS bid_count,
              COALESCE(sc.order_count, 0)::int AS order_count,
              COALESCE(dc.done_count, 0)::int AS completed_order_count
       FROM routes r
       LEFT JOIN driver_profiles d ON r.assigned_driver_id = d.id
       LEFT JOIN (SELECT route_id, COUNT(*) AS bid_count FROM route_bids GROUP BY route_id) bc ON bc.route_id = r.id
       LEFT JOIN (SELECT route_id, COUNT(*) AS order_count FROM route_orders GROUP BY route_id) sc ON sc.route_id = r.id
       LEFT JOIN (SELECT route_id, COUNT(*) AS done_count FROM route_orders WHERE status IN ('completed', 'failed') GROUP BY route_id) dc ON dc.route_id = r.id
       ${where}
       ORDER BY r.scheduled_date DESC, r.created_at DESC`,
      params
    );
    return result.rows;
  }

  async getOpenRoutes(filters?: { startDate?: string; endDate?: string }) {
    const conditions: string[] = [`r.status IN ('open', 'bidding')`];
    const params: any[] = [];
    let idx = 1;
    if (filters?.startDate) {
      conditions.push(`r.scheduled_date >= $${idx++}`);
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      conditions.push(`r.scheduled_date <= $${idx++}`);
      params.push(filters.endDate);
    }
    const result = await this.query(
      `SELECT r.*
       FROM routes r
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.scheduled_date ASC, r.start_time ASC`,
      params
    );
    return result.rows;
  }

  async getRouteById(routeId: string) {
    const result = await this.query('SELECT * FROM routes WHERE id = $1', [routeId]);
    return result.rows[0] || null;
  }

  async getRouteBids(routeId: string) {
    const result = await this.query(
      `SELECT rb.*, d.name as driver_name, d.rating as driver_rating
       FROM route_bids rb
       JOIN driver_profiles d ON rb.driver_id = d.id
       WHERE rb.route_id = $1
       ORDER BY rb.created_at ASC`,
      [routeId]
    );
    return result.rows;
  }

  async createRouteBid(data: { routeId: string; driverId: string; bidAmount: number; message?: string; driverRatingAtBid: number }) {
    const result = await this.query(
      `INSERT INTO route_bids (route_id, driver_id, bid_amount, message, driver_rating_at_bid)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.routeId, data.driverId, data.bidAmount, data.message || null, data.driverRatingAtBid]
    );
    return result.rows[0];
  }

  async deleteRoute(routeId: string) {
    await this.query('DELETE FROM route_bids WHERE route_id = $1', [routeId]);
    await this.query('DELETE FROM routes WHERE id = $1', [routeId]);
  }

  async deleteRouteBid(routeId: string, driverId: string) {
    await this.query('DELETE FROM route_bids WHERE route_id = $1 AND driver_id = $2', [routeId, driverId]);
  }

  async getBidByRouteAndDriver(routeId: string, driverId: string) {
    const result = await this.query(
      'SELECT * FROM route_bids WHERE route_id = $1 AND driver_id = $2',
      [routeId, driverId]
    );
    return result.rows[0] || null;
  }

  async updateRoute(routeId: string, data: Partial<{ title: string; description: string; scheduled_date: string; start_time: string; end_time: string; estimated_orders: number; estimated_hours: number; base_pay: number; status: string; assigned_driver_id: string; notes: string; route_type: string; zone_id: string; source: string; on_demand_request_id: string; optimo_planning_id: string; accepted_bid_id: string; actual_pay: number; payment_status: string; completed_at: string | null; optimo_route_key: string; polyline: string | null }>) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
    }
    if (fields.length === 0) return null;
    fields.push(`updated_at = NOW()`);
    values.push(routeId);
    const result = await this.query(
      `UPDATE routes SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async getDriverRoutes(driverId: string) {
    const result = await this.query(
      `SELECT * FROM routes WHERE assigned_driver_id = $1 ORDER BY scheduled_date DESC, start_time ASC`,
      [driverId]
    );
    return result.rows;
  }

  async getDriverSchedule(driverId: string, start: string, end: string) {
    const result = await this.query(
      `SELECT * FROM routes WHERE assigned_driver_id = $1 AND scheduled_date >= $2 AND scheduled_date <= $3 ORDER BY scheduled_date ASC, start_time ASC`,
      [driverId, start, end]
    );
    return result.rows;
  }

  async getAllBidsPaginated(options: {
    driverId?: string;
    routeStatus?: string;
    search?: string;
    sortBy?: string;
    sortDir?: string;
    limit?: number;
    offset?: number;
  }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (options.driverId) {
      conditions.push(`rb.driver_id = $${idx++}`);
      params.push(options.driverId);
    }
    if (options.routeStatus && options.routeStatus !== 'all') {
      conditions.push(`r.status = $${idx++}`);
      params.push(options.routeStatus);
    }
    if (options.search) {
      conditions.push(`(LOWER(r.title) LIKE LOWER($${idx}) OR LOWER(d.name) LIKE LOWER($${idx}))`);
      params.push(`%${options.search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const validSorts: Record<string, string> = {
      bid_date: 'rb.created_at',
      bid_amount: 'rb.bid_amount',
      route_date: 'r.scheduled_date',
      driver_name: 'd.name',
      route_title: 'r.title',
    };
    const sortCol = validSorts[options.sortBy || ''] || 'rb.created_at';
    const sortDir = options.sortDir === 'asc' ? 'ASC' : 'DESC';

    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const countResult = await this.query(
      `SELECT COUNT(*) as count
       FROM route_bids rb
       JOIN routes r ON rb.route_id = r.id
       JOIN driver_profiles d ON rb.driver_id = d.id
       ${where}`,
      params
    );

    const result = await this.query(
      `SELECT rb.id, rb.route_id, rb.driver_id, rb.bid_amount, rb.message,
              rb.driver_rating_at_bid, rb.created_at,
              r.title AS route_title, r.status AS route_status,
              r.scheduled_date AS route_scheduled_date,
              r.base_pay AS route_base_pay,
              d.name AS driver_name, d.rating AS driver_rating
       FROM route_bids rb
       JOIN routes r ON rb.route_id = r.id
       JOIN driver_profiles d ON rb.driver_id = d.id
       ${where}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );

    return { bids: result.rows, total: parseInt(countResult.rows[0].count) };
  }

  async getBidStats() {
    const result = await this.query(`
      SELECT
        COUNT(*) AS total_bids,
        COUNT(DISTINCT route_id) AS routes_with_bids,
        COALESCE(AVG(bid_amount), 0) AS avg_bid_amount,
        COUNT(DISTINCT driver_id) AS unique_bidders
      FROM route_bids
    `);
    const row = result.rows[0];
    return {
      totalBids: parseInt(row.total_bids),
      routesWithBids: parseInt(row.routes_with_bids),
      avgBidAmount: parseFloat(row.avg_bid_amount),
      uniqueBidders: parseInt(row.unique_bidders),
    };
  }

  // ==================== OptimoRoute Sync ====================

  async getLocationsForSync(): Promise<any[]> {
    const result = await this.query(
      `SELECT p.*, u.first_name, u.last_name, u.email, u.stripe_customer_id
       FROM locations p
       JOIN users u ON u.id = p.user_id
       WHERE p.address IS NOT NULL AND p.address != ''
         AND p.service_status = 'approved'
         AND p.provider_id IS NOT NULL
         AND u.stripe_customer_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM stripe.subscriptions s
           WHERE s.customer = u.stripe_customer_id AND s.status = 'active'
         )
       ORDER BY p.provider_id, u.last_name, u.first_name`
    );
    return result.rows;
  }

  async getLocationsNeedingDayDetection(): Promise<any[]> {
    const result = await this.query(
      `SELECT p.*, u.first_name, u.last_name
       FROM locations p
       JOIN users u ON u.id = p.user_id
       WHERE p.address IS NOT NULL AND p.address != ''
         AND (
           p.collection_day IS NULL
           OR (p.collection_day_source = 'auto_detected' AND p.collection_day_detected_at < NOW() - INTERVAL '30 days')
         )
         AND (p.collection_day_source IS NULL OR p.collection_day_source != 'manual')
       ORDER BY u.last_name, u.first_name`
    );
    return result.rows;
  }

  async updateLocationCollectionSchedule(propertyId: string, data: { collection_day?: string | null; collection_frequency?: string; collection_day_detected_at?: string; collection_day_source?: string }): Promise<any> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let idx = 1;
    if (data.collection_day !== undefined) { sets.push(`collection_day = $${idx++}`); params.push(data.collection_day); }
    if (data.collection_frequency !== undefined) { sets.push(`collection_frequency = $${idx++}`); params.push(data.collection_frequency); }
    if (data.collection_day_detected_at !== undefined) { sets.push(`collection_day_detected_at = $${idx++}`); params.push(data.collection_day_detected_at); }
    if (data.collection_day_source !== undefined) { sets.push(`collection_day_source = $${idx++}`); params.push(data.collection_day_source); }
    params.push(propertyId);
    const result = await this.query(
      `UPDATE locations SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return result.rows[0];
  }

  // -- Sync orders ledger --

  async getSyncOrderByOrderNo(orderNo: string): Promise<any> {
    const result = await this.query('SELECT * FROM optimo_sync_orders WHERE order_no = $1', [orderNo]);
    return result.rows[0] || null;
  }

  async createSyncOrder(data: { locationId: string; orderNo: string; scheduledDate: string }): Promise<any> {
    const result = await this.query(
      `INSERT INTO optimo_sync_orders (location_id, order_no, scheduled_date) VALUES ($1, $2, $3) RETURNING *`,
      [data.locationId, data.orderNo, data.scheduledDate]
    );
    return result.rows[0];
  }

  async markSyncOrderDeleted(orderNo: string): Promise<void> {
    await this.query(
      `UPDATE optimo_sync_orders SET status = 'deleted', deleted_at = NOW() WHERE order_no = $1`,
      [orderNo]
    );
  }

  async getFutureSyncOrdersForLocation(propertyId: string): Promise<any[]> {
    const today = new Date().toISOString().split('T')[0];
    const result = await this.query(
      `SELECT * FROM optimo_sync_orders WHERE location_id = $1 AND status = 'active' AND scheduled_date >= $2 ORDER BY scheduled_date`,
      [propertyId, today]
    );
    return result.rows;
  }

  async getOrphanedSyncLocationIds(): Promise<string[]> {
    const today = new Date().toISOString().split('T')[0];
    const result = await this.query(
      `SELECT DISTINCT oso.location_id FROM optimo_sync_orders oso
       WHERE oso.status = 'active' AND oso.scheduled_date >= $1
         AND oso.location_id NOT IN (
           SELECT p.id FROM locations p
           JOIN users u ON u.id = p.user_id
           WHERE u.stripe_customer_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM stripe.subscriptions s
               WHERE s.customer = u.stripe_customer_id AND s.status = 'active'
             )
         )`,
      [today]
    );
    return result.rows.map((r: any) => r.location_id);
  }

  // -- Sync log --

  async createSyncLogEntry(runType: string): Promise<string> {
    const result = await this.query(
      `INSERT INTO optimo_sync_log (run_type) VALUES ($1) RETURNING id`,
      [runType]
    );
    return result.rows[0].id;
  }

  async updateSyncLogEntry(id: string, data: {
    finished_at?: string; status?: string; locations_processed?: number;
    orders_created?: number; orders_skipped?: number; orders_errored?: number;
    orders_deleted?: number; detection_updates?: number; error_message?: string; details?: any;
  }): Promise<void> {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        sets.push(`${key} = $${idx++}`);
        params.push(key === 'details' ? JSON.stringify(val) : val);
      }
    }
    if (sets.length === 0) return;
    params.push(id);
    await this.query(`UPDATE optimo_sync_log SET ${sets.join(', ')} WHERE id = $${idx}`, params);
  }

  async getLatestSyncLog(): Promise<any> {
    const result = await this.query('SELECT * FROM optimo_sync_log ORDER BY started_at DESC LIMIT 1');
    return result.rows[0] || null;
  }

  async getSyncLogHistory(limit: number = 20): Promise<any[]> {
    const result = await this.query('SELECT * FROM optimo_sync_log ORDER BY started_at DESC LIMIT $1', [limit]);
    return result.rows;
  }

  async hasSyncRunToday(): Promise<boolean> {
    const result = await this.query(
      `SELECT 1 FROM optimo_sync_log WHERE DATE(started_at) = CURRENT_DATE AND status = 'completed' LIMIT 1`
    );
    return result.rows.length > 0;
  }

  // ==================== Providers & Territories ====================

  async createProvider(data: { name: string; ownerUserId: string }): Promise<{ id: string; name: string; owner_user_id: string; status: string; }> {
    const result = await this.query(
      `INSERT INTO providers (name, owner_user_id) VALUES ($1, $2) RETURNING *`,
      [data.name, data.ownerUserId]
    );
    return result.rows[0];
  }

  async getProviders() {
    const result = await this.query(`
      SELECT p.*, u.first_name || ' ' || u.last_name as owner_name, u.email as owner_email,
             (SELECT COUNT(*) FROM driver_profiles dp WHERE dp.provider_id = p.id) as driver_count,
             (SELECT COUNT(*) FROM provider_territories pt WHERE pt.provider_id = p.id) as territory_count
      FROM providers p
      JOIN users u ON p.owner_user_id = u.id
      ORDER BY p.name
    `);
    return result.rows;
  }

  async getProviderById(id: string) {
    const result = await this.query('SELECT * FROM providers WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async updateProvider(id: string, data: Partial<{ name: string; status: string; }>) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(val);
      }
    }
    if (fields.length === 0) return null;
    fields.push(`updated_at = NOW()`);
    values.push(id);
    const result = await this.query(
      `UPDATE providers SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async createProviderTerritory(data: { providerId: string; name: string; zone_type: string; polygon_coords?: any; zip_codes?: string[]; color?: string; default_pickup_day?: string; }) {
    const result = await this.query(
      `INSERT INTO provider_territories (provider_id, name, zone_type, polygon_coords, zip_codes, color, default_pickup_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.providerId, data.name, data.zone_type, data.polygon_coords ? JSON.stringify(data.polygon_coords) : null, data.zip_codes || null, data.color || '#3B82F6', data.default_pickup_day || null]
    );
    return result.rows[0];
  }

  async getTerritoriesForProvider(providerId: string) {
    const result = await this.query(`SELECT * FROM provider_territories WHERE provider_id = $1 ORDER BY name`, [providerId]);
    return result.rows;
  }

  async getTerritoryById(id: string) {
     const result = await this.query('SELECT * FROM provider_territories WHERE id = $1', [id]);
     return result.rows[0] || null;
  }

  async updateProviderTerritory(id: string, data: Partial<{ name: string; polygon_coords: any; zip_codes: string[]; color: string; default_pickup_day: string; status: string }>) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(key === 'polygon_coords' ? JSON.stringify(val) : val);
      }
    }
    if (fields.length === 0) return null;
    fields.push(`updated_at = NOW()`);
    values.push(id);
    const result = await this.query(
      `UPDATE provider_territories SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async deleteProviderTerritory(id: string) {
     const result = await this.query('DELETE FROM provider_territories WHERE id = $1', [id]);
     return result.rowCount! > 0;
  }

  async getProviderWorkload(providerId: string): Promise<number> {
    const result = await this.query(
        `SELECT COUNT(*) as count FROM locations WHERE provider_id = $1 AND service_status = 'approved'`,
        [providerId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  async getPendingSwaps() {
    const result = await this.query(`
        SELECT
            s.id, s.status, s.created_at,
            s.provider_a_id, pa.name as provider_a_name,
            s.provider_b_id, pb.name as provider_b_name,
            s.location_a_to_b_id, la.address as location_a_address,
            s.location_b_to_a_id, lb.address as location_b_address,
            s.value_a_to_b_monthly::float8 as value_a_to_b_monthly,
            s.value_b_to_a_monthly::float8 as value_b_to_a_monthly,
            s.net_value_change_a::float8 as net_value_change_a
        FROM swap_recommendations s
        JOIN providers pa ON s.provider_a_id = pa.id
        JOIN providers pb ON s.provider_b_id = pb.id
        JOIN locations la ON s.location_a_to_b_id = la.id
        JOIN locations lb ON s.location_b_to_a_id = lb.id
        WHERE s.status = 'pending'
        ORDER BY s.created_at DESC
    `);
    return result.rows;
  }

  async updateSwapStatus(id: string, status: 'accepted' | 'rejected', reviewerId: string | null) {
    const result = await this.query(
      `UPDATE swap_recommendations
       SET status = $1, reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [status, reviewerId, id]
    );
    return result.rows[0] || null;
  }

  async createSwapRecommendation(data: {
    providerAId: string;
    providerBId: string;
    locationAtoBId: string;
    locationBtoAId: string;
    valueAtoB: number;
    valueBtoA: number;
  }) {
    const netValueChangeA = data.valueBtoA - data.valueAtoB;
    const netValueChangeB = data.valueAtoB - data.valueBtoA;

    const result = await this.query(
      `INSERT INTO swap_recommendations
       (provider_a_id, provider_b_id, location_a_to_b_id, location_b_to_a_id, value_a_to_b_monthly, value_b_to_a_monthly, net_value_change_a, net_value_change_b)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [data.providerAId, data.providerBId, data.locationAtoBId, data.locationBtoAId, data.valueAtoB, data.valueBtoA, netValueChangeA, netValueChangeB]
    );
    return result.rows[0];
  }

  async getLocationValue(locationId: string): Promise<number> {
    // In a real implementation, this would fetch subscription data from Stripe
    // and calculate the monthly value.
    // For now, we'll use a mock value.
    // An example of how it might work:
    /*
    const location = await this.getLocationById(locationId);
    if (!location) return 0;
    const user = await this.getUserById(location.user_id);
    if (!user?.stripe_customer_id) return 0;

    const stripe = await getUncachableStripeClient();
    const subscriptions = await stripe.subscriptions.list({ customer: user.stripe_customer_id, status: 'active' });
    const relevantSub = subscriptions.data.find(s => s.metadata?.locationId === locationId);
    if (!relevantSub || !relevantSub.items.data[0]?.price) return 0;

    const price = relevantSub.items.data[0].price;
    const amount = price.unit_amount || 0;
    // Adjust for interval if not monthly
    if (price.recurring?.interval === 'year') {
      return (amount / 12) / 100;
    }
    return amount / 100;
    */
    const mockValues = [25, 30, 35, 40, 50];
    return mockValues[Math.floor(Math.random() * mockValues.length)];
  }

  async getDriversForProvider(providerId: string): Promise<DbDriverProfile[]> {
    const result = await this.query(
      `SELECT * FROM driver_profiles WHERE provider_id = $1 AND status = 'active'`,
      [providerId]
    );
    return result.rows;
  }


  // ── Driver Custom Zones ──

  async getDriversForZones(zoneIds: string[]): Promise<{ optimoroute_driver_id: string }[]> {
    if (zoneIds.length === 0) return [];
    const result = await this.query(
      `SELECT dp.optimoroute_driver_id
       FROM driver_profiles dp
       JOIN driver_custom_zones dcz ON dp.id = dcz.driver_id
       WHERE dcz.id = ANY($1::uuid[]) AND dp.optimoroute_driver_id IS NOT NULL`,
      [zoneIds]
    );
    return result.rows;
  }

  async getLocationsForZones(zoneIds: string[]): Promise<DbLocation[]> {
    if (zoneIds.length === 0) return [];
    const result = await this.query(
      'SELECT * FROM locations WHERE zone_id = ANY($1::uuid[])',
      [zoneIds]
    );
    return result.rows;
  }

  async getDriverCustomZones(driverId: string) {
    const result = await this.query(
      `SELECT * FROM driver_custom_zones WHERE driver_id = $1 ORDER BY created_at DESC`,
      [driverId]
    );
    return result.rows;
  }

  async createDriverCustomZone(driverId: string, data: {
    name: string;
    zone_type?: string;
    center_lat?: number;
    center_lng?: number;
    radius_miles?: number;
    polygon_coords?: [number, number][];
    zip_codes?: string[];
    color?: string;
    status?: string;
    pickup_day?: string;
  }) {
    const zoneType = data.zone_type || 'circle';
    const status = data.status || 'active';
    const result = await this.query(
      `INSERT INTO driver_custom_zones (driver_id, name, zone_type, center_lat, center_lng, radius_miles, polygon_coords, zip_codes, color, status, pickup_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        driverId, data.name, zoneType,
        data.center_lat ?? null, data.center_lng ?? null, data.radius_miles ?? null,
        data.polygon_coords ? JSON.stringify(data.polygon_coords) : null,
        data.zip_codes ?? null,
        data.color || '#3B82F6',
        status,
        data.pickup_day ?? null,
      ]
    );
    return result.rows[0];
  }

  async updateDriverCustomZone(id: string, driverId: string, data: Partial<{ name: string; center_lat: number; center_lng: number; radius_miles: number; polygon_coords: [number, number][]; color: string; status: string; pickup_day: string }>) {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        sets.push(`${key} = $${idx}`);
        params.push(key === 'polygon_coords' ? JSON.stringify(val) : val);
        idx++;
      }
    }
    if (sets.length === 0) return null;
    sets.push(`updated_at = NOW()`);
    params.push(id, driverId);
    const result = await this.query(
      `UPDATE driver_custom_zones SET ${sets.join(', ')} WHERE id = $${idx} AND driver_id = $${idx + 1} RETURNING *`,
      params
    );
    return result.rows[0] || null;
  }

  async deleteDriverCustomZone(id: string, driverId: string) {
    const result = await this.query(
      `DELETE FROM driver_custom_zones WHERE id = $1 AND driver_id = $2 RETURNING id`,
      [id, driverId]
    );
    return result.rowCount! > 0;
  }

  // In-memory cache for ZIP code boundary lookups
  private zipBoundaryCache = new Map<string, [number, number][]>();

  async getZipBoundary(zip: string): Promise<[number, number][] | null> {
    const zip5 = zip.substring(0, 5);
    if (this.zipBoundaryCache.has(zip5)) return this.zipBoundaryCache.get(zip5)!;

    try {
      const url = `https://public.opendatasoft.com/api/records/1.0/search/?dataset=georef-united-states-of-america-zcta5&q=${zip5}&refine.zip_code=${zip5}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.records?.length > 0) {
        const geoShape = data.records[0].fields.geo_shape;
        if (!geoShape?.coordinates) return null;
        // Handle both Polygon and MultiPolygon types
        const geoCoords = geoShape.type === 'MultiPolygon'
          ? geoShape.coordinates[0][0] // use first polygon of multi
          : geoShape.coordinates[0];
        // Convert GeoJSON [lng, lat] to [lat, lng] for Leaflet
        const coords: [number, number][] = geoCoords.map((c: number[]) => [c[1], c[0]]);
        this.zipBoundaryCache.set(zip5, coords);
        return coords;
      }
    } catch (err) {
      console.error('ZIP boundary fetch failed:', err);
    }
    return null;
  }

  async getAllDriverCustomZones() {
    const result = await this.query(
      `SELECT dcz.*, dp.name AS driver_name, dp.rating AS driver_rating, u.email AS driver_email
       FROM driver_custom_zones dcz
       JOIN driver_profiles dp ON dcz.driver_id = dp.id
       LEFT JOIN users u ON dp.user_id = u.id
       ORDER BY CASE WHEN dcz.status = 'pending_approval' THEN 0 ELSE 1 END, dp.name, dcz.name`
    );
    return result.rows;
  }

  async adminDeleteZone(zoneId: string) {
    // Clear zone assignment from locations before deleting to avoid orphaned references
    await this.query(`UPDATE locations SET zone_id = NULL WHERE zone_id = $1`, [zoneId]);
    const result = await this.query(
      `DELETE FROM driver_custom_zones WHERE id = $1 RETURNING id`,
      [zoneId]
    );
    return result.rowCount! > 0;
  }

  async adminUpdateZone(zoneId: string, data: Partial<{ pickup_day: string | null }>) {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        sets.push(`${key} = $${idx}`);
        params.push(val);
        idx++;
      }
    }
    if (sets.length === 0) return null;
    sets.push(`updated_at = NOW()`);
    params.push(zoneId);
    const result = await this.query(
      `UPDATE driver_custom_zones SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return result.rows[0] || null;
  }
  /**
   * Find all active driver zones that contain a given point.
   * This method is now a lightweight wrapper around the ZoneService.
   */
  async findActiveZonesContainingPoint(lat: number, lng: number): Promise<Array<{
    id: string;
    name: string;
    driver_id: string;
    pickup_day: string | null;
    zone_type: string;
  }>> {
    const zones = await zoneService.findZonesForLocation(lat, lng);
    // The original function returned a subset of fields, so we map the result
    // to maintain the same public interface for the consumers of this storage method.
    return zones.map(z => ({
      id: z.id,
      name: z.name,
      driver_id: z.driver_id,
      pickup_day: z.pickup_day || null,
      zone_type: z.zone_type,
    }));
  }

  async findActiveTerritoriesContainingPoint(lat: number, lng: number): Promise<any[]> {
    const result = await this.query(`
        SELECT pt.*, p.name as provider_name
        FROM provider_territories pt
        JOIN providers p ON pt.provider_id = p.id
        WHERE pt.status = 'active'
    `);

    const activeTerritories = result.rows;
    const pt = point([lng, lat]);
    const containingTerritories = [];

    for (const territory of activeTerritories) {
        if (territory.zone_type === 'polygon' && territory.polygon_coords) {
            const ring = territory.polygon_coords.map((c: [number, number]) => [c[1], c[0]]);
            ring.push(ring[0]);
            const poly = turfPolygon([ring]);
            if (booleanPointInPolygon(pt, poly)) {
                containingTerritories.push(territory);
            }
        }
    }
    return containingTerritories;
  }


  async getUnassignedLocationsWithCoords(): Promise<Array<{
    id: string;
    address: string;
    latitude: number;
    longitude: number;
    service_status: string;
  }>> {
    const result = await this.query(
      `SELECT id, address, latitude, longitude, service_status
       FROM locations
       WHERE coverage_zone_id IS NULL
         AND latitude IS NOT NULL AND longitude IS NOT NULL
         AND service_status IN ('approved', 'pending_review')
       ORDER BY created_at ASC`
    );
    return result.rows;
  }

  // ── Zone Approval ──

  async getPendingApprovalZones() {
    const result = await this.query(
      `SELECT dcz.*, dp.name AS driver_name, dp.rating AS driver_rating, u.email AS driver_email
       FROM driver_custom_zones dcz
       JOIN driver_profiles dp ON dcz.driver_id = dp.id
       LEFT JOIN users u ON dp.user_id = u.id
       WHERE dcz.status = 'pending_approval'
       ORDER BY dcz.created_at ASC`
    );
    return result.rows;
  }

  async updateZoneStatus(zoneId: string, status: string) {
    const result = await this.query(
      `UPDATE driver_custom_zones SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, zoneId]
    );
    return result.rows[0] || null;
  }

  async getZoneById(zoneId: string) {
    const result = await this.query(
      `SELECT dcz.*, dp.name AS driver_name
       FROM driver_custom_zones dcz
       JOIN driver_profiles dp ON dcz.driver_id = dp.id
       WHERE dcz.id = $1`,
      [zoneId]
    );
    return result.rows[0] || null;
  }

  // ── Waitlist Auto-Flagging ──

  /**
   * Find all waitlisted locations that fall within a specific zone's geometry.
   * Uses Haversine / Turf.js spatial logic for zone geometry matching.
   */
  async getWaitlistedLocationsInZone(zone: {
    id: string;
    zone_type: string;
    center_lat?: number;
    center_lng?: number;
    radius_miles?: number;
    polygon_coords?: [number, number][];
  }): Promise<{ id: string; address: string; customer_name: string }[]> {
    if (zone.zone_type === 'circle' && zone.center_lat != null && zone.center_lng != null && zone.radius_miles != null) {
      // Haversine circle matching for waitlisted locations
      const result = await this.query(
        `SELECT p.id, p.address,
                u.first_name || ' ' || u.last_name AS customer_name
         FROM locations p
         JOIN users u ON p.user_id = u.id
         WHERE p.service_status = 'waitlist'
           AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
           AND (3958.8 * 2 * ASIN(SQRT(
             POWER(SIN(RADIANS(CAST(p.latitude AS float) - $1) / 2), 2) +
             COS(RADIANS($1)) * COS(RADIANS(CAST(p.latitude AS float))) *
             POWER(SIN(RADIANS(CAST(p.longitude AS float) - $2) / 2), 2)
           ))) <= $3`,
        [zone.center_lat, zone.center_lng, zone.radius_miles]
      );
      return result.rows;
    }

    if ((zone.zone_type === 'polygon' || zone.zone_type === 'zip') && zone.polygon_coords && zone.polygon_coords.length >= 3) {
      // Turf.js polygon matching for waitlisted locations
      const allWaitlisted = await this.query(
        `SELECT p.id, p.address, p.latitude, p.longitude,
                u.first_name || ' ' || u.last_name AS customer_name
         FROM locations p
         JOIN users u ON p.user_id = u.id
         WHERE p.service_status = 'waitlist'
           AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL`
      );

      const coords = zone.polygon_coords;
      const ring = coords.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
      ring.push(ring[0]); // close the ring
      const poly = turfPolygon([ring]);

      return allWaitlisted.rows.filter((loc: any) => {
        const pt = point([Number(loc.longitude), Number(loc.latitude)]);
        return booleanPointInPolygon(pt, poly);
      }).map((loc: any) => ({ id: loc.id, address: loc.address, customer_name: loc.customer_name }));
    }

    return [];
  }

  /**
   * Flag waitlisted locations as having driver coverage.
   */
  async flagWaitlistedLocations(locationIds: string[], zoneId: string) {
    if (locationIds.length === 0) return 0;
    const result = await this.query(
      `UPDATE locations
       SET coverage_flagged_at = NOW(), coverage_flagged_by_zone = $1
       WHERE id = ANY($2) AND service_status = 'waitlist'`,
      [zoneId, locationIds]
    );
    return result.rowCount || 0;
  }

  // ── Zone Assignment Requests ──

  async createZoneAssignmentRequest(locationId: string, zoneId: string, driverId: string, requestedBy: string, deadlineHours: number) {
    const result = await this.query(
      `INSERT INTO zone_assignment_requests (location_id, zone_id, driver_id, requested_by, deadline)
       VALUES ($1, $2, $3, $4, NOW() + ($5 || ' hours')::interval)
       RETURNING *`,
      [locationId, zoneId, driverId, requestedBy, String(deadlineHours)]
    );
    return result.rows[0];
  }

  async getZoneAssignmentRequests(opts?: { status?: string; zoneId?: string; locationId?: string }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (opts?.status) { conditions.push(`zar.status = $${idx++}`); params.push(opts.status); }
    if (opts?.zoneId) { conditions.push(`zar.zone_id = $${idx++}`); params.push(opts.zoneId); }
    if (opts?.locationId) { conditions.push(`zar.location_id = $${idx++}`); params.push(opts.locationId); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.query(
      `SELECT zar.*, l.address AS location_address, dcz.name AS zone_name,
              dp.name AS driver_name, u.first_name || ' ' || u.last_name AS requested_by_name
       FROM zone_assignment_requests zar
       JOIN locations l ON zar.location_id = l.id
       JOIN driver_custom_zones dcz ON zar.zone_id = dcz.id
       JOIN driver_profiles dp ON zar.driver_id = dp.id
       JOIN users u ON zar.requested_by = u.id
       ${where}
       ORDER BY zar.created_at DESC`,
      params
    );
    return result.rows;
  }

  async getPendingAssignmentRequestsForDriver(driverId: string) {
    const result = await this.query(
      `SELECT zar.*, l.address AS location_address, dcz.name AS zone_name,
              u.first_name || ' ' || u.last_name AS requested_by_name
       FROM zone_assignment_requests zar
       JOIN locations l ON zar.location_id = l.id
       JOIN driver_custom_zones dcz ON zar.zone_id = dcz.id
       JOIN users u ON zar.requested_by = u.id
       WHERE zar.driver_id = $1 AND zar.status = 'pending'
       ORDER BY zar.deadline ASC`,
      [driverId]
    );
    return result.rows;
  }

  async respondToZoneAssignmentRequest(requestId: string, driverId: string, decision: 'approved' | 'denied', notes?: string) {
    const result = await this.query(
      `UPDATE zone_assignment_requests
       SET status = $1, response_notes = $2, responded_at = NOW()
       WHERE id = $3 AND driver_id = $4 AND status = 'pending'
       RETURNING *`,
      [decision, notes || null, requestId, driverId]
    );
    const request = result.rows[0];
    if (!request) return null;
    // On approval, assign location to zone
    if (decision === 'approved') {
      await this.query(
        `UPDATE locations SET coverage_zone_id = $1, updated_at = NOW() WHERE id = $2`,
        [request.zone_id, request.location_id]
      );
    }
    return request;
  }

  async cancelZoneAssignmentRequest(requestId: string) {
    const result = await this.query(
      `UPDATE zone_assignment_requests SET status = 'cancelled'
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [requestId]
    );
    return result.rows[0] || null;
  }

  async expireStaleZoneAssignmentRequests() {
    const result = await this.query(
      `UPDATE zone_assignment_requests SET status = 'expired'
       WHERE status = 'pending' AND deadline < NOW()
       RETURNING id`
    );
    return result.rowCount || 0;
  }

  async getLocationsGroupedByZone(opts?: {
    search?: string; status?: string; collectionDay?: string;
    page?: number; limit?: number;
  }) {
    const page = opts?.page || 1;
    const limit = opts?.limit || 200;
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (opts?.search) {
      conditions.push(`(l.address ILIKE $${idx} OR u.first_name || ' ' || u.last_name ILIKE $${idx})`);
      params.push(`%${opts.search}%`); idx++;
    }
    if (opts?.status) { conditions.push(`l.service_status = $${idx}`); params.push(opts.status); idx++; }
    if (opts?.collectionDay) { conditions.push(`l.collection_day = $${idx}`); params.push(opts.collectionDay); idx++; }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await this.query(
      `SELECT COUNT(*) as count FROM locations l LEFT JOIN users u ON l.user_id = u.id ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count, 10);
    const result = await this.query(
      `SELECT l.id, l.address, l.service_status, l.collection_day, l.collection_frequency,
              l.latitude, l.longitude, l.coverage_zone_id, l.collection_day_source, l.created_at,
              u.first_name || ' ' || u.last_name AS owner_name, u.email AS owner_email,
              dcz.name AS zone_name, dcz.color AS zone_color, dcz.status AS zone_status,
              dcz.pickup_day AS zone_pickup_day, dcz.driver_id AS zone_driver_id,
              dp.name AS zone_driver_name
       FROM locations l
       LEFT JOIN users u ON l.user_id = u.id
       LEFT JOIN driver_custom_zones dcz ON l.coverage_zone_id = dcz.id
       LEFT JOIN driver_profiles dp ON dcz.driver_id = dp.id
       ${where}
       ORDER BY dcz.name NULLS FIRST, l.address ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );
    return { rows: result.rows, total };
  }


  async getRoutesInDriverCoverage(driverId: string, filters?: { startDate?: string; endDate?: string }): Promise<any[]> {
    const zonesResult = await this.query(
      `SELECT center_lat, center_lng, radius_miles, zone_type, polygon_coords
       FROM driver_custom_zones WHERE driver_id = $1 AND status = 'active'`,
      [driverId]
    );
    const zones = zonesResult.rows;
    if (zones.length === 0) return [];

    const circleZones = zones.filter((z: any) => z.center_lat != null && z.radius_miles != null);
    const polyZones = zones.filter((z: any) => (z.zone_type === 'polygon' || z.zone_type === 'zip') && z.polygon_coords);

    const conditions: string[] = [`r.status IN ('open', 'bidding')`];
    const params: any[] = [];
    let idx = 1;

    if (filters?.startDate) {
      conditions.push(`r.scheduled_date >= $${idx}`); params.push(filters.startDate); idx++;
    }
    if (filters?.endDate) {
      conditions.push(`r.scheduled_date <= $${idx}`); params.push(filters.endDate); idx++;
    }

    // Build circle zone SQL clauses
    const zoneClauses: string[] = [];
    for (const zone of circleZones) {
      const lat = Number(zone.center_lat);
      const lng = Number(zone.center_lng);
      const radiusMiles = Number(zone.radius_miles);
      const latDeg = radiusMiles / 69.0;
      const lngDeg = radiusMiles / (69.0 * Math.cos(lat * Math.PI / 180));

      zoneClauses.push(`(
        CAST(p.latitude AS float) BETWEEN $${idx} AND $${idx + 1}
        AND CAST(p.longitude AS float) BETWEEN $${idx + 2} AND $${idx + 3}
        AND (
          3958.8 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS(CAST(p.latitude AS float) - $${idx + 4}) / 2), 2) +
            COS(RADIANS($${idx + 4})) * COS(RADIANS(CAST(p.latitude AS float))) *
            POWER(SIN(RADIANS(CAST(p.longitude AS float) - $${idx + 5}) / 2), 2)
          )) <= $${idx + 6}
        )
      )`);
      params.push(lat - latDeg, lat + latDeg, lng - lngDeg, lng + lngDeg, lat, lng, radiusMiles);
      idx += 7;
    }

    // If we have circle zones, use SQL-based matching
    if (zoneClauses.length > 0) {
      conditions.push(`EXISTS (
        SELECT 1 FROM route_orders rs
        JOIN locations p ON rs.location_id = p.id
        WHERE rs.route_id = r.id
          AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
          AND (${zoneClauses.join(' OR ')})
      )`);
    }

    let circleMatchedRoutes: any[] = [];
    if (zoneClauses.length > 0) {
      const sql = `
        SELECT DISTINCT r.*
        FROM routes r
        WHERE ${conditions.join(' AND ')}
        ORDER BY r.scheduled_date ASC, r.start_time ASC
      `;
      const result = await this.query(sql, params);
      circleMatchedRoutes = result.rows;
    }

    // If no polygon zones, return circle results
    if (polyZones.length === 0) return circleMatchedRoutes;

    // Polygon zone matching: fetch routes with stops, check via Turf.js
    const dateConditions: string[] = [`r.status IN ('open', 'bidding')`];
    const dateParams: any[] = [];
    let dIdx = 1;
    if (filters?.startDate) {
      dateConditions.push(`r.scheduled_date >= $${dIdx}`); dateParams.push(filters.startDate); dIdx++;
    }
    if (filters?.endDate) {
      dateConditions.push(`r.scheduled_date <= $${dIdx}`); dateParams.push(filters.endDate); dIdx++;
    }

    const routeStopsResult = await this.query(
      `SELECT DISTINCT r.*, p.latitude AS stop_lat, p.longitude AS stop_lng
       FROM routes r
       JOIN route_orders rs ON rs.route_id = r.id
       JOIN locations p ON rs.location_id = p.id
       WHERE ${dateConditions.join(' AND ')}
         AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL`,
      dateParams
    );

    const circleRouteIds = new Set(circleMatchedRoutes.map((r: any) => r.id));
    const polyMatchedRouteIds = new Set<string>();

    for (const row of routeStopsResult.rows) {
      if (circleRouteIds.has(row.id) || polyMatchedRouteIds.has(row.id)) continue;
      const pt = point([Number(row.stop_lng), Number(row.stop_lat)]);
      for (const zone of polyZones) {
        const coords: [number, number][] = zone.polygon_coords;
        if (!coords || coords.length < 3) continue;
        const ring = coords.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
        ring.push(ring[0]);
        const poly = turfPolygon([ring]);
        if (booleanPointInPolygon(pt, poly)) {
          polyMatchedRouteIds.add(row.id);
          break;
        }
      }
    }

    // Get full route objects for polygon-matched routes
    if (polyMatchedRouteIds.size === 0) return circleMatchedRoutes;

    const polyRouteIds = Array.from(polyMatchedRouteIds);
    const placeholders = polyRouteIds.map((_, i) => `$${i + 1}`).join(',');
    const polyRoutesResult = await this.query(
      `SELECT * FROM routes WHERE id IN (${placeholders}) ORDER BY scheduled_date ASC, start_time ASC`,
      polyRouteIds
    );

    // Merge and deduplicate
    const merged = new Map<string, any>();
    for (const r of [...circleMatchedRoutes, ...polyRoutesResult.rows]) {
      if (!merged.has(r.id)) merged.set(r.id, r);
    }
    return Array.from(merged.values()).sort((a, b) =>
      (a.scheduled_date + (a.start_time || '')).localeCompare(b.scheduled_date + (b.start_time || ''))
    );
  }

  // ── Route Orders ──

  async addRouteOrders(routeId: string, orders: Array<{ location_id?: string | null; order_type?: string; on_demand_request_id?: string; address?: string; location_name?: string; optimo_order_no?: string; order_number?: number; scheduled_at?: string }>) {
    if (orders.length === 0) return [];
    const values: any[] = [];
    const placeholders: string[] = [];
    let idx = 1;
    for (const s of orders) {
      placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      values.push(routeId, s.location_id ?? null, s.order_type ?? 'recurring', s.on_demand_request_id ?? null, s.address ?? null, s.location_name ?? null, s.optimo_order_no ?? null, s.order_number ?? null, s.scheduled_at ?? null);
    }
    const result = await this.query(
      `INSERT INTO route_orders (route_id, location_id, order_type, on_demand_request_id, address, location_name, optimo_order_no, order_number, scheduled_at)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT DO NOTHING
       RETURNING *`,
      values
    );
    return result.rows;
  }

  async getRouteOrders(routeId: string) {
    const result = await this.query(
      `SELECT rs.*, COALESCE(rs.address, p.address) AS address, p.service_type,
              p.latitude, p.longitude,
              CASE WHEN u.id IS NOT NULL THEN u.first_name || ' ' || u.last_name ELSE rs.location_name END AS customer_name
       FROM route_orders rs
       LEFT JOIN locations p ON rs.location_id = p.id
       LEFT JOIN users u ON p.user_id = u.id
       WHERE rs.route_id = $1
       ORDER BY rs.order_number NULLS LAST, rs.created_at`,
      [routeId]
    );
    return result.rows;
  }

  async removeRouteOrder(orderId: string) {
    await this.query('DELETE FROM route_orders WHERE id = $1', [orderId]);
  }

  async updateRouteOrder(orderId: string, data: Partial<{ optimo_order_no: string; order_number: number; status: string; scheduled_at: string; duration: number; notes: string; location_name: string; pod_data: string }>) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) { fields.push(`${key} = $${idx++}`); values.push(val); }
    }
    if (fields.length === 0) return null;
    values.push(orderId);
    const result = await this.query(
      `UPDATE route_orders SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async getNextRouteOrderForLocation(locationId: string, afterDate: string): Promise<{ route_id: string; scheduled_date: string; route_title: string } | null> {
    const result = await this.query(
      `SELECT rs.id, rs.route_id, r.scheduled_date, r.title AS route_title
       FROM route_orders rs
       JOIN routes r ON rs.route_id = r.id
       WHERE rs.location_id = $1
         AND r.scheduled_date >= $2
         AND rs.status NOT IN ('cancelled', 'skipped')
         AND r.status NOT IN ('cancelled')
       ORDER BY r.scheduled_date ASC
       LIMIT 1`,
      [locationId, afterDate]
    );
    return result.rows[0] || null;
  }

  async skipRouteOrderForLocation(locationId: string, collectionDate: string): Promise<void> {
    await this.query(
      `UPDATE route_orders rs SET status = 'skipped'
       FROM routes r
       WHERE rs.route_id = r.id
         AND rs.location_id = $1
         AND r.scheduled_date = $2
         AND rs.status NOT IN ('cancelled', 'skipped')`,
      [locationId, collectionDate]
    );
  }

  async cancelFutureOrdersForLocation(locationId: string, afterDate?: string): Promise<number> {
    const dateFilter = afterDate ? `AND r.scheduled_date >= $2` : '';
    const params: any[] = [locationId];
    if (afterDate) params.push(afterDate);

    // Find affected routes before cancelling (for recalculation)
    const affectedRoutes = await this.query(
      `SELECT DISTINCT rs.route_id FROM route_orders rs
       JOIN routes r ON rs.route_id = r.id
       WHERE rs.location_id = $1
         AND rs.status NOT IN ('completed', 'failed', 'skipped', 'cancelled')
         ${dateFilter}`,
      params
    );

    const result = await this.query(
      `UPDATE route_orders rs SET status = 'cancelled'
       FROM routes r
       WHERE rs.route_id = r.id
         AND rs.location_id = $1
         AND rs.status NOT IN ('completed', 'failed', 'skipped', 'cancelled')
         ${dateFilter}`,
      params
    );
    const cancelledCount = result.rowCount ?? 0;

    // Recalculate computed_value for affected routes
    if (cancelledCount > 0 && affectedRoutes.rows.length > 0) {
      try {
        const { recalculateRouteValue } = await import('./compensationEngine');
        for (const row of affectedRoutes.rows) {
          await recalculateRouteValue(row.route_id);
        }
      } catch (err) {
        console.error('[cancelFutureOrdersForLocation] Error recalculating route values:', err);
      }
    }

    return cancelledCount;
  }

  async bulkUpdateRouteOrders(routeId: string, updates: Array<{ order_id: string; order_number?: number; scheduled_at?: string; status?: string }>) {
    for (const u of updates) {
      const data: Record<string, any> = {};
      if (u.order_number !== undefined) data.order_number = u.order_number;
      if (u.scheduled_at !== undefined) data.scheduled_at = u.scheduled_at;
      if (u.status !== undefined) data.status = u.status;
      await this.updateRouteOrder(u.order_id, data);
    }
  }

  async getRouteOrdersByOrderNos(orderNos: string[]) {
    if (orderNos.length === 0) return [];
    const placeholders = orderNos.map((_, i) => `$${i + 1}`).join(', ');
    const result = await this.query(
      `SELECT rs.*, COALESCE(rs.address, p.address) AS address, p.service_type,
              CASE WHEN u.id IS NOT NULL THEN u.first_name || ' ' || u.last_name ELSE rs.location_name END AS customer_name
       FROM route_orders rs
       LEFT JOIN locations p ON rs.location_id = p.id
       LEFT JOIN users u ON p.user_id = u.id
       WHERE rs.optimo_order_no IN (${placeholders})`,
      orderNos
    );
    return result.rows;
  }

  // ── Planning Queries ──

  async getLocationsDueOnDate(date: string) {
    const dayOfWeek = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const result = await this.query(
      `SELECT p.*, u.first_name || ' ' || u.last_name AS customer_name, u.email AS customer_email
       FROM locations p
       JOIN users u ON p.user_id = u.id
       WHERE p.service_status = 'approved'
         AND p.collection_day = $1
       ORDER BY p.address`,
      [dayOfWeek]
    );
    // Filter by collection_frequency (bi-weekly/monthly use anchor-based alignment)
    const { isLocationDueOnDate } = await import('./autoAssignmentEngine');
    return result.rows.filter((loc: any) => {
      const freq = loc.collection_frequency || 'weekly';
      if (freq === 'weekly') return true;
      const anchor = loc.collection_start_date
        ? (typeof loc.collection_start_date === 'string' ? loc.collection_start_date.split('T')[0] : new Date(loc.collection_start_date).toISOString().split('T')[0])
        : null;
      return isLocationDueOnDate(freq, anchor, date, loc.collection_day);
    });
  }

  async getPlanningCalendarData(fromDate: string, toDate: string) {
    // Get existing routes grouped by date
    const routesResult = await this.query(
      `SELECT r.scheduled_date, r.status, r.route_type,
              COUNT(*)::int AS route_count
       FROM routes r
       WHERE r.scheduled_date >= $1 AND r.scheduled_date <= $2
       GROUP BY r.scheduled_date, r.status, r.route_type
       ORDER BY r.scheduled_date`,
      [fromDate, toDate]
    );

    // Get pending on-demand requests
    const onDemandResult = await this.query(
      `SELECT spr.requested_date, COUNT(*)::int AS on_demand_count
       FROM on_demand_requests spr
       WHERE spr.requested_date >= $1 AND spr.requested_date <= $2
         AND spr.status IN ('pending', 'scheduled')
       GROUP BY spr.requested_date`,
      [fromDate, toDate]
    );

    // Get location counts per actual date (respecting bi-weekly/monthly frequency)
    const locationsResult = await this.query(
      `SELECT p.collection_day, p.collection_frequency, p.collection_start_date
       FROM locations p
       WHERE p.service_status = 'approved' AND p.collection_day IS NOT NULL`
    );
    const { isLocationDueOnDate } = await import('./autoAssignmentEngine');
    const DAY_NAME_MAP: Record<number, string> = {
      0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
      4: 'thursday', 5: 'friday', 6: 'saturday',
    };
    // Build per-date counts
    const locationCountsByDate: Record<string, number> = {};
    const from = new Date(fromDate + 'T12:00:00');
    const to = new Date(toDate + 'T12:00:00');
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayName = DAY_NAME_MAP[d.getDay()];
      let count = 0;
      for (const loc of locationsResult.rows) {
        if (loc.collection_day !== dayName) continue;
        const freq = loc.collection_frequency || 'weekly';
        if (freq === 'weekly') { count++; continue; }
        const anchor = loc.collection_start_date
          ? (typeof loc.collection_start_date === 'string' ? loc.collection_start_date.split('T')[0] : new Date(loc.collection_start_date).toISOString().split('T')[0])
          : null;
        if (isLocationDueOnDate(freq, anchor, dateStr, loc.collection_day)) count++;
      }
      if (count > 0) locationCountsByDate[dateStr] = count;
    }

    return {
      routes: routesResult.rows,
      onDemand: onDemandResult.rows,
      locationCountsByDate,
    };
  }

  async getOnDemandRequestsForDate(date: string) {
    const result = await this.query(
      `SELECT spr.*, p.address, u.first_name || ' ' || u.last_name AS customer_name
       FROM on_demand_requests spr
       JOIN locations p ON spr.location_id = p.id
       JOIN users u ON spr.user_id = u.id
        WHERE spr.requested_date = $1 AND spr.status IN ('pending', 'scheduled')
         AND NOT EXISTS (
           SELECT 1
           FROM route_orders rs
           JOIN routes r ON r.id = rs.route_id
           WHERE rs.on_demand_request_id = spr.id
             AND COALESCE(r.status, '') != 'cancelled'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM routes r2
           WHERE r2.on_demand_request_id = spr.id
             AND COALESCE(r2.status, '') != 'cancelled'
         )
       ORDER BY spr.service_price DESC`,
      [date]
    );
    return result.rows;
  }
  // ── Route Management Queries ──

  async getExistingRouteDates(startDate: string, endDate: string): Promise<string[]> {
    const result = await this.query(
      `SELECT DISTINCT scheduled_date::text
       FROM routes
       WHERE scheduled_date >= $1 AND scheduled_date <= $2
         AND status != 'cancelled'
       ORDER BY scheduled_date`,
      [startDate, endDate]
    );
    return result.rows.map((r: any) => r.scheduled_date.split('T')[0]);
  }

  async markRouteSynced(routeId: string) {
    await this.query(
      `UPDATE routes SET optimo_synced = TRUE, optimo_synced_at = NOW() WHERE id = $1`,
      [routeId]
    );
  }

  async getRouteSyncStatus(routeId: string): Promise<{ synced: boolean; synced_at: string | null }> {
    const result = await this.query(
      `SELECT optimo_synced, optimo_synced_at FROM routes WHERE id = $1`,
      [routeId]
    );
    const row = result.rows[0];
    return { synced: row?.optimo_synced ?? false, synced_at: row?.optimo_synced_at ?? null };
  }

  async getRouteByOptimoKey(key: string) {
    const result = await this.query('SELECT * FROM routes WHERE optimo_route_key = $1', [key]);
    return result.rows[0] || null;
  }

  async getDriverByOptimoSerial(serial: string) {
    const result = await this.query(
      'SELECT * FROM driver_profiles WHERE optimoroute_driver_id = $1',
      [serial]
    );
    return result.rows[0] || null;
  }


  // ── Planner Queries ──

  async getMissingClientsForDate(date: string) {
    const dayOfWeek = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const result = await this.query(
      `SELECT p.id, p.address, p.service_type, p.collection_frequency,
              u.first_name || ' ' || u.last_name AS customer_name
       FROM locations p
       JOIN users u ON p.user_id = u.id
       WHERE p.service_status = 'approved'
         AND p.collection_day = $1
         AND NOT EXISTS (
           SELECT 1 FROM route_orders rs
           JOIN routes r ON rs.route_id = r.id
           WHERE rs.location_id = p.id
             AND r.scheduled_date = $2
             AND r.status != 'cancelled'
         )
       ORDER BY p.address`,
      [dayOfWeek, date]
    );
    return result.rows;
  }

  async getCancelledCollectionsForWeek(fromDate: string, toDate: string) {
    const result = await this.query(
      `SELECT rs.id AS stop_id, rs.route_id, rs.location_id,
              p.address, p.service_status,
              u.first_name || ' ' || u.last_name AS customer_name,
              r.scheduled_date, r.title AS route_title
       FROM route_orders rs
       JOIN routes r ON rs.route_id = r.id
       JOIN locations p ON rs.location_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE r.scheduled_date >= $1 AND r.scheduled_date <= $2
         AND r.status != 'cancelled'
         AND p.service_status != 'approved'
       ORDER BY r.scheduled_date, r.title`,
      [fromDate, toDate]
    );
    return result.rows;
  }

  async copyWeekRoutes(sourceFrom: string, sourceTo: string, targetOffset: number = 7) {
    const sourceRoutes = await this.getAllRoutes({ date_from: sourceFrom, date_to: sourceTo });
    const nonCancelled = sourceRoutes.filter((r: any) => r.status !== 'cancelled');
    const created: any[] = [];

    for (const route of nonCancelled) {
      const srcDate = new Date(route.scheduled_date.split('T')[0] + 'T12:00:00');
      srcDate.setDate(srcDate.getDate() + targetOffset);
      const targetDate = srcDate.toISOString().split('T')[0];

      const newRoute = await this.createRoute({
        title: route.title,
        description: route.description || undefined,
        scheduled_date: targetDate,
        start_time: route.start_time || undefined,
        end_time: route.end_time || undefined,
        estimated_orders: route.estimated_orders ?? undefined,
        estimated_hours: route.estimated_hours ? Number(route.estimated_hours) : undefined,
        base_pay: route.base_pay ? Number(route.base_pay) : undefined,
        notes: route.notes || undefined,
        zone_id: route.zone_id || undefined,
        route_type: route.route_type || 'daily_route',
        source: 'copied',
        status: 'draft',
      });

      // Copy only recurring stops (skip one-time on-demand)
      const sourceStops = await this.getRouteStops(route.id);
      const recurringStops = sourceStops.filter((s: any) => s.order_type !== 'on_demand');
      if (recurringStops.length > 0) {
        await this.addRouteStops(
          newRoute.id,
          recurringStops.map((s: any) => ({ location_id: s.location_id, order_type: s.order_type }))
        );
      }

      created.push(newRoute);
    }
    return created;
  }

  // ── Notifications ──────────────────────────────────────────────
  async createNotification(userId: string, type: string, title: string, body: string, metadata?: Record<string, any>): Promise<DbNotification> {
    const result = await this.query(
      `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, type, title, body, metadata ? JSON.stringify(metadata) : '{}']
    );
    return result.rows[0];
  }

  async getNotificationsForUser(userId: string, limit = 20): Promise<DbNotification[]> {
    const result = await this.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await this.query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = FALSE`,
      [userId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  async markNotificationRead(notificationId: string, userId: string): Promise<void> {
    await this.query(
      `UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2`,
      [notificationId, userId]
    );
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await this.query(
      `UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE`,
      [userId]
    );
  }

  // ── Billing Disputes ──────────────────────────────────────────────

  async createBillingDispute(data: { userId: string; invoiceId: string; invoiceNumber?: string; amount: number; reason: string; details?: string }) {
    const result = await this.query(
      `INSERT INTO billing_disputes (user_id, invoice_id, invoice_number, amount, reason, details) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.userId, data.invoiceId, data.invoiceNumber || null, data.amount, data.reason, data.details || null]
    );
    return result.rows[0];
  }

  async getDisputesForUser(userId: string) {
    const result = await this.query(
      `SELECT * FROM billing_disputes WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  async getDisputeByInvoiceId(invoiceId: string) {
    const result = await this.query(
      `SELECT * FROM billing_disputes WHERE invoice_id = $1 AND status != 'withdrawn' LIMIT 1`,
      [invoiceId]
    );
    return result.rows[0] || null;
  }
}

export const storage = new Storage();

// ── Zone conflict detection (Sprint 3, Task 12) ──────────────────────────────
// Returns IDs of active driver_custom_zones (owned by other drivers) that
// overlap with the proposed zone geometry.
function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function detectZoneConflicts(
  newZone: {
    zone_type: string;
    center_lat?: number | null;
    center_lng?: number | null;
    radius_miles?: number | null;
    polygon_coords?: Array<[number, number]> | null;
  },
  excludeDriverId: string
): Promise<string[]> {
  const { rows: candidates } = await pool.query(
    `SELECT id, zone_type, center_lat, center_lng, radius_miles, polygon_coords
     FROM driver_custom_zones
     WHERE status = 'active' AND driver_id != $1`,
    [excludeDriverId]
  );

  const conflicting: string[] = [];

  for (const z of candidates) {
    let overlaps = false;

    if (newZone.zone_type === 'circle' && newZone.center_lat != null && newZone.center_lng != null && newZone.radius_miles != null) {
      if (z.zone_type === 'circle' && z.center_lat != null && z.center_lng != null && z.radius_miles != null) {
        // Circle–circle: overlap when distance < sum of radii
        const dist = haversineDistanceMiles(newZone.center_lat, newZone.center_lng, Number(z.center_lat), Number(z.center_lng));
        overlaps = dist < (newZone.radius_miles + Number(z.radius_miles));
      } else if (z.polygon_coords) {
        // Circle center inside existing polygon (fast approximation)
        try {
          const coords = Array.isArray(z.polygon_coords) ? z.polygon_coords : JSON.parse(z.polygon_coords);
          const ring = coords.map((c: any) => [Number(c[1] ?? c.lng), Number(c[0] ?? c.lat)]);
          if (ring.length >= 3) {
            if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0]);
            const poly = turfPolygon([ring]);
            const pt = point([newZone.center_lng, newZone.center_lat]);
            overlaps = booleanPointInPolygon(pt, poly);
          }
        } catch { /* ignore malformed geometry */ }
      }
    } else if (newZone.polygon_coords && Array.isArray(newZone.polygon_coords) && newZone.polygon_coords.length >= 3) {
      // Bounding-box pre-check for polygon zones
      const lats = newZone.polygon_coords.map(c => c[0]);
      const lngs = newZone.polygon_coords.map(c => c[1]);
      const newMinLat = Math.min(...lats), newMaxLat = Math.max(...lats);
      const newMinLng = Math.min(...lngs), newMaxLng = Math.max(...lngs);

      if (z.zone_type === 'circle' && z.center_lat != null && z.center_lng != null) {
        // Rough bbox check: existing circle center inside new polygon's bbox
        overlaps = Number(z.center_lat) >= newMinLat && Number(z.center_lat) <= newMaxLat &&
                   Number(z.center_lng) >= newMinLng && Number(z.center_lng) <= newMaxLng;
      } else if (z.polygon_coords) {
        try {
          const coords = Array.isArray(z.polygon_coords) ? z.polygon_coords : JSON.parse(z.polygon_coords);
          const zLats = coords.map((c: any) => Number(c[0] ?? c.lat));
          const zLngs = coords.map((c: any) => Number(c[1] ?? c.lng));
          const zMinLat = Math.min(...zLats), zMaxLat = Math.max(...zLats);
          const zMinLng = Math.min(...zLngs), zMaxLng = Math.max(...zLngs);
          // Bbox intersection check
          overlaps = !(newMaxLat < zMinLat || newMinLat > zMaxLat || newMaxLng < zMinLng || newMinLng > zMaxLng);
        } catch { /* ignore malformed geometry */ }
      }
    }

    if (overlaps) conflicting.push(z.id as string);
  }

  return conflicting;
}
