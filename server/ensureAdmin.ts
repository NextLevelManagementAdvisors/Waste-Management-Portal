import bcrypt from 'bcrypt';
import { pool } from './storage';

/**
 * Ensures a superadmin account always exists.
 * Reads ADMIN_EMAIL and ADMIN_PASSWORD from environment variables.
 * - If the account does not exist, it is created.
 * - If the account exists but is not an admin, it is promoted.
 * - If the account already exists as an admin, nothing changes.
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
    'SELECT id, is_admin FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (existing.rows.length === 0) {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, is_admin, admin_role)
       VALUES ($1, $2, $3, $4, TRUE, 'superadmin')`,
      ['Admin', 'User', email.toLowerCase(), passwordHash]
    );
    console.log(`ensureAdmin: Created superadmin account (${email})`);
  } else if (!existing.rows[0].is_admin) {
    await pool.query(
      `UPDATE users SET is_admin = TRUE, admin_role = 'superadmin' WHERE id = $1`,
      [existing.rows[0].id]
    );
    console.log(`ensureAdmin: Promoted existing account to superadmin (${email})`);
  } else {
    console.log(`ensureAdmin: Superadmin account OK (${email})`);
  }
}
