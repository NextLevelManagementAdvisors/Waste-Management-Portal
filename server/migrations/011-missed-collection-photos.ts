/**
 * Migration: Add photos column to missed_collection_reports
 *
 * Adds a JSONB photos column (default empty array) to support
 * photo evidence uploads for missed collection reports (C-43).
 *
 * Run: npx tsx --env-file=.env server/migrations/011-missed-collection-photos.ts
 */

import pg from 'pg';
const { Pool } = pg;

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      ALTER TABLE missed_collection_reports
      ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb
    `);
    console.log('Migration 011 complete: added photos column to missed_collection_reports');
  } finally {
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migration 011 failed:', err);
  process.exit(1);
});
