import { BaseRepository } from '../db';

export class AdminRepository extends BaseRepository {
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
}
