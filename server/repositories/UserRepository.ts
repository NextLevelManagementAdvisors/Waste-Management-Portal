import { BaseRepository, DbUser } from '../db';

const ALLOWED_USER_FIELDS = new Set(['first_name', 'last_name', 'phone', 'email', 'password_hash', 'autopay_enabled', 'stripe_customer_id']);
const ALLOWED_ADMIN_USER_FIELDS = new Set(['first_name', 'last_name', 'phone', 'email']);

export class UserRepository extends BaseRepository {
  async createUser(data: { firstName: string; lastName: string; phone: string; email: string; passwordHash: string; stripeCustomerId?: string }): Promise<DbUser> {
    const result = await this.query(
      `INSERT INTO users (first_name, last_name, phone, email, password_hash, stripe_customer_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.firstName, data.lastName, data.phone, data.email, data.passwordHash, data.stripeCustomerId || null]
    );
    return result.rows[0];
  }

  async getUserById(id: string): Promise<DbUser | null> {
    const result = await this.query(`SELECT * FROM users WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }

  async getUserByEmail(email: string): Promise<DbUser | null> {
    const result = await this.query(`SELECT * FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
    return result.rows[0] || null;
  }

  async updateUser(userId: string, data: Partial<{ first_name: string; last_name: string; phone: string; email: string; password_hash: string; autopay_enabled: boolean; stripe_customer_id: string }>) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        if (!ALLOWED_USER_FIELDS.has(key)) throw new Error(`Invalid field: ${key}`);
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

  async getAllUsers() {
    const result = await this.query(`SELECT * FROM users ORDER BY created_at DESC`);
    return result.rows;
  }

  async setUserAdmin(userId: string, isAdmin: boolean) {
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

  async searchUsers(query: string) {
    const result = await this.query(
      `SELECT id, first_name, last_name, email, phone FROM users
       WHERE LOWER(email) LIKE LOWER($1) OR LOWER(first_name || ' ' || last_name) LIKE LOWER($1)
       LIMIT 20`,
      [`%${query}%`]
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

  async updateUserAdmin(userId: string, data: Partial<{ first_name: string; last_name: string; phone: string; email: string }>) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        if (!ALLOWED_ADMIN_USER_FIELDS.has(key)) throw new Error(`Invalid field: ${key}`);
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
}
