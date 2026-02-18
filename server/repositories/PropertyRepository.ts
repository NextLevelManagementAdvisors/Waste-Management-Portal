import { BaseRepository, DbProperty } from '../db';

const ALLOWED_PROPERTY_FIELDS = new Set(['address', 'service_type', 'in_hoa', 'community_name', 'has_gate_code', 'gate_code', 'notes', 'notification_preferences', 'transfer_status', 'pending_owner']);

export class PropertyRepository extends BaseRepository {
  async createProperty(data: { userId: string; address: string; serviceType: string; inHoa: boolean; communityName?: string; hasGateCode: boolean; gateCode?: string; notes?: string }): Promise<DbProperty> {
    const result = await this.query(
      `INSERT INTO properties (user_id, address, service_type, in_hoa, community_name, has_gate_code, gate_code, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [data.userId, data.address, data.serviceType, data.inHoa, data.communityName || null, data.hasGateCode, data.gateCode || null, data.notes || null]
    );
    return result.rows[0];
  }

  async getPropertiesByUserId(userId: string): Promise<DbProperty[]> {
    const result = await this.query(`SELECT * FROM properties WHERE user_id = $1 ORDER BY created_at ASC`, [userId]);
    return result.rows;
  }

  async getPropertyById(propertyId: string): Promise<DbProperty | null> {
    const result = await this.query(`SELECT * FROM properties WHERE id = $1`, [propertyId]);
    return result.rows[0] || null;
  }

  async updateProperty(propertyId: string, data: Partial<{ address: string; service_type: string; in_hoa: boolean; community_name: string; has_gate_code: boolean; gate_code: string; notes: string; notification_preferences: any; transfer_status: string; pending_owner: any }>) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        if (!ALLOWED_PROPERTY_FIELDS.has(key)) throw new Error(`Invalid field: ${key}`);
        fields.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
    }
    if (fields.length === 0) return;
    fields.push(`updated_at = NOW()`);
    values.push(propertyId);
    await this.query(`UPDATE properties SET ${fields.join(', ')} WHERE id = $${idx}`, values);
  }

  async getAllProperties() {
    const result = await this.query(`SELECT p.*, u.first_name, u.last_name, u.email FROM properties p JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC`);
    return result.rows;
  }

  async getPropertyStats() {
    const result = await this.query(
      `SELECT service_type, COUNT(*) as count FROM properties GROUP BY service_type ORDER BY count DESC`
    );
    return result.rows;
  }
}
