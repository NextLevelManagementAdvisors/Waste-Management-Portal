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
}

export const storage = new Storage();
