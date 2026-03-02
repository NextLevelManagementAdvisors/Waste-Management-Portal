/**
 * Migration: Entity Naming Unification
 *
 * Renames tables, columns, indexes, and enum-like values to establish
 * consistent entity naming across the entire system:
 *   - "property" → "location"
 *   - "special pickup" → "on-demand"
 *   - "pickup" (recurring) → "collection"
 *   - "missed pickup" → "missed collection"
 *
 * Run: npx tsx --env-file=.env server/migrations/009-entity-rename.ts
 */

import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ═══════════════════════════════════════════════
    // 1. TABLE RENAMES
    // ═══════════════════════════════════════════════
    await client.query(`ALTER TABLE IF EXISTS properties RENAME TO locations`);
    await client.query(`ALTER TABLE IF EXISTS special_pickup_services RENAME TO on_demand_services`);
    await client.query(`ALTER TABLE IF EXISTS special_pickup_requests RENAME TO on_demand_requests`);
    await client.query(`ALTER TABLE IF EXISTS missed_pickup_reports RENAME TO missed_collection_reports`);

    // ═══════════════════════════════════════════════
    // 2. COLUMN RENAMES ON locations (was properties)
    // ═══════════════════════════════════════════════
    // Pickup scheduling → Collection scheduling
    await renameColumn(client, 'locations', 'pickup_day', 'collection_day');
    await renameColumn(client, 'locations', 'pickup_frequency', 'collection_frequency');
    await renameColumn(client, 'locations', 'pickup_day_detected_at', 'collection_day_detected_at');
    await renameColumn(client, 'locations', 'pickup_day_source', 'collection_day_source');

    // ═══════════════════════════════════════════════
    // 3. FK COLUMN RENAMES (property_id → location_id)
    // ═══════════════════════════════════════════════
    await renameColumn(client, 'route_stops', 'property_id', 'location_id');
    await renameColumn(client, 'route_stops', 'special_pickup_id', 'on_demand_request_id');
    await renameColumn(client, 'location_claims', 'property_id', 'location_id');
    await renameColumn(client, 'collection_intents', 'property_id', 'location_id');
    await renameColumn(client, 'driver_feedback', 'property_id', 'location_id');
    await renameColumn(client, 'tip_dismissals', 'property_id', 'location_id');
    await renameColumn(client, 'optimo_sync_orders', 'property_id', 'location_id');
    await renameColumn(client, 'pending_service_selections', 'property_id', 'location_id');
    await renameColumn(client, 'missed_collection_reports', 'property_id', 'location_id');
    await renameColumn(client, 'on_demand_requests', 'property_id', 'location_id');
    await renameColumn(client, 'routes', 'special_pickup_id', 'on_demand_request_id');

    // ═══════════════════════════════════════════════
    // 4. DATE COLUMN RENAMES (pickup_date → collection_date)
    // ═══════════════════════════════════════════════
    // Recurring collection dates
    await renameColumn(client, 'missed_collection_reports', 'pickup_date', 'collection_date');
    await renameColumn(client, 'collection_intents', 'pickup_date', 'collection_date');
    await renameColumn(client, 'driver_feedback', 'pickup_date', 'collection_date');
    await renameColumn(client, 'tip_dismissals', 'pickup_date', 'collection_date');
    // On-demand requests: pickup_date → requested_date
    await renameColumn(client, 'on_demand_requests', 'pickup_date', 'requested_date');

    // ═══════════════════════════════════════════════
    // 5. OPTIMO SYNC LOG — rename field
    // ═══════════════════════════════════════════════
    await renameColumn(client, 'optimo_sync_log', 'properties_processed', 'locations_processed');

    // ═══════════════════════════════════════════════
    // 6. ENUM-LIKE VALUE UPDATES
    // ═══════════════════════════════════════════════
    await client.query(`UPDATE route_stops SET order_type = 'on_demand' WHERE order_type = 'special'`);
    await client.query(`UPDATE routes SET route_type = 'on_demand' WHERE route_type = 'special_pickup'`);
    await client.query(`UPDATE routes SET route_type = 'bulk_collection' WHERE route_type = 'bulk_pickup'`);
    await client.query(`UPDATE routes SET source = 'on_demand' WHERE source = 'special_pickup'`);

    // ═══════════════════════════════════════════════
    // 7. INDEX RENAMES (drop old, create new)
    // ═══════════════════════════════════════════════
    // locations (was properties)
    await client.query(`DROP INDEX IF EXISTS idx_properties_service_status`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_locations_service_status ON locations(service_status)`);
    await client.query(`DROP INDEX IF EXISTS idx_properties_zone`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_locations_zone ON locations(zone_id)`);

    // route_stops
    await client.query(`DROP INDEX IF EXISTS idx_route_stops_property`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_route_stops_location ON route_stops(location_id)`);

    // optimo_sync_orders
    await client.query(`DROP INDEX IF EXISTS idx_optimo_sync_orders_property`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_optimo_sync_orders_location ON optimo_sync_orders(location_id)`);

    // pending_service_selections
    await client.query(`DROP INDEX IF EXISTS idx_pending_selections_property`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pending_selections_location ON pending_service_selections(location_id)`);

    // location_claims unique index
    await client.query(`DROP INDEX IF EXISTS idx_lc_active_property`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_lc_active_location ON location_claims(location_id) WHERE status = 'active'`);

    await client.query('COMMIT');
    console.log('Migration 009 complete: Entity naming unified (property→location, pickup→collection, special_pickup→on_demand)');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration 009 failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

/** Safely rename a column (no-op if source column doesn't exist or target already exists) */
async function renameColumn(client: pg.PoolClient, table: string, oldName: string, newName: string) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, oldName]
  );
  if (rows.length > 0) {
    await client.query(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName}`);
  }
}

migrate();
