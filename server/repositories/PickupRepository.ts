import { BaseRepository } from '../db';

export class PickupRepository extends BaseRepository {
  async getActiveServiceAlerts() {
    const result = await this.query(
      'SELECT * FROM service_alerts WHERE active = true ORDER BY created_at DESC'
    );
    return result.rows;
  }

  // Missed pickups
  async createMissedPickupReport(data: { userId: string; propertyId: string; pickupDate: string; notes: string }) {
    const result = await this.query(
      `INSERT INTO missed_pickup_reports (user_id, property_id, pickup_date, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.userId, data.propertyId, data.pickupDate, data.notes]
    );
    return result.rows[0];
  }

  async getMissedPickupReports(userId: string): Promise<any[]>;
  async getMissedPickupReports(options: { status?: string; limit?: number; offset?: number }): Promise<{ reports: any[]; total: number }>;
  async getMissedPickupReports(arg: string | { status?: string; limit?: number; offset?: number }): Promise<any> {
    if (typeof arg === 'string') {
      const result = await this.query(
        'SELECT * FROM missed_pickup_reports WHERE user_id = $1 ORDER BY created_at DESC',
        [arg]
      );
      return result.rows;
    }
    const options = arg;
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

  // Special pickups
  async createSpecialPickupRequest(data: { userId: string; propertyId: string; serviceName: string; servicePrice: number; pickupDate: string }) {
    const result = await this.query(
      `INSERT INTO special_pickup_requests (user_id, property_id, service_name, service_price, pickup_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.userId, data.propertyId, data.serviceName, data.servicePrice, data.pickupDate]
    );
    return result.rows[0];
  }

  async getSpecialPickupRequests(arg: string | { status?: string; limit?: number; offset?: number }): Promise<any> {
    if (typeof arg === 'string') {
      const result = await this.query(
        'SELECT * FROM special_pickup_requests WHERE user_id = $1 ORDER BY created_at DESC',
        [arg]
      );
      return result.rows;
    }
    const options = arg;
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

  async getSpecialPickupServices() {
    const result = await this.query('SELECT * FROM special_pickup_services WHERE active = true ORDER BY name');
    return result.rows;
  }

  // Collection intents
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

  // Driver feedback
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

  // Tip dismissals
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
    return result.rows.map((r: any) => r.pickup_date);
  }
}
