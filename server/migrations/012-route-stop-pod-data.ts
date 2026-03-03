/**
 * Migration: Add pod_data column to route_stops
 *
 * Stores proof-of-delivery form data (images, signature, notes) from
 * OptimoRoute's get_completion_details API response.
 *
 * Run: npx tsx --env-file=.env server/migrations/012-route-stop-pod-data.ts
 */

import pg from 'pg';
const { Pool } = pg;

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      ALTER TABLE route_stops
      ADD COLUMN IF NOT EXISTS pod_data JSONB DEFAULT NULL
    `);
    console.log('Migration 012 complete: added pod_data column to route_stops');
  } finally {
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migration 012 failed:', err);
  process.exit(1);
});
