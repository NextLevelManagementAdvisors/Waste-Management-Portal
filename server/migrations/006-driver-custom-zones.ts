/**
 * Migration: Driver Custom Zones
 *
 * Adds:
 *   - driver_custom_zones: driver-created coverage areas (center + radius)
 *
 * Run: npx tsx --env-file=.env server/migrations/006-driver-custom-zones.ts
 */

import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS driver_custom_zones (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        center_lat NUMERIC(10,7) NOT NULL,
        center_lng NUMERIC(10,7) NOT NULL,
        radius_miles NUMERIC(6,2) NOT NULL DEFAULT 5,
        color VARCHAR(7) DEFAULT '#3B82F6',
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_dcz_driver ON driver_custom_zones(driver_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dcz_status ON driver_custom_zones(status)`);

    await client.query('COMMIT');
    console.log('Migration 006 complete: driver_custom_zones table created');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration 006 failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
