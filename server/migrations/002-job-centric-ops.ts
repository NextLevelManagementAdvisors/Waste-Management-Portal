/**
 * Migration: Job-Centric Operations
 *
 * Evolves the operations model from disconnected tabs to a unified job workflow:
 *   - Creates `service_zones` table for geographic grouping
 *   - Creates `job_pickups` junction table linking properties to jobs
 *   - Extends `route_jobs` with job_type, zone, source, optimization, and payment fields
 *   - Adds zone_id, latitude, longitude to `properties`
 *
 * Run: npx tsx --env-file=.env server/migrations/002-job-centric-ops.ts
 */

import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create service_zones table
    await client.query(`
      CREATE TABLE IF NOT EXISTS service_zones (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        center_lat NUMERIC(10,7),
        center_lng NUMERIC(10,7),
        radius_miles NUMERIC(6,2),
        color VARCHAR(7) DEFAULT '#10B981',
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('  Created service_zones table');

    // 2. Extend properties with zone and coordinates
    await client.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES service_zones(id)`);
    await client.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7)`);
    await client.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_properties_zone ON properties(zone_id)`);
    console.log('  Added zone_id, latitude, longitude to properties');

    // 3. Extend route_jobs with job-centric fields
    await client.query(`ALTER TABLE route_jobs ADD COLUMN IF NOT EXISTS job_type VARCHAR(30) DEFAULT 'daily_route'`);
    await client.query(`ALTER TABLE route_jobs ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES service_zones(id)`);
    await client.query(`ALTER TABLE route_jobs ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'manual'`);
    await client.query(`ALTER TABLE route_jobs ADD COLUMN IF NOT EXISTS special_pickup_id UUID REFERENCES special_pickup_requests(id)`);
    await client.query(`ALTER TABLE route_jobs ADD COLUMN IF NOT EXISTS optimo_planning_id VARCHAR(100)`);
    await client.query(`ALTER TABLE route_jobs ADD COLUMN IF NOT EXISTS accepted_bid_id UUID REFERENCES job_bids(id)`);
    await client.query(`ALTER TABLE route_jobs ADD COLUMN IF NOT EXISTS actual_pay NUMERIC(10,2)`);
    await client.query(`ALTER TABLE route_jobs ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'unpaid'`);
    await client.query(`ALTER TABLE route_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_route_jobs_date_status ON route_jobs(scheduled_date, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_route_jobs_zone ON route_jobs(zone_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_route_jobs_type ON route_jobs(job_type)`);
    console.log('  Extended route_jobs with job-centric columns');

    // 4. Create job_pickups junction table
    await client.query(`
      CREATE TABLE IF NOT EXISTS job_pickups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES route_jobs(id) ON DELETE CASCADE,
        property_id UUID NOT NULL REFERENCES properties(id),
        pickup_type VARCHAR(30) DEFAULT 'recurring',
        special_pickup_id UUID REFERENCES special_pickup_requests(id),
        optimo_order_no VARCHAR(100),
        sequence_number INTEGER,
        status VARCHAR(30) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_job_pickups_job ON job_pickups(job_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_job_pickups_property ON job_pickups(property_id)`);
    console.log('  Created job_pickups table');

    await client.query('COMMIT');
    console.log('Migration 002-job-centric-ops completed successfully');
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
