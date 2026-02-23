import bcrypt from 'bcrypt';
import { pool } from './storage';

/**
 * Ensures a superadmin account always exists.
 * Reads ADMIN_EMAIL and ADMIN_PASSWORD from environment variables.
 * - If the account does not exist, it is created.
 * - If the account exists, its password is synced from env.
 * Uses user_roles table for role management.
 * This is idempotent and safe to run on every server startup.
 */
export async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn('ensureAdmin: ADMIN_EMAIL and ADMIN_PASSWORD not set — skipping admin seed.');
    return;
  }

  const existing = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  let userId: string;
  const passwordHash = await bcrypt.hash(password, 12);

  if (existing.rows.length === 0) {
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['Admin', 'User', email.toLowerCase(), passwordHash]
    );
    userId = result.rows[0].id;
    console.log(`ensureAdmin: Created superadmin account (${email})`);
  } else {
    userId = existing.rows[0].id;
    await pool.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2`,
      [passwordHash, userId]
    );
    console.log(`ensureAdmin: Superadmin password synced from env (${email})`);
  }

  // Ensure user_roles entries exist
  await pool.query(
    `INSERT INTO user_roles (user_id, role, admin_role)
     VALUES ($1, 'admin', 'full_admin')
     ON CONFLICT (user_id, role) DO UPDATE SET admin_role = 'full_admin'`,
    [userId]
  );
  await pool.query(
    `INSERT INTO user_roles (user_id, role) VALUES ($1, 'customer') ON CONFLICT DO NOTHING`,
    [userId]
  );
}
