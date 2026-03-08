/**
 * Migration: Rename route_stops → route_orders and stop_number → order_number
 *
 * Aligns DB naming with OptimoRoute API conventions where the primary
 * entity is an "order" (identified by orderNo).
 *
 * Run: npx tsx --env-file=.env server/migrations/017-rename-stops-to-orders.ts
 */

import pg from 'pg';
const { Pool } = pg;

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      ALTER TABLE IF EXISTS route_stops RENAME TO route_orders;
      ALTER TABLE route_orders RENAME COLUMN stop_number TO order_number;

      ALTER INDEX IF EXISTS idx_route_stops_route RENAME TO idx_route_orders_route;
      ALTER INDEX IF EXISTS idx_route_stops_location RENAME TO idx_route_orders_location;
    `);
    console.log('Migration 017 complete: renamed route_stops → route_orders, stop_number → order_number');
  } finally {
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migration 017 failed:', err);
  process.exit(1);
});
