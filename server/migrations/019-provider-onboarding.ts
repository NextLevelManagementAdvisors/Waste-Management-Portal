/**
 * Migration 019: Provider Onboarding & Team Management
 *
 * Seeds default roles for all existing providers and backfills
 * provider_members from driver_profiles.provider_id.
 * Also sets approval_status = 'approved' for existing active providers.
 *
 * Safe to run multiple times (idempotent).
 */

import pool from '../db.js';

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Set approval_status = 'approved' for existing active providers
    await client.query(`
      UPDATE providers
      SET approval_status = 'approved',
          approved_at = NOW()
      WHERE status = 'active'
        AND (approval_status IS NULL OR approval_status = 'draft')
    `);
    console.log('✓ Set approval_status = approved for existing active providers');

    // 2. Seed default roles for providers that don't have any yet
    const { rows: providers } = await client.query(`
      SELECT p.id
      FROM providers p
      WHERE NOT EXISTS (
        SELECT 1 FROM provider_roles pr WHERE pr.provider_id = p.id
      )
    `);

    for (const provider of providers) {
      const providerId = provider.id;

      // Owner role — all permissions
      const ownerPermissions = {
        execute_routes: true,
        dispatch_routes: true,
        manage_members: true,
        manage_fleet: true,
        manage_billing: true,
        view_team_schedule: true,
        view_team_routes: true,
        view_earnings_report: true,
      };

      // Driver role — execute only
      const driverPermissions = {
        execute_routes: true,
        dispatch_routes: false,
        manage_members: false,
        manage_fleet: false,
        manage_billing: false,
        view_team_schedule: false,
        view_team_routes: false,
        view_earnings_report: false,
      };

      await client.query(
        `INSERT INTO provider_roles (provider_id, name, permissions, is_owner_role, is_default_role)
         VALUES ($1, 'Owner', $2, TRUE, FALSE)
         ON CONFLICT DO NOTHING`,
        [providerId, JSON.stringify(ownerPermissions)]
      );

      await client.query(
        `INSERT INTO provider_roles (provider_id, name, permissions, is_owner_role, is_default_role)
         VALUES ($1, 'Driver', $2, FALSE, TRUE)
         ON CONFLICT DO NOTHING`,
        [providerId, JSON.stringify(driverPermissions)]
      );
    }
    console.log(`✓ Seeded default roles for ${providers.length} providers`);

    // 3. Add owner as provider_member with Owner role
    const { rows: ownerMemberships } = await client.query(`
      SELECT p.id AS provider_id, p.owner_user_id,
             pr.id AS owner_role_id
      FROM providers p
      JOIN provider_roles pr ON pr.provider_id = p.id AND pr.is_owner_role = TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM provider_members pm
        WHERE pm.provider_id = p.id AND pm.user_id = p.owner_user_id
      )
    `);

    for (const row of ownerMemberships) {
      await client.query(
        `INSERT INTO provider_members (provider_id, user_id, role_id, employment_type, status)
         VALUES ($1, $2, $3, 'contractor', 'active')
         ON CONFLICT (provider_id, user_id) DO NOTHING`,
        [row.provider_id, row.owner_user_id, row.owner_role_id]
      );
    }
    console.log(`✓ Added ${ownerMemberships.length} owner memberships`);

    // 4. Backfill provider_members from driver_profiles.provider_id
    const { rows: driverMemberships } = await client.query(`
      SELECT dp.provider_id, dp.user_id,
             pr.id AS driver_role_id
      FROM driver_profiles dp
      JOIN provider_roles pr ON pr.provider_id = dp.provider_id AND pr.is_default_role = TRUE
      WHERE dp.provider_id IS NOT NULL
        AND dp.user_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM provider_members pm
          WHERE pm.provider_id = dp.provider_id AND pm.user_id = dp.user_id
        )
    `);

    for (const row of driverMemberships) {
      await client.query(
        `INSERT INTO provider_members (provider_id, user_id, role_id, employment_type, status)
         VALUES ($1, $2, $3, 'contractor', 'active')
         ON CONFLICT (provider_id, user_id) DO NOTHING`,
        [row.provider_id, row.user_id, row.driver_role_id]
      );
    }
    console.log(`✓ Backfilled ${driverMemberships.length} driver memberships from driver_profiles`);

    // 5. Ensure provider owners have 'provider_owner' in user_roles
    const { rows: ownerRoleUpdates } = await client.query(`
      SELECT p.owner_user_id
      FROM providers p
      WHERE NOT EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = p.owner_user_id AND ur.role = 'provider_owner'
      )
    `);

    for (const row of ownerRoleUpdates) {
      await client.query(
        `INSERT INTO user_roles (user_id, role)
         VALUES ($1, 'provider_owner')
         ON CONFLICT DO NOTHING`,
        [row.owner_user_id]
      );
    }
    console.log(`✓ Added provider_owner role to ${ownerRoleUpdates.length} users`);

    await client.query('COMMIT');
    console.log('✓ Migration 019 complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration 019 failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
