/**
 * Migration: Zone Approval & Waitlist Auto-Flagging
 *
 * Adds:
 *   - coverage_flagged_at and coverage_flagged_by_zone to locations table
 *     (tracks when a waitlisted location is flagged as having driver coverage)
 *   - Index on coverage_flagged_at for efficient badge-count queries
 *
 * driver_custom_zones.status column already exists (VARCHAR 20, default 'active').
 * New values 'pending_approval' and 'rejected' are used by application code — no DDL needed.
 *
 * Run: npx tsx --env-file=.env server/migrations/010-zone-approval-waitlist-flag.ts
 */

import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Track when a waitlisted location is flagged as now having driver coverage
    await client.query(`
      ALTER TABLE locations
      ADD COLUMN IF NOT EXISTS coverage_flagged_at TIMESTAMPTZ
    `);

    await client.query(`
      ALTER TABLE locations
      ADD COLUMN IF NOT EXISTS coverage_flagged_by_zone UUID REFERENCES driver_custom_zones(id) ON DELETE SET NULL
    `);

    // Partial index for fast "how many flagged waitlisted locations?" queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_locations_coverage_flagged
      ON locations (coverage_flagged_at)
      WHERE coverage_flagged_at IS NOT NULL
    `);

    await client.query('COMMIT');
    console.log('Migration 010 complete: coverage_flagged_at + coverage_flagged_by_zone added to locations');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration 010 failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
