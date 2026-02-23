/**
 * Migration: Unified People System
 *
 * Migrates from separate `users` + `drivers` tables to a unified identity model:
 *   - Creates `user_roles` junction table
 *   - Creates `invitations` table
 *   - Renames `drivers` → `driver_profiles`, adds `user_id` link
 *   - Populates user_roles from existing is_admin / driver data
 *   - Creates user accounts for drivers without matching email in users
 *   - Migrates conversation participant IDs from driver_profiles.id → users.id
 *
 * Run: npx tsx server/migrations/001-unified-people.ts
 */

import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create user_roles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL,
        admin_role VARCHAR(50),
        granted_by UUID REFERENCES users(id),
        granted_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (user_id, role)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role)`);

    // 2. Create invitations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS invitations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        roles TEXT[] NOT NULL,
        admin_role VARCHAR(50),
        invited_by UUID NOT NULL REFERENCES users(id),
        token VARCHAR(255) NOT NULL UNIQUE,
        status VARCHAR(50) DEFAULT 'pending',
        accepted_by UUID REFERENCES users(id),
        accepted_at TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token)`);

    // 3. Rename drivers → driver_profiles (if not already done)
    const tableCheck = await client.query(`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'drivers')
    `);
    if (tableCheck.rows[0].exists) {
      // Check if driver_profiles already exists
      const dpCheck = await client.query(`
        SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'driver_profiles')
      `);
      if (!dpCheck.rows[0].exists) {
        await client.query(`ALTER TABLE drivers RENAME TO driver_profiles`);
        console.log('Renamed drivers → driver_profiles');
      }
    }

    // 4. Add user_id column to driver_profiles (if not exists)
    const colCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'driver_profiles' AND column_name = 'user_id'
      )
    `);
    if (!colCheck.rows[0].exists) {
      await client.query(`ALTER TABLE driver_profiles ADD COLUMN user_id UUID REFERENCES users(id)`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_profiles_user_id ON driver_profiles(user_id)`);
      console.log('Added user_id column to driver_profiles');
    }

    // 5. Populate user_roles from existing data
    // Admin users
    const adminResult = await client.query(`
      INSERT INTO user_roles (user_id, role, admin_role)
      SELECT id, 'admin',
        CASE WHEN admin_role = 'superadmin' THEN 'full_admin'
             WHEN admin_role IS NULL THEN 'full_admin'
             ELSE admin_role
        END
      FROM users WHERE is_admin = true
      ON CONFLICT (user_id, role) DO NOTHING
    `);
    console.log(`Inserted ${adminResult.rowCount} admin roles`);

    // Customer roles for all users
    const customerResult = await client.query(`
      INSERT INTO user_roles (user_id, role)
      SELECT id, 'customer' FROM users
      ON CONFLICT (user_id, role) DO NOTHING
    `);
    console.log(`Inserted ${customerResult.rowCount} customer roles`);

    // 6. Link drivers to users
    // First: drivers that already have matching emails in users
    const linkedResult = await client.query(`
      UPDATE driver_profiles dp
      SET user_id = u.id
      FROM users u
      WHERE LOWER(dp.email) = LOWER(u.email)
        AND dp.email IS NOT NULL
        AND dp.user_id IS NULL
    `);
    console.log(`Linked ${linkedResult.rowCount} drivers to existing users by email`);

    // Add driver role for linked users
    await client.query(`
      INSERT INTO user_roles (user_id, role)
      SELECT dp.user_id, 'driver'
      FROM driver_profiles dp
      WHERE dp.user_id IS NOT NULL
      ON CONFLICT (user_id, role) DO NOTHING
    `);

    // 7. Create new users for unlinked drivers
    const unlinked = await client.query(`
      SELECT * FROM driver_profiles WHERE user_id IS NULL
    `);
    console.log(`Found ${unlinked.rows.length} unlinked drivers — creating user accounts`);

    for (const driver of unlinked.rows) {
      const nameParts = (driver.name || 'Unknown').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.slice(1).join(' ') || '';

      const userResult = await client.query(
        `INSERT INTO users (first_name, last_name, email, phone, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [firstName, lastName, driver.email, driver.phone || '', driver.password_hash || null]
      );
      const userId = userResult.rows[0].id;

      await client.query(
        `UPDATE driver_profiles SET user_id = $1 WHERE id = $2`,
        [userId, driver.id]
      );

      await client.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'driver') ON CONFLICT DO NOTHING`,
        [userId]
      );
    }

    // 8. Make user_id NOT NULL (verify all are set first)
    const nullCheck = await client.query(`SELECT COUNT(*) as cnt FROM driver_profiles WHERE user_id IS NULL`);
    if (parseInt(nullCheck.rows[0].cnt) === 0) {
      await client.query(`ALTER TABLE driver_profiles ALTER COLUMN user_id SET NOT NULL`);
      console.log('Set driver_profiles.user_id to NOT NULL');
    } else {
      console.warn(`WARNING: ${nullCheck.rows[0].cnt} driver_profiles still have NULL user_id`);
    }

    // 9. Migrate conversation participant IDs from driver_profiles.id → users.id
    const cpResult = await client.query(`
      UPDATE conversation_participants cp
      SET participant_id = dp.user_id
      FROM driver_profiles dp
      WHERE cp.participant_id = dp.id::text::uuid
        AND cp.participant_type = 'driver'
    `);
    console.log(`Migrated ${cpResult.rowCount} conversation_participants`);

    const msgResult = await client.query(`
      UPDATE messages m
      SET sender_id = dp.user_id
      FROM driver_profiles dp
      WHERE m.sender_id = dp.id
        AND m.sender_type = 'driver'
    `);
    console.log(`Migrated ${msgResult.rowCount} message sender IDs`);

    const convResult = await client.query(`
      UPDATE conversations c
      SET created_by_id = dp.user_id
      FROM driver_profiles dp
      WHERE c.created_by_id = dp.id
        AND c.created_by_type = 'driver'
    `);
    console.log(`Migrated ${convResult.rowCount} conversation created_by IDs`);

    await client.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
