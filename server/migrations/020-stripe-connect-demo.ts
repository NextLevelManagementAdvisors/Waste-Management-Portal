/**
 * Migration 020: Stripe Connect Demo Tables
 *
 * Creates tables for the Stripe Connect sample integration:
 * - stripe_connect_accounts: maps Stripe V2 account IDs to display names
 * - stripe_connect_products: maps platform-level products to connected accounts
 *
 * Safe to run multiple times (idempotent via IF NOT EXISTS).
 */

import { pool } from '../db.js';

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Table to store connected account info (V2 accounts).
    // We store the Stripe account ID, display name, and contact email
    // so the storefront can show seller info without calling Stripe.
    await client.query(`
      CREATE TABLE IF NOT EXISTS stripe_connect_accounts (
        stripe_account_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        contact_email TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Table to store products created at the platform level.
    // Each product is associated with a connected account (the seller).
    // When a customer buys a product, funds are transferred to the seller
    // via a destination charge.
    await client.query(`
      CREATE TABLE IF NOT EXISTS stripe_connect_products (
        id SERIAL PRIMARY KEY,
        stripe_product_id TEXT NOT NULL UNIQUE,
        stripe_price_id TEXT,
        connected_account_id TEXT NOT NULL REFERENCES stripe_connect_accounts(stripe_account_id),
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        price_cents INTEGER NOT NULL,
        currency TEXT DEFAULT 'usd',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query('COMMIT');
    console.log('[Migration 020] Stripe Connect demo tables created successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

run().catch((err) => {
  console.error('[Migration 020] Failed:', err);
  process.exit(1);
});
