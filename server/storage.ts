import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

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
  created_at: string;
  updated_at: string;
}

export class Storage {
  async query(text: string, params?: any[]) {
    const result = await pool.query(text, params);
    return result;
  }

  async createUser(data: { firstName: string; lastName: string; phone: string; email: string; passwordHash: string; stripeCustomerId?: string }): Promise<DbUser> {
    const result = await this.query(
      `INSERT INTO users (first_name, last_name, phone, email, password_hash, stripe_customer_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.firstName, data.lastName, data.phone, data.email, data.passwordHash, data.stripeCustomerId || null]
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

  async updateUser(id: string, data: Partial<{ first_name: string; last_name: string; phone: string; email: string; password_hash: string; autopay_enabled: boolean; stripe_customer_id: string }>): Promise<DbUser> {
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
      `INSERT INTO properties (user_id, address, service_type, in_hoa, community_name, has_gate_code, gate_code, notes, notification_preferences)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.userId, data.address, data.serviceType, data.inHoa,
        data.communityName || null, data.hasGateCode, data.gateCode || null,
        data.notes || null,
        JSON.stringify(data.notificationPreferences || { pickupReminders: { email: true, sms: false }, scheduleChanges: { email: true, sms: false }, driverUpdates: { email: false, sms: false } })
      ]
    );
    return result.rows[0];
  }

  async getPropertyById(propertyId: string): Promise<DbProperty | null> {
    const result = await this.query('SELECT * FROM properties WHERE id = $1', [propertyId]);
    return result.rows[0] || null;
  }

  async updateProperty(propertyId: string, data: Partial<{ address: string; service_type: string; in_hoa: boolean; community_name: string | null; has_gate_code: boolean; gate_code: string | null; notes: string | null; notification_preferences: any; transfer_status: string | null; pending_owner: any }>): Promise<DbProperty> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
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

  async deleteProperty(propertyId: string): Promise<void> {
    await this.query('DELETE FROM properties WHERE id = $1', [propertyId]);
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

  async createSpecialPickupRequest(data: { userId: string; propertyId: string; serviceName: string; servicePrice: number; pickupDate: string }) {
    const result = await this.query(
      `INSERT INTO special_pickup_requests (user_id, property_id, service_name, service_price, pickup_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.userId, data.propertyId, data.serviceName, data.servicePrice, data.pickupDate]
    );
    return result.rows[0];
  }

  async getSpecialPickupRequests(userId: string) {
    const result = await this.query(
      'SELECT * FROM special_pickup_requests WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async upsertCollectionIntent(data: { userId: string; propertyId: string; intent: string; pickupDate: string }) {
    const result = await this.query(
      `INSERT INTO collection_intents (user_id, property_id, intent, pickup_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (property_id, pickup_date) DO UPDATE SET intent = $3
       RETURNING *`,
      [data.userId, data.propertyId, data.intent, data.pickupDate]
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
    const randPart = Math.floor(1000 + Math.random() * 9000);
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
  }> {
    const [users, properties, recentUsers, transfers, referrals, pendingRefs] = await Promise.all([
      this.query('SELECT COUNT(*) as count FROM users'),
      this.query('SELECT COUNT(*) as count FROM properties'),
      this.query(`SELECT COUNT(*) as count FROM users WHERE created_at > NOW() - INTERVAL '30 days'`),
      this.query(`SELECT COUNT(*) as count FROM properties WHERE transfer_status = 'pending'`),
      this.query('SELECT COUNT(*) as count FROM referrals'),
      this.query(`SELECT COUNT(*) as count FROM referrals WHERE status = 'pending'`),
    ]);
    return {
      totalUsers: parseInt(users.rows[0].count),
      totalProperties: parseInt(properties.rows[0].count),
      recentUsers: parseInt(recentUsers.rows[0].count),
      activeTransfers: parseInt(transfers.rows[0].count),
      totalReferrals: parseInt(referrals.rows[0].count),
      pendingReferrals: parseInt(pendingRefs.rows[0].count),
    };
  }

  async setUserAdmin(userId: string, isAdmin: boolean): Promise<void> {
    await this.query('UPDATE users SET is_admin = $1 WHERE id = $2', [isAdmin, userId]);
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
}

export const storage = new Storage();
