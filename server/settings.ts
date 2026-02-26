import { pool } from './db';

// Keys for which cached service clients need to be reset after updates
const TWILIO_KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
const STRIPE_KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET'];

/**
 * Load all DB-stored settings into process.env (overrides .env values).
 * Call once at server startup, after schema init.
 */
export async function loadSettingsIntoEnv(): Promise<void> {
  try {
    // One-time category reconciliation: OAuth creds were originally stored under 'gmail'
    // but are now canonical under 'google_oauth' (shared by Gmail, SSO, and admin OAuth).
    // This idempotent UPDATE fixes any stale DB rows on startup.
    await pool.query(
      `UPDATE system_settings SET category = 'google_oauth'
       WHERE key IN ('GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET') AND category = 'gmail'`,
    );

    const result = await pool.query('SELECT key, value FROM system_settings');
    for (const row of result.rows) {
      process.env[row.key] = row.value;
    }
    if (result.rows.length > 0) {
      console.log(`Loaded ${result.rows.length} settings from database`);
    }
  } catch (error) {
    // Table may not exist yet on first run — that's fine
    console.warn('Could not load system settings (table may not exist yet):', (error as Error).message);
  }
}

/**
 * Save a setting to the DB and update process.env immediately.
 * Clears relevant service caches so new credentials take effect.
 */
export async function saveSetting(
  key: string,
  value: string,
  category: string,
  isSecret: boolean,
  userId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO system_settings (key, value, category, is_secret, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, category = $3, is_secret = $4, updated_by = $5, updated_at = NOW()`,
    [key, value, category, isSecret, userId],
  );

  // Update process.env so all service clients pick up the new value
  process.env[key] = value;

  // Clear service caches when relevant credentials change
  if (TWILIO_KEYS.includes(key)) {
    const { resetTwilioCache } = await import('./twilioClient');
    resetTwilioCache();
  }
  if (STRIPE_KEYS.includes(key)) {
    const { resetStripeSyncCache } = await import('./stripeClient');
    resetStripeSyncCache();
  }
}

/**
 * Delete a setting from the DB and remove it from process.env.
 */
export async function deleteSetting(key: string): Promise<void> {
  await pool.query('DELETE FROM system_settings WHERE key = $1', [key]);
  delete process.env[key];
}

/**
 * Returns all settings from the DB, with secret values masked.
 * Non-secret fields from process.env are included as fallback
 * (so the UI shows current effective values even if only set via .env file).
 */
export async function getAllSettings(): Promise<
  Array<{ key: string; value: string; category: string; is_secret: boolean; source: 'db' | 'env'; updated_at: string | null }>
> {
  const result = await pool.query(
    'SELECT key, value, category, is_secret, updated_at FROM system_settings ORDER BY category, key',
  );

  return result.rows.map((row: any) => ({
    key: row.key,
    value: row.is_secret ? maskSecret(row.value) : row.value,
    category: row.category,
    is_secret: row.is_secret,
    source: 'db' as const,
    updated_at: row.updated_at,
  }));
}

/**
 * Get the current effective value for a setting key.
 * Checks process.env (which includes both .env file and DB-loaded values).
 */
export function getSetting(key: string): string | undefined {
  return process.env[key];
}

function maskSecret(value: string): string {
  if (!value || value.length <= 4) return '••••';
  return '••••••' + value.slice(-4);
}
