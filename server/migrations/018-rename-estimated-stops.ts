/**
 * Migration: Rename remaining stop columns to order terminology
 *
 * - routes.estimated_stops → routes.estimated_orders
 * - pay_statements.stop_count → pay_statements.order_count
 *
 * Run: npx tsx --env-file=.env server/migrations/018-rename-estimated-stops.ts
 */

import pg from 'pg';
const { Pool } = pg;

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      ALTER TABLE routes RENAME COLUMN estimated_stops TO estimated_orders;
      ALTER TABLE pay_statements RENAME COLUMN stop_count TO order_count;
    `);
    console.log('Migration 018 complete: renamed estimated_stops → estimated_orders, stop_count → order_count');
  } finally {
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migration 018 failed:', err);
  process.exit(1);
});
