/**
 * Migration: Route Management Enhancements
 *
 * Adds OptimoRoute sync tracking columns to route_jobs:
 *   - optimo_synced: whether the route's pickups have been pushed to OptimoRoute
 *   - optimo_synced_at: timestamp of last sync
 *
 * Run: npx tsx --env-file=.env server/migrations/003-route-management.ts
 */

import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add optimo sync tracking to route_jobs
    await client.query(`ALTER TABLE route_jobs ADD COLUMN IF NOT EXISTS optimo_synced BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE route_jobs ADD COLUMN IF NOT EXISTS optimo_synced_at TIMESTAMP`);

    await client.query('COMMIT');
    console.log('Migration 003-route-management completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
