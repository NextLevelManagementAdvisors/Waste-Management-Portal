import { BaseRepository } from '../db';

export class DriverRepository extends BaseRepository {
  async createDriver(data: { name: string; email?: string; phone?: string; optimorouteDriverId?: string }) {
    const result = await this.query(
      `INSERT INTO drivers (name, email, phone, optimoroute_driver_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.name, data.email || null, data.phone || null, data.optimorouteDriverId || null]
    );
    return result.rows[0];
  }

  async getDrivers() {
    const result = await this.query(`SELECT * FROM drivers WHERE status = 'active' ORDER BY name`);
    return result.rows;
  }

  async getDriverById(id: string) {
    const result = await this.query(`SELECT * FROM drivers WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }

  async getDriverByEmail(email: string) {
    const result = await this.query('SELECT * FROM drivers WHERE email = $1', [email]);
    return result.rows[0] || null;
  }

  async updateDriver(id: string, data: Partial<{ name: string; email: string; phone: string; password_hash: string; status: string; onboarding_status: string; rating: number; total_jobs_completed: number; stripe_connect_account_id: string; stripe_connect_onboarded: boolean; w9_completed: boolean; direct_deposit_completed: boolean; availability: any }>) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(key === 'availability' ? JSON.stringify(val) : val);
        idx++;
      }
    }
    if (fields.length === 0) return null;
    fields.push(`updated_at = NOW()`);
    values.push(id);
    const result = await this.query(
      `UPDATE drivers SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  // W9
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

  // Jobs
  async getOpenJobs(filters?: { startDate?: string; endDate?: string }) {
    const conditions: string[] = [`status IN ('open', 'bidding')`];
    const params: any[] = [];
    let idx = 1;
    if (filters?.startDate) { conditions.push(`scheduled_date >= $${idx++}`); params.push(filters.startDate); }
    if (filters?.endDate) { conditions.push(`scheduled_date <= $${idx++}`); params.push(filters.endDate); }
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
       JOIN drivers d ON jb.driver_id = d.id
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

  async updateJob(jobId: string, data: Partial<{ title: string; description: string; area: string; scheduled_date: string; start_time: string; end_time: string; estimated_stops: number; estimated_hours: number; base_pay: number; status: string; assigned_driver_id: string; notes: string }>) {
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
}
