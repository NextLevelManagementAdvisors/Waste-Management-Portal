import crypto from 'crypto';
import { pool } from './db';
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

  async updateUser(id: string, data: Partial<{ first_name: string; last_name: string; phone: string; email: string; password_hash: string; autopay_enabled: boolean; stripe_customer_id: string; auth_provider: string }>): Promise<DbUser> {
    const ALLOWED_COLUMNS = ['first_name', 'last_name', 'phone', 'email', 'password_hash', 'autopay_enabled', 'stripe_customer_id', 'auth_provider'];
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

  async getPropertiesForUser(userId: string): Promise<DbProperty[]> {
    const result = await this.query(
      'SELECT * FROM properties WHERE user_id = $1 ORDER BY created_at',
      [userId]
    );
    return result.rows;
  }

  async createProperty(data: { userId: string; address: string; serviceType: string; inHoa: boolean; communityName?: string; hasGateCode: boolean; gateCode?: string; notes?: string; notificationPreferences?: any }): Promise<DbProperty> {
    const result = await this.query(
      `INSERT INTO properties (user_id, address, service_type, in_hoa, community_name, has_gate_code, gate_code, notes, notification_preferences, service_status, service_status_updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending_review', NOW())
       RETURNING *`,
      [
        data.userId, data.address, data.serviceType, data.inHoa,
        data.communityName || null, data.hasGateCode, data.gateCode || null,
        data.notes || null,
        JSON.stringify(data.notificationPreferences || { pickupReminders: { email: true, sms: false }, scheduleChanges: { email: true, sms: false }, driverUpdates: { email: true, sms: false }, invoiceDue: true, paymentConfirmation: true, autopayReminder: true, serviceUpdates: true, promotions: false, referralUpdates: true })
      ]
    );
    return result.rows[0];
  }

  async getPropertyById(propertyId: string): Promise<DbProperty | null> {
    const result = await this.query('SELECT * FROM properties WHERE id = $1', [propertyId]);
    return result.rows[0] || null;
  }

  async updateProperty(propertyId: string, data: Partial<{ address: string; service_type: string; in_hoa: boolean; community_name: string | null; has_gate_code: boolean; gate_code: string | null; notes: string | null; notification_preferences: any; transfer_status: string | null; pending_owner: any; zone_id: string | null; latitude: number | null; longitude: number | null }>): Promise<DbProperty> {
    const ALLOWED_COLUMNS = ['address', 'service_type', 'in_hoa', 'community_name', 'has_gate_code', 'gate_code', 'notes', 'notification_preferences', 'transfer_status', 'pending_owner', 'pickup_frequency', 'pickup_day', 'pickup_day_detected_at', 'pickup_day_source', 'zone_id', 'latitude', 'longitude'];
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
      `UPDATE properties SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
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

  async createMissedPickupReport(data: { userId: string; propertyId: string; pickupDate: string; notes: string }) {
    const result = await this.query(
      `INSERT INTO missed_pickup_reports (user_id, property_id, pickup_date, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.userId, data.propertyId, data.pickupDate, data.notes]
    );
    return result.rows[0];
  }

  async getMissedPickupReports(userId: string) {
    const result = await this.query(
      'SELECT * FROM missed_pickup_reports WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async createSpecialPickupRequest(data: {
    userId: string; propertyId: string; serviceName: string; servicePrice: number;
    pickupDate: string; notes?: string; photos?: any[]; aiEstimate?: number; aiReasoning?: string;
  }) {
    const result = await this.query(
      `INSERT INTO special_pickup_requests (user_id, property_id, service_name, service_price, pickup_date, notes, photos, ai_estimate, ai_reasoning)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [data.userId, data.propertyId, data.serviceName, data.servicePrice, data.pickupDate,
       data.notes || null, JSON.stringify(data.photos || []), data.aiEstimate || null, data.aiReasoning || null]
    );
    return result.rows[0];
  }

  async updateSpecialPickupRequest(id: string, data: {
    pickupDate?: string; status?: string; cancellationReason?: string;
    adminNotes?: string; assignedDriverId?: string | null; servicePrice?: number;
  }) {
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let idx = 1;
    if (data.pickupDate !== undefined) { sets.push(`pickup_date = $${idx++}`); params.push(data.pickupDate); }
    if (data.status !== undefined) { sets.push(`status = $${idx++}`); params.push(data.status); }
    if (data.cancellationReason !== undefined) { sets.push(`cancellation_reason = $${idx++}`); params.push(data.cancellationReason); }
    if (data.adminNotes !== undefined) { sets.push(`admin_notes = $${idx++}`); params.push(data.adminNotes); }
    if (data.assignedDriverId !== undefined) { sets.push(`assigned_driver_id = $${idx++}`); params.push(data.assignedDriverId); }
    if (data.servicePrice !== undefined) { sets.push(`service_price = $${idx++}`); params.push(data.servicePrice); }
    params.push(id);
    const result = await this.query(
      `UPDATE special_pickup_requests SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return result.rows[0] || null;
  }

  async getSpecialPickupById(id: string) {
    const result = await this.query(
      `SELECT s.*, u.first_name, u.last_name, u.email, u.phone, p.address
       FROM special_pickup_requests s
       JOIN users u ON s.user_id = u.id
       JOIN properties p ON s.property_id = p.id
       WHERE s.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async getSpecialPickupsForDriver(driverProfileId: string) {
    const result = await this.query(
      `SELECT s.*, p.address
       FROM special_pickup_requests s
       JOIN properties p ON s.property_id = p.id
       WHERE s.assigned_driver_id = $1 AND s.status IN ('scheduled', 'pending')
       ORDER BY s.pickup_date ASC`,
      [driverProfileId]
    );
    return result.rows;
  }

  async getSpecialPickupRequests(userId: string) {
    const result = await this.query(
      'SELECT * FROM special_pickup_requests WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async upsertCollectionIntent(data: { userId: string; propertyId: string; intent: string; pickupDate: string; optimoOrderNo?: string }) {
    const result = await this.query(
      `INSERT INTO collection_intents (user_id, property_id, intent, pickup_date, optimo_order_no)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (property_id, pickup_date) DO UPDATE SET intent = $3, optimo_order_no = $5
       RETURNING *`,
      [data.userId, data.propertyId, data.intent, data.pickupDate, data.optimoOrderNo || null]
    );
    return result.rows[0];
  }

  async deleteCollectionIntent(propertyId: string, pickupDate: string) {
    await this.query(
      'DELETE FROM collection_intents WHERE property_id = $1 AND pickup_date = $2',
      [propertyId, pickupDate]
    );
  }

  async getCollectionIntent(propertyId: string, pickupDate: string) {
    const result = await this.query(
      'SELECT * FROM collection_intents WHERE property_id = $1 AND pickup_date = $2',
      [propertyId, pickupDate]
    );
    return result.rows[0] || null;
  }

  async upsertDriverFeedback(data: { userId: string; propertyId: string; pickupDate: string; rating?: number; tipAmount?: number; note?: string }) {
    const result = await this.query(
      `INSERT INTO driver_feedback (user_id, property_id, pickup_date, rating, tip_amount, note)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (property_id, pickup_date) DO UPDATE SET rating = $4, tip_amount = $5, note = $6
       RETURNING *`,
      [data.userId, data.propertyId, data.pickupDate, data.rating || null, data.tipAmount || null, data.note || null]
    );
    return result.rows[0];
  }

  async getDriverFeedback(propertyId: string, pickupDate: string) {
    const result = await this.query(
      'SELECT * FROM driver_feedback WHERE property_id = $1 AND pickup_date = $2',
      [propertyId, pickupDate]
    );
    return result.rows[0] || null;
  }

  async getDriverFeedbackForProperty(propertyId: string) {
    const result = await this.query(
      'SELECT * FROM driver_feedback WHERE property_id = $1 ORDER BY pickup_date DESC',
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
      `UPDATE properties SET transfer_status = 'pending', pending_owner = $1, transfer_token = $2, transfer_token_expires = $3 WHERE id = $4`,
      [JSON.stringify(newOwner), token, expiresAt, propertyId]
    );
  }

  async getPropertyByTransferToken(token: string): Promise<DbProperty | null> {
    const result = await this.query(
      "SELECT * FROM properties WHERE transfer_token = $1 AND transfer_status = 'pending' AND transfer_token_expires > NOW()",
      [token]
    );
    return result.rows[0] || null;
  }

  async completeTransfer(propertyId: string, newUserId: string) {
    await this.query(
      `UPDATE properties SET user_id = $1, transfer_status = NULL, pending_owner = NULL, transfer_token = NULL, transfer_token_expires = NULL WHERE id = $2`,
      [newUserId, propertyId]
    );
  }

  async cancelTransfer(propertyId: string) {
    await this.query(
      `UPDATE properties SET transfer_status = NULL, pending_owner = NULL, transfer_token = NULL, transfer_token_expires = NULL WHERE id = $1`,
      [propertyId]
    );
  }

  async getAllUsers(): Promise<DbUser[]> {
    const result = await this.query(
      `SELECT * FROM users ORDER BY created_at DESC`
    );
    return result.rows;
  }

  async getAllProperties(): Promise<(DbProperty & { user_email?: string; user_name?: string })[]> {
    const result = await this.query(
      `SELECT p.*, u.email as user_email, u.first_name || ' ' || u.last_name as user_name
       FROM properties p LEFT JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC`
    );
    return result.rows;
  }

  async getAdminStats(): Promise<{
    totalUsers: number;
    totalProperties: number;
    recentUsers: number;
    activeTransfers: number;
    totalReferrals: number;
    pendingReferrals: number;
    pendingReviews: number;
  }> {
    const [users, properties, recentUsers, transfers, referrals, pendingRefs, pendingReviews] = await Promise.all([
      this.query('SELECT COUNT(*) as count FROM users'),
      this.query('SELECT COUNT(*) as count FROM properties'),
      this.query(`SELECT COUNT(*) as count FROM users WHERE created_at > NOW() - INTERVAL '30 days'`),
      this.query(`SELECT COUNT(*) as count FROM properties WHERE transfer_status = 'pending'`),
      this.query('SELECT COUNT(*) as count FROM referrals'),
      this.query(`SELECT COUNT(*) as count FROM referrals WHERE status = 'pending'`),
      this.query(`SELECT COUNT(*) as count FROM properties WHERE service_status = 'pending_review'`),
    ]);
    return {
      totalUsers: parseInt(users.rows[0].count),
      totalProperties: parseInt(properties.rows[0].count),
      recentUsers: parseInt(recentUsers.rows[0].count),
      activeTransfers: parseInt(transfers.rows[0].count),
      totalReferrals: parseInt(referrals.rows[0].count),
      pendingReferrals: parseInt(pendingRefs.rows[0].count),
      pendingReviews: parseInt(pendingReviews.rows[0].count),
    };
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

  async getSpecialPickupServices() {
    const result = await this.query(
      'SELECT * FROM special_pickup_services WHERE active = true ORDER BY name'
    );
    return result.rows;
  }

  async getTipDismissal(propertyId: string, pickupDate: string) {
    const result = await this.query(
      'SELECT * FROM tip_dismissals WHERE property_id = $1 AND pickup_date = $2',
      [propertyId, pickupDate]
    );
    return result.rows[0] || null;
  }

  async createTipDismissal(userId: string, propertyId: string, pickupDate: string) {
    await this.query(
      'INSERT INTO tip_dismissals (user_id, property_id, pickup_date) VALUES ($1, $2, $3) ON CONFLICT (property_id, pickup_date) DO NOTHING',
      [userId, propertyId, pickupDate]
    );
  }

  async getTipDismissalsForProperty(propertyId: string) {
    const result = await this.query(
      'SELECT pickup_date FROM tip_dismissals WHERE property_id = $1',
      [propertyId]
    );
    return result.rows.map(r => r.pickup_date);
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

  async getPropertyStats() {
    const result = await this.query(
      `SELECT service_type, COUNT(*) as count FROM properties GROUP BY service_type ORDER BY count DESC`
    );
    return result.rows;
  }

  async getPendingReviewProperties(): Promise<(DbProperty & { first_name: string; last_name: string; email: string; phone: string })[]> {
    const result = await this.query(
      `SELECT p.*, u.first_name, u.last_name, u.email, u.phone
       FROM properties p JOIN users u ON p.user_id = u.id
       WHERE p.service_status = 'pending_review'
       ORDER BY p.created_at ASC`
    );
    return result.rows;
  }

  async getPendingReviewCount(): Promise<number> {
    const result = await this.query(`SELECT COUNT(*) as count FROM properties WHERE service_status = 'pending_review'`);
    return parseInt(result.rows[0].count);
  }

  async updateServiceStatus(propertyId: string, status: string, notes?: string): Promise<DbProperty> {
    const result = await this.query(
      `UPDATE properties SET service_status = $1, service_status_notes = $2, service_status_updated_at = NOW(), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, notes || null, propertyId]
    );
    return result.rows[0];
  }

  // ── Pending Service Selections (deferred billing) ─────────────────

  async savePendingSelections(propertyId: string, userId: string, selections: { serviceId: string; quantity: number; useSticker: boolean }[]): Promise<void> {
    // Delete existing selections for this property, then insert new ones
    await this.query(`DELETE FROM pending_service_selections WHERE property_id = $1`, [propertyId]);
    for (const sel of selections) {
      await this.query(
        `INSERT INTO pending_service_selections (property_id, user_id, service_id, quantity, use_sticker)
         VALUES ($1, $2, $3, $4, $5)`,
        [propertyId, userId, sel.serviceId, sel.quantity, sel.useSticker]
      );
    }
  }

  async getPendingSelections(propertyId: string): Promise<{ id: string; propertyId: string; userId: string; serviceId: string; quantity: number; useSticker: boolean; createdAt: Date }[]> {
    const result = await this.query(
      `SELECT id, property_id, user_id, service_id, quantity, use_sticker, created_at
       FROM pending_service_selections WHERE property_id = $1 ORDER BY created_at`,
      [propertyId]
    );
    return result.rows.map((r: any) => ({
      id: r.id,
      propertyId: r.property_id,
      userId: r.user_id,
      serviceId: r.service_id,
      quantity: r.quantity,
      useSticker: r.use_sticker,
      createdAt: r.created_at,
    }));
  }

  async deletePendingSelections(propertyId: string): Promise<void> {
    await this.query(`DELETE FROM pending_service_selections WHERE property_id = $1`, [propertyId]);
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
      conditions.push(`EXISTS (SELECT 1 FROM properties p WHERE p.user_id = u.id AND p.service_type = $${idx})`);
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
      `SELECT u.*, (SELECT COUNT(*) FROM properties p WHERE p.user_id = u.id) as property_count
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
    const [users, properties] = await Promise.all([
      this.query(
        `SELECT id, first_name, last_name, email, 'user' as type FROM users
         WHERE LOWER(email) LIKE LOWER($1) OR LOWER(first_name || ' ' || last_name) LIKE LOWER($1) LIMIT 10`,
        [searchParam]
      ),
      this.query(
        `SELECT p.id, p.address, p.service_type, u.first_name || ' ' || u.last_name as owner_name, 'property' as type
         FROM properties p JOIN users u ON p.user_id = u.id
         WHERE LOWER(p.address) LIKE LOWER($1) LIMIT 10`,
        [searchParam]
      ),
    ]);
    return { users: users.rows, properties: properties.rows };
  }

  async getMissedPickupReportsAdmin(options: { status?: string; limit?: number; offset?: number }) {
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
       FROM missed_pickup_reports m
       JOIN users u ON m.user_id = u.id
       JOIN properties p ON m.property_id = p.id
       ${where} ORDER BY m.created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    const countResult = await this.query(`SELECT COUNT(*) as count FROM missed_pickup_reports m ${where}`, params.slice(0, -2));
    return { reports: result.rows, total: parseInt(countResult.rows[0].count) };
  }

  async updateMissedPickupStatus(reportId: string, status: string, resolutionNotes?: string) {
    await this.query(
      `UPDATE missed_pickup_reports SET status = $1, resolution_notes = $2, updated_at = NOW() WHERE id = $3`,
      [status, resolutionNotes || null, reportId]
    );
  }

  async getSpecialPickupRequestsAdmin(options: { status?: string; limit?: number; offset?: number }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (options.status) { conditions.push(`s.status = $${idx++}`); params.push(options.status); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);
    const result = await this.query(
      `SELECT s.*, u.first_name, u.last_name, u.email, p.address
       FROM special_pickup_requests s
       JOIN users u ON s.user_id = u.id
       JOIN properties p ON s.property_id = p.id
       ${where} ORDER BY s.created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    const countResult = await this.query(`SELECT COUNT(*) as count FROM special_pickup_requests s ${where}`, params.slice(0, -2));
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
      conditions.push(`EXISTS (SELECT 1 FROM properties p2 WHERE p2.user_id = u.id AND p2.service_type = $${idx})`);
      params.push(options.serviceType);
      idx++;
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.member_since, u.stripe_customer_id,
       EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin') as is_admin,
       u.created_at,
       (SELECT COUNT(*) FROM properties p WHERE p.user_id = u.id) as property_count,
       (SELECT string_agg(p.address, '; ') FROM properties p WHERE p.user_id = u.id) as addresses
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

  async updateDriver(id: string, data: Partial<{ name: string; email: string; phone: string; password_hash: string; status: string; onboarding_status: string; rating: number; total_jobs_completed: number; stripe_connect_account_id: string; stripe_connect_onboarded: boolean; w9_completed: boolean; direct_deposit_completed: boolean; availability: any }>) {
    const ALLOWED_COLUMNS = ['name', 'email', 'phone', 'password_hash', 'status', 'onboarding_status', 'rating', 'total_jobs_completed', 'stripe_connect_account_id', 'stripe_connect_onboarded', 'w9_completed', 'direct_deposit_completed', 'availability'];
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

  async createRouteJob(data: {
    title: string;
    description?: string;
    area?: string;
    scheduled_date: string;
    start_time?: string;
    end_time?: string;
    estimated_stops?: number;
    estimated_hours?: number;
    base_pay?: number;
    notes?: string;
    assigned_driver_id?: string;
    job_type?: string;
    zone_id?: string;
    source?: string;
    special_pickup_id?: string;
    status?: string;
  }) {
    const status = data.status ?? (data.assigned_driver_id ? 'assigned' : 'open');
    const result = await this.query(
      `INSERT INTO route_jobs
         (title, description, area, scheduled_date, start_time, end_time,
          estimated_stops, estimated_hours, base_pay, notes, assigned_driver_id, status,
          job_type, zone_id, source, special_pickup_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        data.title,
        data.description ?? null,
        data.area ?? null,
        data.scheduled_date,
        data.start_time ?? null,
        data.end_time ?? null,
        data.estimated_stops ?? null,
        data.estimated_hours ?? null,
        data.base_pay ?? null,
        data.notes ?? null,
        data.assigned_driver_id ?? null,
        status,
        data.job_type ?? 'daily_route',
        data.zone_id ?? null,
        data.source ?? 'manual',
        data.special_pickup_id ?? null,
      ]
    );
    return result.rows[0];
  }

  async getAllRouteJobs(filters?: { job_type?: string; zone_id?: string; status?: string; date_from?: string; date_to?: string }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (filters?.job_type) { conditions.push(`rj.job_type = $${idx++}`); params.push(filters.job_type); }
    if (filters?.zone_id) { conditions.push(`rj.zone_id = $${idx++}`); params.push(filters.zone_id); }
    if (filters?.status) { conditions.push(`rj.status = $${idx++}`); params.push(filters.status); }
    if (filters?.date_from) { conditions.push(`rj.scheduled_date >= $${idx++}`); params.push(filters.date_from); }
    if (filters?.date_to) { conditions.push(`rj.scheduled_date <= $${idx++}`); params.push(filters.date_to); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.query(
      `SELECT rj.*, d.name AS driver_name, sz.name AS zone_name, sz.color AS zone_color,
              COALESCE(bc.bid_count, 0)::int AS bid_count,
              COALESCE(pc.pickup_count, 0)::int AS pickup_count
       FROM route_jobs rj
       LEFT JOIN driver_profiles d ON rj.assigned_driver_id = d.id
       LEFT JOIN service_zones sz ON rj.zone_id = sz.id
       LEFT JOIN (SELECT job_id, COUNT(*) AS bid_count FROM job_bids GROUP BY job_id) bc ON bc.job_id = rj.id
       LEFT JOIN (SELECT job_id, COUNT(*) AS pickup_count FROM job_pickups GROUP BY job_id) pc ON pc.job_id = rj.id
       ${where}
       ORDER BY rj.scheduled_date DESC, rj.created_at DESC`,
      params
    );
    return result.rows;
  }

  async getOpenJobs(filters?: { startDate?: string; endDate?: string }) {
    const conditions: string[] = [`status IN ('open', 'bidding')`];
    const params: any[] = [];
    let idx = 1;
    if (filters?.startDate) {
      conditions.push(`scheduled_date >= $${idx++}`);
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      conditions.push(`scheduled_date <= $${idx++}`);
      params.push(filters.endDate);
    }
    const result = await this.query(
      `SELECT * FROM route_jobs WHERE ${conditions.join(' AND ')} ORDER BY scheduled_date ASC, start_time ASC`,
      params
    );
    return result.rows;
  }

  async getJobById(jobId: string) {
    const result = await this.query('SELECT * FROM route_jobs WHERE id = $1', [jobId]);
    return result.rows[0] || null;
  }

  async getJobBids(jobId: string) {
    const result = await this.query(
      `SELECT jb.*, d.name as driver_name, d.rating as driver_rating
       FROM job_bids jb
       JOIN driver_profiles d ON jb.driver_id = d.id
       WHERE jb.job_id = $1
       ORDER BY jb.created_at ASC`,
      [jobId]
    );
    return result.rows;
  }

  async createBid(data: { jobId: string; driverId: string; bidAmount: number; message?: string; driverRatingAtBid: number }) {
    const result = await this.query(
      `INSERT INTO job_bids (job_id, driver_id, bid_amount, message, driver_rating_at_bid)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.jobId, data.driverId, data.bidAmount, data.message || null, data.driverRatingAtBid]
    );
    return result.rows[0];
  }

  async deleteBid(jobId: string, driverId: string) {
    await this.query('DELETE FROM job_bids WHERE job_id = $1 AND driver_id = $2', [jobId, driverId]);
  }

  async getBidByJobAndDriver(jobId: string, driverId: string) {
    const result = await this.query(
      'SELECT * FROM job_bids WHERE job_id = $1 AND driver_id = $2',
      [jobId, driverId]
    );
    return result.rows[0] || null;
  }

  async updateJob(jobId: string, data: Partial<{ title: string; description: string; area: string; scheduled_date: string; start_time: string; end_time: string; estimated_stops: number; estimated_hours: number; base_pay: number; status: string; assigned_driver_id: string; notes: string; job_type: string; zone_id: string; source: string; special_pickup_id: string; optimo_planning_id: string; accepted_bid_id: string; actual_pay: number; payment_status: string; completed_at: string }>) {
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
    values.push(jobId);
    const result = await this.query(
      `UPDATE route_jobs SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async getDriverJobs(driverId: string) {
    const result = await this.query(
      `SELECT * FROM route_jobs WHERE assigned_driver_id = $1 ORDER BY scheduled_date DESC, start_time ASC`,
      [driverId]
    );
    return result.rows;
  }

  async getDriverSchedule(driverId: string, start: string, end: string) {
    const result = await this.query(
      `SELECT * FROM route_jobs WHERE assigned_driver_id = $1 AND scheduled_date >= $2 AND scheduled_date <= $3 ORDER BY scheduled_date ASC, start_time ASC`,
      [driverId, start, end]
    );
    return result.rows;
  }

  async getAllBidsPaginated(options: {
    driverId?: string;
    jobStatus?: string;
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
      conditions.push(`jb.driver_id = $${idx++}`);
      params.push(options.driverId);
    }
    if (options.jobStatus && options.jobStatus !== 'all') {
      conditions.push(`rj.status = $${idx++}`);
      params.push(options.jobStatus);
    }
    if (options.search) {
      conditions.push(`(LOWER(rj.title) LIKE LOWER($${idx}) OR LOWER(d.name) LIKE LOWER($${idx}))`);
      params.push(`%${options.search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const validSorts: Record<string, string> = {
      bid_date: 'jb.created_at',
      bid_amount: 'jb.bid_amount',
      job_date: 'rj.scheduled_date',
      driver_name: 'd.name',
      job_title: 'rj.title',
    };
    const sortCol = validSorts[options.sortBy || ''] || 'jb.created_at';
    const sortDir = options.sortDir === 'asc' ? 'ASC' : 'DESC';

    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const countResult = await this.query(
      `SELECT COUNT(*) as count
       FROM job_bids jb
       JOIN route_jobs rj ON jb.job_id = rj.id
       JOIN driver_profiles d ON jb.driver_id = d.id
       ${where}`,
      params
    );

    const result = await this.query(
      `SELECT jb.id, jb.job_id, jb.driver_id, jb.bid_amount, jb.message,
              jb.driver_rating_at_bid, jb.created_at,
              rj.title AS job_title, rj.status AS job_status,
              rj.scheduled_date AS job_scheduled_date, rj.area AS job_area,
              rj.base_pay AS job_base_pay,
              d.name AS driver_name, d.rating AS driver_rating
       FROM job_bids jb
       JOIN route_jobs rj ON jb.job_id = rj.id
       JOIN driver_profiles d ON jb.driver_id = d.id
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
        COUNT(DISTINCT job_id) AS jobs_with_bids,
        COALESCE(AVG(bid_amount), 0) AS avg_bid_amount,
        COUNT(DISTINCT driver_id) AS unique_bidders
      FROM job_bids
    `);
    const row = result.rows[0];
    return {
      totalBids: parseInt(row.total_bids),
      jobsWithBids: parseInt(row.jobs_with_bids),
      avgBidAmount: parseFloat(row.avg_bid_amount),
      uniqueBidders: parseInt(row.unique_bidders),
    };
  }

  // ==================== OptimoRoute Sync ====================

  async getPropertiesForSync(): Promise<any[]> {
    const result = await this.query(
      `SELECT p.*, u.first_name, u.last_name, u.email, u.stripe_customer_id
       FROM properties p
       JOIN users u ON u.id = p.user_id
       WHERE p.address IS NOT NULL AND p.address != ''
         AND p.service_status = 'approved'
         AND u.stripe_customer_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM stripe.subscriptions s
           WHERE s.customer = u.stripe_customer_id AND s.status = 'active'
         )
       ORDER BY u.last_name, u.first_name`
    );
    return result.rows;
  }

  async getPropertiesNeedingDayDetection(): Promise<any[]> {
    const result = await this.query(
      `SELECT p.*, u.first_name, u.last_name
       FROM properties p
       JOIN users u ON u.id = p.user_id
       WHERE p.address IS NOT NULL AND p.address != ''
         AND (
           p.pickup_day IS NULL
           OR (p.pickup_day_source = 'auto_detected' AND p.pickup_day_detected_at < NOW() - INTERVAL '30 days')
         )
         AND (p.pickup_day_source IS NULL OR p.pickup_day_source != 'manual')
       ORDER BY u.last_name, u.first_name`
    );
    return result.rows;
  }

  async updatePropertyPickupSchedule(propertyId: string, data: { pickup_day?: string | null; pickup_frequency?: string; pickup_day_detected_at?: string; pickup_day_source?: string }): Promise<any> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let idx = 1;
    if (data.pickup_day !== undefined) { sets.push(`pickup_day = $${idx++}`); params.push(data.pickup_day); }
    if (data.pickup_frequency !== undefined) { sets.push(`pickup_frequency = $${idx++}`); params.push(data.pickup_frequency); }
    if (data.pickup_day_detected_at !== undefined) { sets.push(`pickup_day_detected_at = $${idx++}`); params.push(data.pickup_day_detected_at); }
    if (data.pickup_day_source !== undefined) { sets.push(`pickup_day_source = $${idx++}`); params.push(data.pickup_day_source); }
    params.push(propertyId);
    const result = await this.query(
      `UPDATE properties SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return result.rows[0];
  }

  // -- Sync orders ledger --

  async getSyncOrderByOrderNo(orderNo: string): Promise<any> {
    const result = await this.query('SELECT * FROM optimo_sync_orders WHERE order_no = $1', [orderNo]);
    return result.rows[0] || null;
  }

  async createSyncOrder(data: { propertyId: string; orderNo: string; scheduledDate: string }): Promise<any> {
    const result = await this.query(
      `INSERT INTO optimo_sync_orders (property_id, order_no, scheduled_date) VALUES ($1, $2, $3) RETURNING *`,
      [data.propertyId, data.orderNo, data.scheduledDate]
    );
    return result.rows[0];
  }

  async markSyncOrderDeleted(orderNo: string): Promise<void> {
    await this.query(
      `UPDATE optimo_sync_orders SET status = 'deleted', deleted_at = NOW() WHERE order_no = $1`,
      [orderNo]
    );
  }

  async getFutureSyncOrdersForProperty(propertyId: string): Promise<any[]> {
    const today = new Date().toISOString().split('T')[0];
    const result = await this.query(
      `SELECT * FROM optimo_sync_orders WHERE property_id = $1 AND status = 'active' AND scheduled_date >= $2 ORDER BY scheduled_date`,
      [propertyId, today]
    );
    return result.rows;
  }

  async getOrphanedSyncPropertyIds(): Promise<string[]> {
    const today = new Date().toISOString().split('T')[0];
    const result = await this.query(
      `SELECT DISTINCT oso.property_id FROM optimo_sync_orders oso
       WHERE oso.status = 'active' AND oso.scheduled_date >= $1
         AND oso.property_id NOT IN (
           SELECT p.id FROM properties p
           JOIN users u ON u.id = p.user_id
           WHERE u.stripe_customer_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM stripe.subscriptions s
               WHERE s.customer = u.stripe_customer_id AND s.status = 'active'
             )
         )`,
      [today]
    );
    return result.rows.map((r: any) => r.property_id);
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
    finished_at?: string; status?: string; properties_processed?: number;
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

  // ── Service Zones ──

  async createZone(data: { name: string; description?: string; center_lat?: number; center_lng?: number; radius_miles?: number; color?: string }) {
    const result = await this.query(
      `INSERT INTO service_zones (name, description, center_lat, center_lng, radius_miles, color)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.name, data.description ?? null, data.center_lat ?? null, data.center_lng ?? null, data.radius_miles ?? null, data.color ?? '#10B981']
    );
    return result.rows[0];
  }

  async getAllZones(activeOnly = false) {
    const where = activeOnly ? 'WHERE active = TRUE' : '';
    const result = await this.query(`SELECT * FROM service_zones ${where} ORDER BY name`);
    return result.rows;
  }

  async getZoneById(id: string) {
    const result = await this.query('SELECT * FROM service_zones WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async updateZone(id: string, data: Partial<{ name: string; description: string; center_lat: number; center_lng: number; radius_miles: number; color: string; active: boolean }>) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) { fields.push(`${key} = $${idx++}`); values.push(val); }
    }
    if (fields.length === 0) return null;
    values.push(id);
    const result = await this.query(
      `UPDATE service_zones SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async deleteZone(id: string) {
    await this.query('UPDATE service_zones SET active = FALSE WHERE id = $1', [id]);
  }

  // ── Job Pickups ──

  async addJobPickups(jobId: string, pickups: Array<{ property_id: string; pickup_type?: string; special_pickup_id?: string }>) {
    if (pickups.length === 0) return [];
    const values: any[] = [];
    const placeholders: string[] = [];
    let idx = 1;
    for (const p of pickups) {
      placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      values.push(jobId, p.property_id, p.pickup_type ?? 'recurring', p.special_pickup_id ?? null);
    }
    const result = await this.query(
      `INSERT INTO job_pickups (job_id, property_id, pickup_type, special_pickup_id)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT DO NOTHING
       RETURNING *`,
      values
    );
    return result.rows;
  }

  async getJobPickups(jobId: string) {
    const result = await this.query(
      `SELECT jp.*, p.address, p.service_type, u.first_name || ' ' || u.last_name AS customer_name
       FROM job_pickups jp
       JOIN properties p ON jp.property_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE jp.job_id = $1
       ORDER BY jp.sequence_number NULLS LAST, jp.created_at`,
      [jobId]
    );
    return result.rows;
  }

  async removeJobPickup(pickupId: string) {
    await this.query('DELETE FROM job_pickups WHERE id = $1', [pickupId]);
  }

  async updateJobPickup(pickupId: string, data: Partial<{ optimo_order_no: string; sequence_number: number; status: string }>) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) { fields.push(`${key} = $${idx++}`); values.push(val); }
    }
    if (fields.length === 0) return null;
    values.push(pickupId);
    const result = await this.query(
      `UPDATE job_pickups SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  // ── Planning Queries ──

  async getPropertiesDueOnDate(date: string) {
    const dayOfWeek = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const result = await this.query(
      `SELECT p.*, u.first_name || ' ' || u.last_name AS customer_name, u.email AS customer_email,
              sz.name AS zone_name, sz.color AS zone_color
       FROM properties p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN service_zones sz ON p.zone_id = sz.id
       WHERE p.service_status = 'approved'
         AND p.pickup_day = $1
       ORDER BY sz.name NULLS LAST, p.address`,
      [dayOfWeek]
    );
    return result.rows;
  }

  async getPlanningCalendarData(fromDate: string, toDate: string) {
    // Get existing jobs grouped by date
    const jobsResult = await this.query(
      `SELECT rj.scheduled_date, rj.status, rj.job_type, rj.zone_id, sz.name AS zone_name, sz.color AS zone_color,
              COUNT(*)::int AS job_count
       FROM route_jobs rj
       LEFT JOIN service_zones sz ON rj.zone_id = sz.id
       WHERE rj.scheduled_date >= $1 AND rj.scheduled_date <= $2
       GROUP BY rj.scheduled_date, rj.status, rj.job_type, rj.zone_id, sz.name, sz.color
       ORDER BY rj.scheduled_date`,
      [fromDate, toDate]
    );

    // Get pending special pickups
    const specialsResult = await this.query(
      `SELECT spr.pickup_date, COUNT(*)::int AS special_count
       FROM special_pickup_requests spr
       WHERE spr.pickup_date >= $1 AND spr.pickup_date <= $2
         AND spr.status IN ('pending', 'scheduled')
       GROUP BY spr.pickup_date`,
      [fromDate, toDate]
    );

    // Get property counts by pickup day and zone
    const propertyCountsResult = await this.query(
      `SELECT p.pickup_day, p.zone_id, sz.name AS zone_name, sz.color AS zone_color,
              COUNT(*)::int AS property_count
       FROM properties p
       LEFT JOIN service_zones sz ON p.zone_id = sz.id
       WHERE p.service_status = 'approved' AND p.pickup_day IS NOT NULL
       GROUP BY p.pickup_day, p.zone_id, sz.name, sz.color`
    );

    return {
      jobs: jobsResult.rows,
      specials: specialsResult.rows,
      propertyCounts: propertyCountsResult.rows,
    };
  }

  async getPropertiesByZone(zoneId: string) {
    const result = await this.query(
      `SELECT p.*, u.first_name || ' ' || u.last_name AS customer_name
       FROM properties p
       JOIN users u ON p.user_id = u.id
       WHERE p.zone_id = $1 AND p.service_status = 'approved'
       ORDER BY p.address`,
      [zoneId]
    );
    return result.rows;
  }

  async assignPropertyZone(propertyId: string, zoneId: string | null) {
    await this.query('UPDATE properties SET zone_id = $1 WHERE id = $2', [zoneId, propertyId]);
  }

  async getSpecialPickupsForDate(date: string) {
    const result = await this.query(
      `SELECT spr.*, p.address, p.zone_id, u.first_name || ' ' || u.last_name AS customer_name,
              sz.name AS zone_name
       FROM special_pickup_requests spr
       JOIN properties p ON spr.property_id = p.id
       JOIN users u ON spr.user_id = u.id
       LEFT JOIN service_zones sz ON p.zone_id = sz.id
       WHERE spr.pickup_date = $1 AND spr.status IN ('pending', 'scheduled')
       ORDER BY spr.service_price DESC`,
      [date]
    );
    return result.rows;
  }
  // ── Route Planner Queries ──

  async getMissingClientsForDate(date: string) {
    const dayOfWeek = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const result = await this.query(
      `SELECT p.id, p.address, p.service_type, p.zone_id, p.pickup_frequency,
              u.first_name || ' ' || u.last_name AS customer_name,
              sz.name AS zone_name, sz.color AS zone_color
       FROM properties p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN service_zones sz ON p.zone_id = sz.id
       WHERE p.service_status = 'approved'
         AND p.pickup_day = $1
         AND NOT EXISTS (
           SELECT 1 FROM job_pickups jp
           JOIN route_jobs rj ON jp.job_id = rj.id
           WHERE jp.property_id = p.id
             AND rj.scheduled_date = $2
             AND rj.status != 'cancelled'
         )
       ORDER BY sz.name NULLS LAST, p.address`,
      [dayOfWeek, date]
    );
    return result.rows;
  }

  async getCancelledPickupsForWeek(fromDate: string, toDate: string) {
    const result = await this.query(
      `SELECT jp.id AS pickup_id, jp.job_id, jp.property_id,
              p.address, p.service_status,
              u.first_name || ' ' || u.last_name AS customer_name,
              rj.scheduled_date, rj.title AS job_title,
              sz.name AS zone_name, sz.color AS zone_color
       FROM job_pickups jp
       JOIN route_jobs rj ON jp.job_id = rj.id
       JOIN properties p ON jp.property_id = p.id
       JOIN users u ON p.user_id = u.id
       LEFT JOIN service_zones sz ON rj.zone_id = sz.id
       WHERE rj.scheduled_date >= $1 AND rj.scheduled_date <= $2
         AND rj.status != 'cancelled'
         AND p.service_status != 'approved'
       ORDER BY rj.scheduled_date, rj.title`,
      [fromDate, toDate]
    );
    return result.rows;
  }

  async copyWeekJobs(sourceFrom: string, sourceTo: string, targetOffset: number = 7) {
    const sourceJobs = await this.getAllRouteJobs({ date_from: sourceFrom, date_to: sourceTo });
    const nonCancelled = sourceJobs.filter((j: any) => j.status !== 'cancelled');
    const created: any[] = [];

    for (const job of nonCancelled) {
      const srcDate = new Date(job.scheduled_date.split('T')[0] + 'T12:00:00');
      srcDate.setDate(srcDate.getDate() + targetOffset);
      const targetDate = srcDate.toISOString().split('T')[0];

      const newJob = await this.createRouteJob({
        title: job.title,
        description: job.description || undefined,
        scheduled_date: targetDate,
        start_time: job.start_time || undefined,
        end_time: job.end_time || undefined,
        estimated_stops: job.estimated_stops ?? undefined,
        estimated_hours: job.estimated_hours ? Number(job.estimated_hours) : undefined,
        base_pay: job.base_pay ? Number(job.base_pay) : undefined,
        notes: job.notes || undefined,
        zone_id: job.zone_id || undefined,
        job_type: job.job_type || 'daily_route',
        source: 'copied',
        status: 'draft',
      });

      // Copy only recurring pickups (skip one-time specials)
      const sourcePickups = await this.getJobPickups(job.id);
      const recurringPickups = sourcePickups.filter((p: any) => p.pickup_type !== 'special');
      if (recurringPickups.length > 0) {
        await this.addJobPickups(
          newJob.id,
          recurringPickups.map((p: any) => ({ property_id: p.property_id, pickup_type: p.pickup_type }))
        );
      }

      created.push(newJob);
    }
    return created;
  }
}

export const storage = new Storage();
