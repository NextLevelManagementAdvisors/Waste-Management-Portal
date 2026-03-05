import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('schema bootstrap coverage for provider marketplace', () => {
  it('includes provider, territory, and swap objects in schema.sql', () => {
    const schemaPath = path.resolve(process.cwd(), 'server/schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS providers/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS provider_territories/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS swap_recommendations/i);
    expect(sql).toMatch(/ALTER TABLE locations ADD COLUMN IF NOT EXISTS provider_id/i);
    expect(sql).toMatch(/ALTER TABLE locations ADD COLUMN IF NOT EXISTS provider_territory_id/i);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_locations_provider/i);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_swap_recommendations_status/i);
  });
});
