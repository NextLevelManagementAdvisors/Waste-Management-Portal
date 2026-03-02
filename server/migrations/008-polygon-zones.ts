/**
 * Migration: Polygon & ZIP Code Zones
 *
 * Adds:
 *   - zone_type column to driver_custom_zones ('circle' | 'polygon' | 'zip')
 *   - polygon_coords JSONB column for polygon vertex storage
 *   - zip_codes TEXT[] column for ZIP code references
 *   - Drops NOT NULL on circle-specific columns so polygon/zip zones don't need fake values
 *
 * Run: npx tsx --env-file=.env server/migrations/008-polygon-zones.ts
 */

import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Zone type discriminator
    await client.query(`
      ALTER TABLE driver_custom_zones
      ADD COLUMN IF NOT EXISTS zone_type VARCHAR(20) NOT NULL DEFAULT 'circle'
    `);

    // Polygon coordinate storage (array of [lat, lng] pairs)
    await client.query(`
      ALTER TABLE driver_custom_zones
      ADD COLUMN IF NOT EXISTS polygon_coords JSONB
    `);

    // ZIP codes that compose this zone
    await client.query(`
      ALTER TABLE driver_custom_zones
      ADD COLUMN IF NOT EXISTS zip_codes TEXT[]
    `);

    // Allow circle-specific columns to be NULL for polygon/zip zones
    await client.query(`ALTER TABLE driver_custom_zones ALTER COLUMN center_lat DROP NOT NULL`);
    await client.query(`ALTER TABLE driver_custom_zones ALTER COLUMN center_lng DROP NOT NULL`);
    await client.query(`ALTER TABLE driver_custom_zones ALTER COLUMN radius_miles DROP NOT NULL`);

    // Index for zone type filtering
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dcz_type ON driver_custom_zones(zone_type)`);

    await client.query('COMMIT');
    console.log('Migration 008 complete: polygon_coords, zip_codes, zone_type added to driver_custom_zones');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration 008 failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
