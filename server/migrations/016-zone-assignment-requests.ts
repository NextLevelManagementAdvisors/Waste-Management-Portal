/**
 * Migration: Zone Assignment Requests
 *
 * Creates the zone_assignment_requests table for the admin→driver
 * assignment approval workflow. When an admin drags a location into
 * a zone, a request is created for the driver to approve or deny.
 *
 * Also seeds the default deadline setting (72 hours).
 *
 * Run: npx tsx --env-file=.env server/migrations/016-zone-assignment-requests.ts
 */

import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS zone_assignment_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
        zone_id UUID NOT NULL REFERENCES driver_custom_zones(id) ON DELETE CASCADE,
        driver_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
        requested_by UUID NOT NULL REFERENCES users(id),
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        deadline TIMESTAMPTZ NOT NULL,
        response_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        responded_at TIMESTAMPTZ
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_zar_location ON zone_assignment_requests(location_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_zar_zone ON zone_assignment_requests(zone_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_zar_driver ON zone_assignment_requests(driver_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_zar_status ON zone_assignment_requests(status)`);

    // Status check constraint
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_zar_status') THEN
          ALTER TABLE zone_assignment_requests ADD CONSTRAINT chk_zar_status
            CHECK (status IN ('pending','approved','denied','expired','cancelled'));
        END IF;
      END $$
    `);

    // Add coverage_zone_id column to locations (confirmed zone assignment)
    await client.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS coverage_zone_id UUID REFERENCES driver_custom_zones(id) ON DELETE SET NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_locations_coverage_zone ON locations(coverage_zone_id)`);

    // Seed default deadline setting
    await client.query(`
      INSERT INTO system_settings (key, value, category, is_secret)
      VALUES ('ZONE_ASSIGNMENT_DEADLINE_HOURS', '72', 'automation', false)
      ON CONFLICT (key) DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('Migration 016 complete: zone_assignment_requests table created, deadline setting seeded');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration 016 failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
