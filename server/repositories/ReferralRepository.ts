import { BaseRepository } from '../db';

export class ReferralRepository extends BaseRepository {
  async getOrCreateReferralCode(userId: string, userName: string): Promise<string> {
    const existing = await this.query('SELECT code FROM referral_codes WHERE user_id = $1', [userId]);
    if (existing.rows.length > 0) return existing.rows[0].code;
    const namePart = userName.replace(/[^A-Z]/gi, '').substring(0, 6).toUpperCase() || 'USER';
    const randPart = Math.floor(1000 + Math.random() * 9000);
    const code = `${namePart}-${randPart}`;
    await this.query(
      'INSERT INTO referral_codes (user_id, code) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING',
      [userId, code]
    );
    return code;
  }

  async getReferralsByUser(userId: string) {
    const result = await this.query(
      'SELECT * FROM referrals WHERE referrer_user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async getReferralTotalRewards(userId: string): Promise<number> {
    const result = await this.query(
      "SELECT COALESCE(SUM(reward_amount), 0) as total FROM referrals WHERE referrer_user_id = $1 AND status = 'completed'",
      [userId]
    );
    return parseFloat(result.rows[0].total);
  }

  async createReferral(referrerUserId: string, referredEmail: string, referredName: string) {
    const result = await this.query(
      'INSERT INTO referrals (referrer_user_id, referred_email, referred_name) VALUES ($1, $2, $3) RETURNING *',
      [referrerUserId, referredEmail, referredName]
    );
    return result.rows[0];
  }

  async findReferrerByCode(code: string): Promise<string | null> {
    const result = await this.query('SELECT user_id FROM referral_codes WHERE code = $1', [code]);
    return result.rows[0]?.user_id || null;
  }

  async completeReferral(referrerUserId: string, referredEmail: string, rewardAmount: number = 10) {
    await this.query(
      "UPDATE referrals SET status = 'completed', completed_at = NOW(), reward_amount = $3 WHERE referrer_user_id = $1 AND referred_email = $2 AND status = 'pending'",
      [referrerUserId, referredEmail, rewardAmount]
    );
  }

  async getPendingReferralForEmail(email: string) {
    const result = await this.query(
      "SELECT r.*, rc.user_id as referrer_user_id FROM referrals r JOIN referral_codes rc ON r.referrer_user_id = rc.user_id WHERE r.referred_email = $1 AND r.status = 'pending' LIMIT 1",
      [email]
    );
    return result.rows[0] || null;
  }
}
