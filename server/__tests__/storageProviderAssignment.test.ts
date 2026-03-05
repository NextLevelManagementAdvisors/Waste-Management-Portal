import { afterEach, describe, expect, it, vi } from 'vitest';
import { storage } from '../storage';
import { pool } from '../db';

describe('storage provider assignment persistence', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes provider_id and provider_territory_id via setLocationProviderAssignment', async () => {
    const querySpy = vi.spyOn(storage, 'query').mockResolvedValue({
      rows: [{ id: 'loc-1', provider_id: 'prov-1', provider_territory_id: 'terr-1' }],
      rowCount: 1,
    } as any);

    const row = await storage.setLocationProviderAssignment('loc-1', 'prov-1', 'terr-1');

    expect(querySpy).toHaveBeenCalledWith(
      expect.stringContaining('SET provider_id = $1'),
      ['prov-1', 'terr-1', 'loc-1']
    );
    expect(row).toMatchObject({
      id: 'loc-1',
      provider_id: 'prov-1',
      provider_territory_id: 'terr-1',
    });
  });

  it('applies swap reassignment atomically with transaction boundaries', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({}),
      release: vi.fn(),
    };
    vi.spyOn(pool, 'connect').mockResolvedValue(client as any);

    await storage.applySwapProviderReassignment({
      locationAId: 'loc-a',
      newProviderForLocationA: 'prov-b',
      locationBId: 'loc-b',
      newProviderForLocationB: 'prov-a',
    });

    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('SET provider_id = $1, provider_territory_id = NULL'),
      ['prov-b', 'loc-a']
    );
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('SET provider_id = $1, provider_territory_id = NULL'),
      ['prov-a', 'loc-b']
    );
    expect(client.query).toHaveBeenNthCalledWith(4, 'COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
