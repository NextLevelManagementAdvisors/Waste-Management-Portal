/**
 * Migration 014: Drop location_claims table
 *
 * The location claims feature has been removed.
 */
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS location_claims CASCADE');
    await client.query('COMMIT');
    console.log('Migration 014 complete: location_claims table dropped');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration 014 failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
