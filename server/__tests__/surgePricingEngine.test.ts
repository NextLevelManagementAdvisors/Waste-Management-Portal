import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../db';
import { calculateZoneSurges } from '../surgePricingEngine';

describe('calculateZoneSurges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (sql.includes('FROM service_zones WHERE active = true')) {
        return { rows: [{ id: 'zone-1', name: 'North' }] } as any;
      }
      if (sql.includes('FROM locations l')) {
        expect(sql).toContain("l.service_status = 'approved'");
        expect(sql).not.toContain('l.status =');
        return { rows: [{ total_locations: 2, covered_locations: 0 }] } as any;
      }
      if (sql.includes('AS active_drivers')) {
        return { rows: [{ active_drivers: 0, pending_orders: 0 }] } as any;
      }
      if (sql.includes('AS unassigned')) {
        return { rows: [{ unassigned: 0 }] } as any;
      }
      if (sql.includes('AS total_assigned')) {
        return { rows: [{ total_assigned: 1, declined: 0 }] } as any;
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
  });

  it('measures coverage against approved locations', async () => {
    const surges = await calculateZoneSurges();

    expect(surges).toHaveLength(1);
    expect(surges[0]).toMatchObject({
      zoneId: 'zone-1',
      zoneName: 'North',
      multiplier: 1.3,
    });
    expect(surges[0].reasons).toContain('Low coverage: 0%');
  });
});
