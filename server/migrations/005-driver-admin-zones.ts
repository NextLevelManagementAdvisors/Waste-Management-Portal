/**
 * Migration: Driver Zones & Admin Zones
 *
 * Adds:
 *   - driver_zone_selections: junction table for drivers selecting service zones
 *   - zone_change_log: audit trail for driver zone changes
 *   - admin_zones: parent grouping of service zones
 *   - admin_zone_id column on service_zones
 *
 * Run: npx tsx --env-file=.env server/migrations/005-driver-admin-zones.ts
 */

import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Driver zone selections (many-to-many: drivers ↔ service_zones)
    await client.query(`
      CREATE TABLE IF NOT EXISTS driver_zone_selections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
        zone_id UUID NOT NULL REFERENCES service_zones(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(driver_id, zone_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dzs_driver ON driver_zone_selections(driver_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dzs_zone ON driver_zone_selections(zone_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dzs_status ON driver_zone_selections(status)`);
    console.log('  Created driver_zone_selections table');

    // 2. Zone change audit log
    await client.query(`
      CREATE TABLE IF NOT EXISTS zone_change_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
        zone_id UUID NOT NULL REFERENCES service_zones(id) ON DELETE CASCADE,
        action VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_zcl_driver ON zone_change_log(driver_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_zcl_zone ON zone_change_log(zone_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_zcl_created ON zone_change_log(created_at DESC)`);
    console.log('  Created zone_change_log table');

    // 3. Admin zones (parent grouping of service/driver zones)
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_zones (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('  Created admin_zones table');

    // 4. Link service_zones to admin_zones
    await client.query(`ALTER TABLE service_zones ADD COLUMN IF NOT EXISTS admin_zone_id UUID REFERENCES admin_zones(id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_zones_admin_zone ON service_zones(admin_zone_id)`);
    console.log('  Added admin_zone_id to service_zones');

    await client.query('COMMIT');
    console.log('Migration 005-driver-admin-zones completed successfully.');
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
