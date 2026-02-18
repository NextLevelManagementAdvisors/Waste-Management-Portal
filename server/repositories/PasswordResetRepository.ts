import { BaseRepository } from '../db';

export class PasswordResetRepository extends BaseRepository {
  async createPasswordResetToken(userId: string, token: string, expiresAt: Date) {
    await this.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [userId, token, expiresAt]
    );
  }

  async getPasswordResetToken(token: string) {
    const result = await this.query(
      `SELECT * FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW() AND used = FALSE`,
      [token]
    );
    return result.rows[0] || null;
  }

  async markPasswordResetTokenUsed(token: string) {
    await this.query(`UPDATE password_reset_tokens SET used = TRUE WHERE token = $1`, [token]);
  }
}
