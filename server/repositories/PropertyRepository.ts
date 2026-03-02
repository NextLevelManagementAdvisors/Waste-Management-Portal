import { BaseRepository } from '../db';
import { DbLocation } from '../storage';

const ALLOWED_LOCATION_FIELDS = new Set(['address', 'service_type', 'in_hoa', 'community_name', 'has_gate_code', 'gate_code', 'notes', 'notification_preferences', 'transfer_status', 'pending_owner']);

export class LocationRepository extends BaseRepository {
  async createLocation(data: { userId: string; address: string; serviceType: string; inHoa: boolean; communityName?: string; hasGateCode: boolean; gateCode?: string; notes?: string }): Promise<DbLocation> {
    const result = await this.query(
      `INSERT INTO locations (user_id, address, service_type, in_hoa, community_name, has_gate_code, gate_code, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [data.userId, data.address, data.serviceType, data.inHoa, data.communityName || null, data.hasGateCode, data.gateCode || null, data.notes || null]
    );
    return result.rows[0];
  }

  async getLocationsByUserId(userId: string): Promise<DbLocation[]> {
    const result = await this.query(`SELECT * FROM locations WHERE user_id = $1 ORDER BY created_at ASC`, [userId]);
    return result.rows;
  }

  async getLocationById(locationId: string): Promise<DbLocation | null> {
    const result = await this.query(`SELECT * FROM locations WHERE id = $1`, [locationId]);
    return result.rows[0] || null;
  }

  async updateLocation(locationId: string, data: Partial<{ address: string; service_type: string; in_hoa: boolean; community_name: string; has_gate_code: boolean; gate_code: string; notes: string; notification_preferences: any; transfer_status: string; pending_owner: any }>) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        if (!ALLOWED_LOCATION_FIELDS.has(key)) throw new Error(`Invalid field: ${key}`);
        fields.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
    }
    if (fields.length === 0) return;
    fields.push(`updated_at = NOW()`);
    values.push(locationId);
    await this.query(`UPDATE locations SET ${fields.join(', ')} WHERE id = $${idx}`, values);
  }

  async getAllLocations() {
    const result = await this.query(`SELECT l.*, u.first_name, u.last_name, u.email FROM locations l JOIN users u ON l.user_id = u.id ORDER BY l.created_at DESC`);
    return result.rows;
  }

  async getLocationStats() {
    const result = await this.query(
      `SELECT service_type, COUNT(*) as count FROM locations GROUP BY service_type ORDER BY count DESC`
    );
    return result.rows;
  }
}

/** @deprecated Use LocationRepository instead */
export const PropertyRepository = LocationRepository;
