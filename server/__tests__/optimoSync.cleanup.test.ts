import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanupFutureOrdersForLocation } from '../optimoSyncService';
import * as optimo from '../optimoRouteClient';
import { storage } from '../storage';

vi.mock('../storage');
vi.mock('../optimoRouteClient');
vi.mock('../db');
vi.mock('../notificationService');
vi.mock('../collectionDayOptimizer');
vi.mock('../collectionDayDetector', () => ({
  detectAndStoreCollectionDays: vi.fn(),
}));

describe('cleanupFutureOrdersForLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(optimo.deleteOrders).mockResolvedValue(undefined as any);
    vi.mocked(storage.markSyncOrderDeleted).mockResolvedValue(undefined as any);
  });

  it('batch-deletes future orders from OptimoRoute and marks them deleted locally', async () => {
    const futureOrders = [
      { order_no: 'SYNC-AAA-20260310', location_id: 'loc-1', scheduled_date: '2026-03-10' },
      { order_no: 'SYNC-AAA-20260317', location_id: 'loc-1', scheduled_date: '2026-03-17' },
      { order_no: 'SYNC-AAA-20260324', location_id: 'loc-1', scheduled_date: '2026-03-24' },
    ];
    vi.mocked(storage.getFutureSyncOrdersForLocation).mockResolvedValue(futureOrders);

    const result = await cleanupFutureOrdersForLocation('loc-1');

    expect(optimo.deleteOrders).toHaveBeenCalledWith(
      ['SYNC-AAA-20260310', 'SYNC-AAA-20260317', 'SYNC-AAA-20260324'],
      true,
    );
    expect(storage.markSyncOrderDeleted).toHaveBeenCalledTimes(3);
    expect(storage.markSyncOrderDeleted).toHaveBeenCalledWith('SYNC-AAA-20260310');
    expect(storage.markSyncOrderDeleted).toHaveBeenCalledWith('SYNC-AAA-20260317');
    expect(storage.markSyncOrderDeleted).toHaveBeenCalledWith('SYNC-AAA-20260324');
    expect(result).toEqual({ deleted: 3, errors: 0 });
  });

  it('returns {deleted:0, errors:0} when no future orders exist', async () => {
    vi.mocked(storage.getFutureSyncOrdersForLocation).mockResolvedValue([]);

    const result = await cleanupFutureOrdersForLocation('loc-empty');

    expect(optimo.deleteOrders).not.toHaveBeenCalled();
    expect(result).toEqual({ deleted: 0, errors: 0 });
  });

  it('still marks orders deleted locally when OptimoRoute batch delete throws', async () => {
    const futureOrders = [
      { order_no: 'SYNC-BBB-20260310', location_id: 'loc-2', scheduled_date: '2026-03-10' },
      { order_no: 'SYNC-BBB-20260317', location_id: 'loc-2', scheduled_date: '2026-03-17' },
      { order_no: 'SYNC-BBB-20260324', location_id: 'loc-2', scheduled_date: '2026-03-24' },
    ];
    vi.mocked(storage.getFutureSyncOrdersForLocation).mockResolvedValue(futureOrders);
    vi.mocked(optimo.deleteOrders).mockRejectedValue(new Error('OptimoRoute API timeout'));

    const result = await cleanupFutureOrdersForLocation('loc-2');

    // Should still mark each order deleted locally despite API failure
    expect(storage.markSyncOrderDeleted).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ deleted: 3, errors: 0 });
  });

  it('counts markSyncOrderDeleted failures as errors', async () => {
    const futureOrders = [
      { order_no: 'SYNC-CCC-20260310', location_id: 'loc-3', scheduled_date: '2026-03-10' },
      { order_no: 'SYNC-CCC-20260317', location_id: 'loc-3', scheduled_date: '2026-03-17' },
      { order_no: 'SYNC-CCC-20260324', location_id: 'loc-3', scheduled_date: '2026-03-24' },
    ];
    vi.mocked(storage.getFutureSyncOrdersForLocation).mockResolvedValue(futureOrders);
    vi.mocked(storage.markSyncOrderDeleted)
      .mockResolvedValueOnce(undefined as any)
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce(undefined as any);

    const result = await cleanupFutureOrdersForLocation('loc-3');

    expect(result).toEqual({ deleted: 2, errors: 1 });
  });
});
