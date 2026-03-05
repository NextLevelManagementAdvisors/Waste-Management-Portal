import type { PoolClient } from 'pg';

/**
 * This migration adds an onboarding status to the providers table
 * to help guide new providers through the setup process.
 */
export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    ALTER TABLE providers
    ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(50) DEFAULT 'pending_territory' NOT NULL;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_providers_onboarding_status ON providers(onboarding_status);
  `);

  // Set existing providers to 'active' so they don't get forced into onboarding
  await client.query(`
    UPDATE providers SET onboarding_status = 'active' WHERE onboarding_status = 'pending_territory';
  `);

  console.log('Added "onboarding_status" to "providers" table.');
}
