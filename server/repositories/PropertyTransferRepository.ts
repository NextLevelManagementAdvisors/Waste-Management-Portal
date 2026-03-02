import { BaseRepository } from '../db';
import { DbLocation } from '../storage';

export class LocationTransferRepository extends BaseRepository {
  async initiateTransfer(locationId: string, newOwner: { firstName: string; lastName: string; email: string }, token: string, expiresAt: Date) {
    await this.query(
      `UPDATE locations SET transfer_status = 'pending', pending_owner = $1, transfer_token = $2, transfer_token_expires = $3 WHERE id = $4`,
      [JSON.stringify(newOwner), token, expiresAt, locationId]
    );
  }

  async getLocationByTransferToken(token: string): Promise<DbLocation | null> {
    const result = await this.query(
      "SELECT * FROM locations WHERE transfer_token = $1 AND transfer_status = 'pending' AND transfer_token_expires > NOW()",
      [token]
    );
    return result.rows[0] || null;
  }

  async completeTransfer(locationId: string, newUserId: string) {
    await this.query(
      `UPDATE locations SET user_id = $1, transfer_status = NULL, pending_owner = NULL, transfer_token = NULL, transfer_token_expires = NULL WHERE id = $2`,
      [newUserId, locationId]
    );
  }

  async cancelTransfer(locationId: string) {
    await this.query(
      `UPDATE locations SET transfer_status = NULL, pending_owner = NULL, transfer_token = NULL, transfer_token_expires = NULL WHERE id = $1`,
      [locationId]
    );
  }
}

/** @deprecated Use LocationTransferRepository instead */
export const PropertyTransferRepository = LocationTransferRepository;
