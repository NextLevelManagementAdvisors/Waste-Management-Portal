import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import { registerAdminOptimoRoutes } from '../adminOptimoRoutes';
import * as optimo from '../optimoRouteClient';
import * as optimoSync from '../optimoSyncService';

vi.mock('../adminRoutes', () => ({
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../db', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) },
}));

vi.mock('../storage', () => ({
  storage: {
    getLatestSyncLog: vi.fn(),
    getSyncLogHistory: vi.fn(),
    updateLocationCollectionSchedule: vi.fn(),
  },
}));

vi.mock('../optimoRouteClient', () => ({
  updateDriverParams: vi.fn(),
}));

vi.mock('../optimoSyncService', () => ({
  previewDriverSync: vi.fn(),
  executeDriverSync: vi.fn(),
  previewCustomerOrderSync: vi.fn(),
  executeCustomerOrderSync: vi.fn(),
  runAutomatedSync: vi.fn(),
  cleanupFutureOrdersForLocation: vi.fn(),
}));

vi.mock('../collectionDayDetector', () => ({
  detectAndStoreCollectionDays: vi.fn(),
}));

vi.mock('../optimoImportService', () => ({
  importRoutesFromOptimo: vi.fn(),
  importRoutesForRange: vi.fn(),
}));

describe('adminOptimoRoutes driver payload adapters', () => {
  const app = express();
  app.use(express.json());
  registerAdminOptimoRoutes(app);
  const request = supertest(app);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps local serials to Optimo externalId and returns per-driver errors when unmapped', async () => {
    vi.mocked(optimoSync.previewDriverSync).mockResolvedValue({
      matched: [{ optimoDriver: { serial: 'DRV-1', externalId: 'EXT-1' } }],
      unmatchedOptimo: [],
      unmatchedLocal: [],
    } as any);
    vi.mocked(optimo.updateDriverParams).mockResolvedValue({ success: true, code: 'OK', message: 'saved' } as any);

    const res = await request.post('/api/admin/optimoroute/drivers/push').send({
      drivers: [
        { serial: 'DRV-1', date: '2026-03-05', enabled: true },
        { serial: 'DRV-MISSING', date: '2026-03-05', enabled: true },
        { externalId: 'EXT-2', date: '2026-03-05', enabled: false },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.pushed).toBe(2);
    expect(res.body.failed).toBe(1);
    expect(res.body.success).toBe(false);
    expect(res.body.results).toHaveLength(3);
    expect(res.body.results.find((r: any) => r.serial === 'DRV-MISSING')?.error).toMatch(/No OptimoRoute externalId/i);
    expect(optimo.updateDriverParams).toHaveBeenCalledTimes(2);
    expect(optimo.updateDriverParams).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: 'EXT-1', date: '2026-03-05' })
    );
    expect(optimo.updateDriverParams).not.toHaveBeenCalledWith(
      expect.objectContaining({ serial: 'DRV-1' })
    );
  });

  it('rejects single-driver parameter updates when serial cannot be mapped to externalId', async () => {
    vi.mocked(optimoSync.previewDriverSync).mockResolvedValue({
      matched: [],
      unmatchedOptimo: [],
      unmatchedLocal: [],
    } as any);

    const res = await request
      .put('/api/admin/optimoroute/drivers/DRV-404/parameters')
      .send({ date: '2026-03-05', enabled: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unable to resolve OptimoRoute externalId/i);
  });
});
