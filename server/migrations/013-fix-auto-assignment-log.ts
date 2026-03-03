/**
 * Migration: Fix auto_assignment_log column types
 *
 * The table was originally created with INTEGER columns for location_id and
 * route_id, referencing the wrong table (service_locations). This migration
 * corrects them to UUID and points location_id at locations(id).
 *
 * Safe/idempotent — does nothing if columns are already UUID.
 *
 * Run: npx tsx --env-file=.env server/migrations/013-fix-auto-assignment-log.ts
 */

import pg from 'pg';
const { Pool } = pg;

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'auto_assignment_log'
    `);
    if (tableCheck.rows.length === 0) {
      console.log('Migration 013: auto_assignment_log table does not exist, skipping');
      return;
    }

    // Check current column types
    const colCheck = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'auto_assignment_log'
        AND column_name IN ('location_id', 'route_id')
    `);

    const colTypes = new Map(colCheck.rows.map((r: any) => [r.column_name, r.data_type]));
    let changed = false;

    await pool.query('BEGIN');

    // Fix location_id: INTEGER → UUID, service_locations → locations
    if (colTypes.get('location_id') === 'integer') {
      // Drop old FK constraint (name may vary, drop all FKs on this column)
      const fkResult = await pool.query(`
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'auto_assignment_log'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.column_name = 'location_id'
      `);
      for (const fk of fkResult.rows) {
        await pool.query(`ALTER TABLE auto_assignment_log DROP CONSTRAINT ${fk.constraint_name}`);
        console.log(`  Dropped FK constraint: ${fk.constraint_name}`);
      }

      // Clear existing data (INTEGER values can't be cast to UUID)
      await pool.query(`UPDATE auto_assignment_log SET location_id = NULL WHERE location_id IS NOT NULL`);

      // Change column type
      await pool.query(`ALTER TABLE auto_assignment_log ALTER COLUMN location_id TYPE UUID USING NULL`);
      await pool.query(`ALTER TABLE auto_assignment_log ADD CONSTRAINT aal_location_fk FOREIGN KEY (location_id) REFERENCES locations(id)`);
      console.log('  Fixed location_id: INTEGER → UUID, FK → locations(id)');
      changed = true;
    }

    // Fix route_id: INTEGER → UUID
    if (colTypes.get('route_id') === 'integer') {
      const fkResult = await pool.query(`
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'auto_assignment_log'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.column_name = 'route_id'
      `);
      for (const fk of fkResult.rows) {
        await pool.query(`ALTER TABLE auto_assignment_log DROP CONSTRAINT ${fk.constraint_name}`);
        console.log(`  Dropped FK constraint: ${fk.constraint_name}`);
      }

      await pool.query(`UPDATE auto_assignment_log SET route_id = NULL WHERE route_id IS NOT NULL`);
      await pool.query(`ALTER TABLE auto_assignment_log ALTER COLUMN route_id TYPE UUID USING NULL`);
      await pool.query(`ALTER TABLE auto_assignment_log ADD CONSTRAINT aal_route_fk FOREIGN KEY (route_id) REFERENCES routes(id)`);
      console.log('  Fixed route_id: INTEGER → UUID, FK → routes(id)');
      changed = true;
    }

    await pool.query('COMMIT');

    if (changed) {
      console.log('Migration 013 complete: fixed auto_assignment_log column types');
    } else {
      console.log('Migration 013: columns already correct (UUID), nothing to do');
    }
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migration 013 failed:', err);
  process.exit(1);
});
