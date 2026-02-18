import { BaseRepository, DbProperty } from '../db';

export class PropertyTransferRepository extends BaseRepository {
  async initiateTransfer(propertyId: string, newOwner: { firstName: string; lastName: string; email: string }, token: string, expiresAt: Date) {
    await this.query(
      `UPDATE properties SET transfer_status = 'pending', pending_owner = $1, transfer_token = $2, transfer_token_expires = $3 WHERE id = $4`,
      [JSON.stringify(newOwner), token, expiresAt, propertyId]
    );
  }

  async getPropertyByTransferToken(token: string): Promise<DbProperty | null> {
    const result = await this.query(
      "SELECT * FROM properties WHERE transfer_token = $1 AND transfer_status = 'pending' AND transfer_token_expires > NOW()",
      [token]
    );
    return result.rows[0] || null;
  }

  async completeTransfer(propertyId: string, newUserId: string) {
    await this.query(
      `UPDATE properties SET user_id = $1, transfer_status = NULL, pending_owner = NULL, transfer_token = NULL, transfer_token_expires = NULL WHERE id = $2`,
      [newUserId, propertyId]
    );
  }

  async cancelTransfer(propertyId: string) {
    await this.query(
      `UPDATE properties SET transfer_status = NULL, pending_owner = NULL, transfer_token = NULL, transfer_token_expires = NULL WHERE id = $1`,
      [propertyId]
    );
  }
}
