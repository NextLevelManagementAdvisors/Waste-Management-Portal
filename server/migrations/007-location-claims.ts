/**
 * Migration: Location Claims (Dual Dispatch)
 *
 * Adds:
 *   - location_claims: drivers claim individual locations as ongoing territory
 *
 * Run: npx tsx --env-file=.env server/migrations/007-location-claims.ts
 */

import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS location_claims (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        driver_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        claimed_at TIMESTAMP DEFAULT NOW(),
        revoked_at TIMESTAMP,
        revoked_by UUID,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Only one active claim per property at a time
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_lc_active_property ON location_claims(property_id) WHERE status = 'active'`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lc_driver ON location_claims(driver_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lc_status ON location_claims(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lc_driver_status ON location_claims(driver_id, status)`);

    await client.query('COMMIT');
    console.log('Migration 007 complete: location_claims table created');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration 007 failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
