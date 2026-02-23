import { pool } from '../db';

export class RoleRepository {
  async getUserRoles(userId: string): Promise<string[]> {
    const result = await pool.query(
      `SELECT role FROM user_roles WHERE user_id = $1`,
      [userId]
    );
    return result.rows.map(r => r.role);
  }

  async hasRole(userId: string, role: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2`,
      [userId, role]
    );
    return result.rows.length > 0;
  }

  async addRole(userId: string, role: string, grantedBy?: string, adminRole?: string): Promise<void> {
    await pool.query(
      `INSERT INTO user_roles (user_id, role, admin_role, granted_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, role) DO UPDATE SET admin_role = COALESCE($3, user_roles.admin_role)`,
      [userId, role, adminRole || null, grantedBy || null]
    );
  }

  async removeRole(userId: string, role: string): Promise<void> {
    await pool.query(
      `DELETE FROM user_roles WHERE user_id = $1 AND role = $2`,
      [userId, role]
    );
  }

  async getAdminRole(userId: string): Promise<string | null> {
    const result = await pool.query(
      `SELECT admin_role FROM user_roles WHERE user_id = $1 AND role = 'admin'`,
      [userId]
    );
    return result.rows[0]?.admin_role || null;
  }

  async updateAdminRole(userId: string, adminRole: string): Promise<void> {
    await pool.query(
      `UPDATE user_roles SET admin_role = $1 WHERE user_id = $2 AND role = 'admin'`,
      [adminRole, userId]
    );
  }

  async getUsersByRole(role: string, options: { limit?: number; offset?: number; search?: string; sortBy?: string; sortDir?: string } = {}): Promise<{ users: any[]; total: number }> {
    const conditions: string[] = [`ur.role = $1`];
    const params: any[] = [role];
    let idx = 2;

    if (options.search) {
      conditions.push(`(LOWER(u.email) LIKE LOWER($${idx}) OR LOWER(u.first_name || ' ' || u.last_name) LIKE LOWER($${idx}))`);
      params.push(`%${options.search}%`);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const validSorts: Record<string, string> = { name: 'u.first_name', email: 'u.email', created_at: 'u.created_at' };
    const sortCol = validSorts[options.sortBy || ''] || 'u.created_at';
    const sortDir = options.sortDir === 'asc' ? 'ASC' : 'DESC';
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    params.push(limit, offset);

    const result = await pool.query(
      `SELECT u.*, ur.admin_role,
        (SELECT COUNT(*) FROM properties p WHERE p.user_id = u.id) as property_count,
        (SELECT array_agg(ur2.role) FROM user_roles ur2 WHERE ur2.user_id = u.id) as roles
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       ${where}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $${idx++} OFFSET $${idx}`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM users u JOIN user_roles ur ON ur.user_id = u.id ${where}`,
      params.slice(0, -2)
    );

    return { users: result.rows, total: parseInt(countResult.rows[0].count) };
  }

  async getAllPeoplePaginated(options: {
    role?: string;
    search?: string;
    sortBy?: string;
    sortDir?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ users: any[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (options.role) {
      conditions.push(`EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = $${idx})`);
      params.push(options.role);
      idx++;
    }

    if (options.search) {
      conditions.push(`(LOWER(u.email) LIKE LOWER($${idx}) OR LOWER(u.first_name || ' ' || u.last_name) LIKE LOWER($${idx}))`);
      params.push(`%${options.search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const validSorts: Record<string, string> = { name: 'u.first_name', email: 'u.email', created_at: 'u.created_at' };
    const sortCol = validSorts[options.sortBy || ''] || 'u.created_at';
    const sortDir = options.sortDir === 'asc' ? 'ASC' : 'DESC';
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    params.push(limit, offset);

    const result = await pool.query(
      `SELECT u.*,
        (SELECT COUNT(*) FROM properties p WHERE p.user_id = u.id) as property_count,
        (SELECT array_agg(ur.role) FROM user_roles ur WHERE ur.user_id = u.id) as roles,
        dp.rating as driver_rating,
        dp.onboarding_status as driver_onboarding_status,
        dp.total_jobs_completed as driver_jobs_completed,
        dp.stripe_connect_onboarded as driver_stripe_connected
       FROM users u
       LEFT JOIN driver_profiles dp ON dp.user_id = u.id
       ${where}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $${idx++} OFFSET $${idx}`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM users u ${where}`,
      params.slice(0, -2)
    );

    return { users: result.rows, total: parseInt(countResult.rows[0].count) };
  }

  async getAdminUsers(): Promise<any[]> {
    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.created_at, ur.admin_role
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'admin'
       ORDER BY u.created_at ASC`
    );
    return result.rows;
  }

  async getDriverProfileByUserId(userId: string): Promise<any | null> {
    const result = await pool.query(
      `SELECT * FROM driver_profiles WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  async getDriverProfileById(driverProfileId: string): Promise<any | null> {
    const result = await pool.query(
      `SELECT * FROM driver_profiles WHERE id = $1`,
      [driverProfileId]
    );
    return result.rows[0] || null;
  }
}

export const roleRepo = new RoleRepository();
