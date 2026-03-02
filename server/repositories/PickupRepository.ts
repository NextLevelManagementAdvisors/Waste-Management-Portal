import { BaseRepository } from '../db';

export class PickupRepository extends BaseRepository {
  async getActiveServiceAlerts() {
    const result = await this.query(
      'SELECT * FROM service_alerts WHERE active = true ORDER BY created_at DESC'
    );
    return result.rows;
  }

  // Missed collections
  async createMissedCollectionReport(data: { userId: string; locationId: string; collectionDate: string; notes: string; photos?: string[] }) {
    const result = await this.query(
      `INSERT INTO missed_collection_reports (user_id, location_id, collection_date, notes, photos)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.userId, data.locationId, data.collectionDate, data.notes, JSON.stringify(data.photos || [])]
    );
    return result.rows[0];
  }

  async getMissedCollectionReports(userId: string): Promise<any[]>;
  async getMissedCollectionReports(options: { status?: string; limit?: number; offset?: number }): Promise<{ reports: any[]; total: number }>;
  async getMissedCollectionReports(arg: string | { status?: string; limit?: number; offset?: number }): Promise<any> {
    if (typeof arg === 'string') {
      const result = await this.query(
        'SELECT * FROM missed_collection_reports WHERE user_id = $1 ORDER BY created_at DESC',
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
      `SELECT m.*, u.first_name, u.last_name, u.email, l.address
       FROM missed_collection_reports m
       JOIN users u ON m.user_id = u.id
       JOIN locations l ON m.location_id = l.id
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

  // On-demand requests
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
    requestedDate?: string; status?: string; cancellationReason?: string;
    adminNotes?: string; assignedDriverId?: string | null; servicePrice?: number;
  }) {
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let idx = 1;
    if (data.requestedDate !== undefined) { sets.push(`requested_date = $${idx++}`); params.push(data.requestedDate); }
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
      `SELECT s.*, u.first_name, u.last_name, u.email, l.address
       FROM on_demand_requests s
       JOIN users u ON s.user_id = u.id
       JOIN locations l ON s.location_id = l.id
       WHERE s.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async getOnDemandRequestsForDriver(driverProfileId: string) {
    const result = await this.query(
      `SELECT s.*, l.address
       FROM on_demand_requests s
       JOIN locations l ON s.location_id = l.id
       WHERE s.assigned_driver_id = $1 AND s.status IN ('scheduled', 'pending')
       ORDER BY s.requested_date ASC`,
      [driverProfileId]
    );
    return result.rows;
  }

  async getOnDemandRequests(arg: string | { status?: string; limit?: number; offset?: number }): Promise<any> {
    if (typeof arg === 'string') {
      const result = await this.query(
        'SELECT * FROM on_demand_requests WHERE user_id = $1 ORDER BY created_at DESC',
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
      `SELECT s.*, u.first_name, u.last_name, u.email, l.address
       FROM on_demand_requests s
       JOIN users u ON s.user_id = u.id
       JOIN locations l ON s.location_id = l.id
       ${where} ORDER BY s.created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    const countResult = await this.query(`SELECT COUNT(*) as count FROM on_demand_requests s ${where}`, params.slice(0, -2));
    return { requests: result.rows, total: parseInt(countResult.rows[0].count) };
  }

  async getOnDemandServices() {
    const result = await this.query('SELECT * FROM on_demand_services WHERE active = true ORDER BY name');
    return result.rows;
  }

  // Collection intents
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

  async deleteCollectionIntent(locationId: string, collectionDate: string) {
    await this.query(
      'DELETE FROM collection_intents WHERE location_id = $1 AND collection_date = $2',
      [locationId, collectionDate]
    );
  }

  async getCollectionIntent(locationId: string, collectionDate: string) {
    const result = await this.query(
      'SELECT * FROM collection_intents WHERE location_id = $1 AND collection_date = $2',
      [locationId, collectionDate]
    );
    return result.rows[0] || null;
  }

  // Driver feedback
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

  async getDriverFeedback(locationId: string, collectionDate: string) {
    const result = await this.query(
      'SELECT * FROM driver_feedback WHERE location_id = $1 AND collection_date = $2',
      [locationId, collectionDate]
    );
    return result.rows[0] || null;
  }

  async getDriverFeedbackForLocation(locationId: string) {
    const result = await this.query(
      'SELECT * FROM driver_feedback WHERE location_id = $1 ORDER BY collection_date DESC',
      [locationId]
    );
    return result.rows;
  }

  // Tip dismissals
  async getTipDismissal(locationId: string, collectionDate: string) {
    const result = await this.query(
      'SELECT * FROM tip_dismissals WHERE location_id = $1 AND collection_date = $2',
      [locationId, collectionDate]
    );
    return result.rows[0] || null;
  }

  async createTipDismissal(userId: string, locationId: string, collectionDate: string) {
    await this.query(
      'INSERT INTO tip_dismissals (user_id, location_id, collection_date) VALUES ($1, $2, $3) ON CONFLICT (location_id, collection_date) DO NOTHING',
      [userId, locationId, collectionDate]
    );
  }

  async getTipDismissalsForLocation(locationId: string) {
    const result = await this.query(
      'SELECT collection_date FROM tip_dismissals WHERE location_id = $1',
      [locationId]
    );
    return result.rows.map((r: any) => r.collection_date);
  }
}
