/**
 * Migration: Zone Pickup Day
 *
 * Adds pickup_day column to driver_custom_zones table.
 * Allows admins to configure a default collection day per zone,
 * used as a fallback when route-based optimization has no data.
 *
 * Also widens locations.collection_day_source from VARCHAR(20) to VARCHAR(30)
 * to accommodate 'feasibility_confirmed' (21 chars) which previously was silently truncated.
 *
 * Run: npx tsx --env-file=.env server/migrations/015-zone-pickup-day.ts
 */

import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE driver_custom_zones
      ADD COLUMN IF NOT EXISTS pickup_day VARCHAR(10)
    `);

    // Widen collection_day_source to fit 'feasibility_confirmed' (21 chars)
    await client.query(`
      ALTER TABLE locations
      ALTER COLUMN collection_day_source TYPE VARCHAR(30)
    `);

    await client.query('COMMIT');
    console.log('Migration 015 complete: pickup_day added to driver_custom_zones, collection_day_source widened');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration 015 failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
