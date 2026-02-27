import type { PoolClient } from 'pg';

export async function up(client: PoolClient): Promise<void> {
  // Rename tables
  await client.query(`ALTER TABLE IF EXISTS route_jobs RENAME TO routes`);
  await client.query(`ALTER TABLE IF EXISTS job_pickups RENAME TO route_stops`);
  await client.query(`ALTER TABLE IF EXISTS job_bids RENAME TO route_bids`);

  // Rename columns in routes (was route_jobs)
  await client.query(`ALTER TABLE routes RENAME COLUMN job_type TO route_type`);

  // Rename columns in route_stops (was job_pickups)
  await client.query(`ALTER TABLE route_stops RENAME COLUMN job_id TO route_id`);
  await client.query(`ALTER TABLE route_stops RENAME COLUMN pickup_type TO order_type`);
  await client.query(`ALTER TABLE route_stops RENAME COLUMN sequence_number TO stop_number`);

  // Rename columns in route_bids (was job_bids)
  await client.query(`ALTER TABLE route_bids RENAME COLUMN job_id TO route_id`);

  // Add OptimoRoute-aligned fields to route_stops
  await client.query(`ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS scheduled_at VARCHAR(20)`);
  await client.query(`ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 15`);
  await client.query(`ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS notes TEXT`);
  await client.query(`ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS location_name VARCHAR(255)`);

  // Rename indexes (IF EXISTS to be safe)
  await client.query(`ALTER INDEX IF EXISTS idx_route_jobs_date_status RENAME TO idx_routes_date_status`);
  await client.query(`ALTER INDEX IF EXISTS idx_route_jobs_zone RENAME TO idx_routes_zone`);
  await client.query(`ALTER INDEX IF EXISTS idx_route_jobs_type RENAME TO idx_routes_type`);
  await client.query(`ALTER INDEX IF EXISTS idx_job_pickups_job RENAME TO idx_route_stops_route`);
  await client.query(`ALTER INDEX IF EXISTS idx_job_pickups_property RENAME TO idx_route_stops_property`);
}
