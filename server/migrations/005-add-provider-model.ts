import type { PoolClient } from 'pg';

/**
 * This migration introduces the "Provider" model, which is a core part of
 * the "Airbnb of trash" concept. It establishes a business entity (the Provider)
 * that owns territories and employs drivers.
 *
 * - Creates a `providers` table for business entities.
 * - Links `driver_profiles` to a `provider`.
 * - Creates `provider_territories` to replace the driver-centric `driver_custom_zones`.
 * - Links `locations` (customers) to a `provider` for assignment.
 * - Includes a data migration section to transition existing drivers and zones
 *   to the new provider-based structure.
 */
export async function up(client: PoolClient): Promise<void> {
  // === Schema Changes ===

  // 1. Create the `providers` table to represent business entities
  await client.query(`
    CREATE TABLE IF NOT EXISTS providers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(50) DEFAULT 'active' NOT NULL,
      stripe_account_id VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
  console.log('Created "providers" table.');

  // 2. Add `provider_id` to `driver_profiles` to link each driver to a provider
  await client.query(`
    ALTER TABLE driver_profiles
    ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES providers(id) ON DELETE SET NULL;
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_driver_profiles_provider ON driver_profiles(provider_id);
  `);
  console.log('Added "provider_id" to "driver_profiles".');

  // 3. Create the new `provider_territories` table
  await client.query(`
    CREATE TABLE IF NOT EXISTS provider_territories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      zone_type VARCHAR(20) NOT NULL DEFAULT 'polygon',
      polygon_coords JSONB,
      zip_codes TEXT[],
      color VARCHAR(7) DEFAULT '#3B82F6',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      default_pickup_day VARCHAR(10),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_provider_territories_provider ON provider_territories(provider_id);
  `);
  console.log('Created "provider_territories" table.');

  // 4. Add `provider_id` and `provider_territory_id` to `locations` for assignment
  await client.query(`
    ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES providers(id) ON DELETE SET NULL;
  `);
  await client.query(`
    ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS provider_territory_id UUID REFERENCES provider_territories(id) ON DELETE SET NULL;
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_locations_provider ON locations(provider_id);
    CREATE INDEX IF NOT EXISTS idx_locations_territory ON locations(provider_territory_id);
  `);
  console.log('Added "provider_id" and "provider_territory_id" to "locations".');


  // === Data Migration ===

  console.log('Starting data migration to new provider model...');

  // Get all existing drivers that don't have a provider yet
  const driversRes = await client.query(`
    SELECT id, user_id, name
    FROM driver_profiles
    WHERE provider_id IS NULL AND user_id IS NOT NULL
  `);

  if (driversRes.rows.length > 0) {
    console.log(`Found ${driversRes.rows.length} existing drivers to migrate.`);
    for (const driver of driversRes.rows) {
      // Create a new provider for this driver, treating them as an owner-operator
      const providerRes = await client.query(
        `INSERT INTO providers (name, owner_user_id, status)
         VALUES ($1, $2, 'active')
         RETURNING id`,
        [`${driver.name}'s Service`, driver.user_id]
      );
      const newProviderId = providerRes.rows[0].id;

      // Link the driver to their new provider
      await client.query(
        `UPDATE driver_profiles SET provider_id = $1 WHERE id = $2`,
        [newProviderId, driver.id]
      );

      // Migrate their old `driver_custom_zones` to `provider_territories`
      const customZonesRes = await client.query(
        `SELECT id, name, zone_type, polygon_coords, zip_codes, color, status, pickup_day
         FROM driver_custom_zones WHERE driver_id = $1`,
        [driver.id]
      );

      if (customZonesRes.rows.length > 0) {
        for (const zone of customZonesRes.rows) {
          const territoryRes = await client.query(
            `INSERT INTO provider_territories (provider_id, name, zone_type, polygon_coords, zip_codes, color, status, default_pickup_day)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [newProviderId, zone.name, zone.zone_type, zone.polygon_coords, zone.zip_codes, zone.color, zone.status, zone.pickup_day]
          );
          const newTerritoryId = territoryRes.rows[0].id;

          // Update any locations assigned to the old custom zone to point to the new provider and territory
          await client.query(
            `UPDATE locations
             SET provider_id = $1, provider_territory_id = $2
             WHERE coverage_zone_id = $3`,
            [newProviderId, newTerritoryId, zone.id]
          );
        }
      }
    }
    console.log('Finished migrating drivers and their zones to the new provider structure.');
  } else {
    console.log('No existing drivers required migration.');
  }
}
