import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage', () => ({
  storage: {
    query: vi.fn(),
  },
}));

import { analyzeTerritoryOverlaps } from '../territoryAnalysisService';
import { storage } from '../storage';

describe('analyzeTerritoryOverlaps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty list when there are no active polygon territories', async () => {
    vi.mocked(storage.query).mockResolvedValueOnce({ rows: [] } as any);

    const result = await analyzeTerritoryOverlaps();

    expect(result).toEqual([]);
    expect(storage.query).toHaveBeenCalledWith(
      `SELECT id, provider_id, name, polygon_coords FROM provider_territories WHERE status='active' AND polygon_coords IS NOT NULL`
    );
  });
});
