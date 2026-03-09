import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateCollectionDates, previewDriverSync, runAutomatedSync } from '../optimoSyncService';
import * as collectionDayDetector from '../collectionDayDetector';
import * as optimo from '../optimoRouteClient';
import { storage } from '../storage';
import { pool } from '../db';

// Mock dependencies
vi.mock('../storage');
vi.mock('../optimoRouteClient');
vi.mock('../db');
vi.mock('../notificationService');
vi.mock('../collectionDayOptimizer');
// We spy on collectionDayDetector instead of mocking the whole module
// so that the original implementation is used by default in other tests.
vi.mock('../collectionDayDetector', async (importOriginal) => {
    const original = await importOriginal() as typeof collectionDayDetector;
    return {
        ...original,
        // We only mock the functions we need to control for runAutomatedSync tests
        detectAndStoreCollectionDays: vi.fn(),
    };
});


// ---------------------------------------------------------------------------
// generateCollectionDates
// ---------------------------------------------------------------------------
describe('generateCollectionDates', () => {
    // Use a fixed "today" so tests are deterministic
    beforeEach(() => {
        // Pin to Wednesday 2026-02-25
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-25T10:00:00'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });


    it('returns empty array for invalid day name', () => {
        expect(generateCollectionDates('invalidday', 'weekly')).toEqual([]);
    });

    it('generates ~4 weekly dates in a 28-day window', () => {
        // Next Thursday after Feb 25 (Wed) is Feb 26
        const dates = generateCollectionDates('thursday', 'weekly', 28);
        expect(dates.length).toBe(4);
        expect(dates[0]).toBe('2026-02-26');
        expect(dates[1]).toBe('2026-03-05');
        expect(dates[2]).toBe('2026-03-12');
        expect(dates[3]).toBe('2026-03-19');
    });

    it('generates ~2 bi-weekly dates in a 28-day window', () => {
        const dates = generateCollectionDates('thursday', 'bi-weekly', 28);
        expect(dates.length).toBe(2);
        // First is next Thursday (Feb 26), second 14 days later (Mar 12)
        expect(dates[0]).toBe('2026-02-26');
        expect(dates[1]).toBe('2026-03-12');
    });

    it('generates 1 monthly date in a 28-day window', () => {
        const dates = generateCollectionDates('thursday', 'monthly', 28);
        expect(dates.length).toBe(1);
        expect(dates[0]).toBe('2026-02-26');
    });

    it('generates more dates with a larger window', () => {
        const dates = generateCollectionDates('monday', 'weekly', 56);
        // Next Monday after Feb 25 is Mar 2, then Mar 9, 16, 23, 30, Apr 6, 13, 20
        expect(dates.length).toBe(8);
        expect(dates[0]).toBe('2026-03-02');
    });

    it('skips today even if today matches the pickup day', () => {
        // Today is Wednesday — pickup day is wednesday
        const dates = generateCollectionDates('wednesday', 'weekly', 28);
        // Should start from next Wednesday (Mar 4), not today
        expect(dates[0]).toBe('2026-03-04');
    });

    it('handles case-insensitive day names', () => {
        const upper = generateCollectionDates('FRIDAY', 'weekly', 28);
        const lower = generateCollectionDates('friday', 'weekly', 28);
        const mixed = generateCollectionDates('Friday', 'weekly', 28);
        expect(upper).toEqual(lower);
        expect(upper).toEqual(mixed);
    });

    it('aligns bi-weekly dates to anchor date when provided', () => {
        // Anchor on Feb 12 (a Thursday) — next aligned bi-weekly from Feb 26 should be Feb 26 (14 days later)
        const dates = generateCollectionDates('thursday', 'bi-weekly', 28, '2026-02-12');
        expect(dates[0]).toBe('2026-02-26');
        expect(dates[1]).toBe('2026-03-12');
    });

    it('shifts bi-weekly dates when anchor causes off-week', () => {
        // Anchor on Feb 19 (a Thursday) — Feb 26 is only 7 days later (off-week), so should shift to Mar 5
        const dates = generateCollectionDates('thursday', 'bi-weekly', 28, '2026-02-19');
        expect(dates[0]).toBe('2026-03-05');
        expect(dates[1]).toBe('2026-03-19');
    });

    it('returns all dates as YYYY-MM-DD strings', () => {
        const dates = generateCollectionDates('friday', 'weekly', 28);
        for (const d of dates) {
            expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
    });

    it('includes sunday as a valid pickup day', () => {
        const dates = generateCollectionDates('sunday', 'weekly', 14);
        // Next Sunday after Feb 25 (Wed) is Mar 1
        expect(dates[0]).toBe('2026-03-01');
        expect(dates.length).toBeGreaterThanOrEqual(1);
    });
});

describe('previewDriverSync', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-25T22:30:00-05:00'));
        vi.resetAllMocks();
        vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as any);
        vi.mocked(optimo.getRoutes).mockResolvedValue({ routes: [] } as any);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('uses the local calendar date when scanning routes near midnight UTC', async () => {
        vi.mocked(optimo.getRoutes).mockImplementation(async (date: string) => {
            if (date === '2026-02-25') {
                return {
                    routes: [{
                        driverSerial: 'DRV-100',
                        driverName: 'Late Shift Driver',
                        stops: [{ address: '123 Main St' }],
                    }],
                } as any;
            }
            return { routes: [] } as any;
        });

        const result = await previewDriverSync();

        expect(vi.mocked(optimo.getRoutes)).toHaveBeenCalledWith('2026-02-25');
        expect(result.unmatchedOptimo).toHaveLength(1);
        expect(result.unmatchedOptimo[0].serial).toBe('DRV-100');
    });

    it('includes drivers found on upcoming routes in the preview', async () => {
        vi.mocked(optimo.getRoutes).mockImplementation(async (date: string) => {
            if (date === '2026-02-28') {
                return {
                    routes: [{
                        driverSerial: 'DRV-200',
                        driverName: 'Future Driver',
                        stops: [{ address: '500 Oak Ave' }],
                    }],
                } as any;
            }
            return { routes: [] } as any;
        });

        const result = await previewDriverSync();

        expect(vi.mocked(optimo.getRoutes)).toHaveBeenCalledWith('2026-02-28');
        expect(result.unmatchedOptimo).toHaveLength(1);
        expect(result.unmatchedOptimo[0].name).toBe('Future Driver');
    });
});

// ---------------------------------------------------------------------------
// detectCollectionDayFromHistory
// ---------------------------------------------------------------------------
describe('detectCollectionDayFromHistory', () => {
    
  it('returns null when fewer than 3 completed pickups', () => {
    const history = [
      { date: '2026-02-05', status: 'completed' }, // Thursday
      { date: '2026-02-12', status: 'completed' }, // Thursday
    ];
    expect(collectionDayDetector.detectCollectionDayFromHistory(history)).toBeNull();
  });

  it('returns null when all entries are non-completed', () => {
    const history = [
      { date: '2026-02-05', status: 'scheduled' },
      { date: '2026-02-12', status: 'scheduled' },
      { date: '2026-02-19', status: 'missed' },
      { date: '2026-02-26', status: 'cancelled' },
    ];
    expect(collectionDayDetector.detectCollectionDayFromHistory(history)).toBeNull();
  });

  it('detects thursday when all pickups are on thursdays', () => {
    const history = [
      { date: '2026-01-08', status: 'completed' }, // Thursday
      { date: '2026-01-15', status: 'completed' }, // Thursday
      { date: '2026-01-22', status: 'completed' }, // Thursday
      { date: '2026-01-29', status: 'completed' }, // Thursday
    ];
    const result = collectionDayDetector.detectCollectionDayFromHistory(history);
    expect(result).not.toBeNull();
    expect(result!.day).toBe('thursday');
    expect(result!.confidence).toBe(1.0);
  });

  it('detects monday with majority confidence', () => {
    const history = [
      { date: '2026-02-02', status: 'completed' }, // Monday
      { date: '2026-02-09', status: 'completed' }, // Monday
      { date: '2026-02-16', status: 'completed' }, // Monday
      { date: '2026-02-18', status: 'completed' }, // Wednesday (outlier)
    ];
    const result = collectionDayDetector.detectCollectionDayFromHistory(history);
    expect(result).not.toBeNull();
    expect(result!.day).toBe('monday');
    expect(result!.confidence).toBe(0.75);
  });

  it('returns null when no clear majority (confidence < 0.5)', () => {
    // 2 Mondays, 2 Tuesdays, 1 Wednesday — no day reaches 50%
    const history = [
      { date: '2026-02-02', status: 'completed' }, // Monday
      { date: '2026-02-03', status: 'completed' }, // Tuesday
      { date: '2026-02-09', status: 'completed' }, // Monday
      { date: '2026-02-10', status: 'completed' }, // Tuesday
      { date: '2026-02-04', status: 'completed' }, // Wednesday
    ];
    const result = collectionDayDetector.detectCollectionDayFromHistory(history);
    // Monday and Tuesday each have 2/5 = 0.4 < 0.5
    expect(result).toBeNull();
  });

  it('ignores non-completed statuses in day counting', () => {
    const history = [
      { date: '2026-02-06', status: 'completed' }, // Friday
      { date: '2026-02-13', status: 'completed' }, // Friday
      { date: '2026-02-20', status: 'completed' }, // Friday
      { date: '2026-02-09', status: 'scheduled' }, // Monday — not counted
      { date: '2026-02-10', status: 'missed' },    // Tuesday — not counted
    ];
    const result = collectionDayDetector.detectCollectionDayFromHistory(history);
    expect(result).not.toBeNull();
    expect(result!.day).toBe('friday');
    expect(result!.confidence).toBe(1.0);
  });

  it('handles empty history array', () => {
    expect(collectionDayDetector.detectCollectionDayFromHistory([])).toBeNull();
  });

  it('correctly identifies saturday pickups', () => {
    const history = [
      { date: '2026-02-07', status: 'completed' }, // Saturday
      { date: '2026-02-14', status: 'completed' }, // Saturday
      { date: '2026-02-21', status: 'completed' }, // Saturday
    ];
    const result = collectionDayDetector.detectCollectionDayFromHistory(history);
    expect(result).not.toBeNull();
    expect(result!.day).toBe('saturday');
  });
});

describe('runAutomatedSync', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-25T10:00:00'));

        // Reset mocks before each test
        vi.resetAllMocks();

        // Default mocks for a clean run
        vi.mocked(storage.createSyncLogEntry).mockResolvedValue('log-123');
        vi.mocked(storage.getLocationsForSync).mockResolvedValue([]);
        vi.mocked(storage.getOrphanedSyncLocationIds).mockResolvedValue([]);
        vi.mocked(storage.getFutureSyncOrdersForLocation).mockResolvedValue([]);
        vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as any);
        vi.mocked(optimo.deleteOrders).mockResolvedValue([]);
        vi.mocked(collectionDayDetector.detectAndStoreCollectionDays).mockResolvedValue({ updated: 0, created: 0 });

        // Dynamic mock for createOrUpdateOrders
        vi.mocked(optimo.createOrUpdateOrders).mockImplementation(async (orders) => {
            return [{
                success: true,
                orders: orders.map(o => ({ success: true, orderNo: o.orderNo }))
            }];
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should not create orders for locations without a collection day', async () => {
        const locations = [{ id: 'loc-1', address: '123 Main St', collection_day: null, collection_frequency: 'weekly' }];
        vi.mocked(storage.getLocationsForSync).mockResolvedValue(locations);
        vi.mocked(storage.getApprovedLocationsWithoutCollectionDay).mockResolvedValue([]);

        const result = await runAutomatedSync();

        expect(optimo.createOrUpdateOrders).not.toHaveBeenCalled();
        expect(result.locationsProcessed).toBe(1);
        expect(result.ordersCreated).toBe(0);
        expect(result.ordersSkipped).toBe(1);
    });

    it('should create an order for a location with a collection day', async () => {
        const locations = [{
            id: 'loc-1',
            address: '123 Main St',
            collection_day: 'thursday',
            collection_frequency: 'weekly',
            first_name: 'John',
            last_name: 'Doe',
            email: 'john.doe@example.com',
            latitude: '42.365142',
            longitude: '-71.052882',
        }];
        vi.mocked(storage.getLocationsForSync).mockResolvedValue(locations);
        vi.mocked(storage.getApprovedLocationsWithoutCollectionDay).mockResolvedValue([]);
        vi.mocked(storage.getSyncOrderByOrderNo).mockResolvedValue(null);
        
        const result = await runAutomatedSync();

        expect(optimo.createOrUpdateOrders).toHaveBeenCalledOnce();
        const call = vi.mocked(optimo.createOrUpdateOrders).mock.calls[0][0];
        expect(call).toHaveLength(4); // 4 Thursdays in the next 28 days
        const orderNo = `SYNC-LOC-1-${'20260226'}`;
        expect(call[0].orderNo).toBe(orderNo);
        expect(call[0].location.address).toBe('123 Main St');
        expect(call[0].location.locationNo).toBe('loc-1');
        expect(call[0].location.latitude).toBe(42.365142);
        expect(call[0].location.longitude).toBe(-71.052882);
        expect(call[0].notes).toContain('Auto-synced | weekly collection');

        expect(result.ordersCreated).toBe(4);
        expect(result.ordersSkipped).toBe(0);
    });

    it('should skip orders that already exist in the local ledger', async () => {
        const locations = [{
            id: 'loc-1',
            address: '123 Main St',
            collection_day: 'thursday',
            collection_frequency: 'weekly',
            first_name: 'John',
            last_name: 'Doe',
            latitude: '42.365142',
            longitude: '-71.052882',
        }];
        vi.mocked(storage.getLocationsForSync).mockResolvedValue(locations);
        vi.mocked(storage.getApprovedLocationsWithoutCollectionDay).mockResolvedValue([]);
        
        // Mock that the first two orders already exist
        const orderNo1 = `SYNC-LOC-1-${'20260226'}`;
        const orderNo2 = `SYNC-LOC-1-${'20260305'}`;
        vi.mocked(storage.getSyncOrderByOrderNo)
            .mockImplementation(async (orderNo: string) => {
                if (orderNo === orderNo1 || orderNo === orderNo2) {
                    return { order_no: orderNo, status: 'active' } as any;
                }
                return null;
            });

        const result = await runAutomatedSync();

        expect(optimo.createOrUpdateOrders).toHaveBeenCalledOnce();
        const call = vi.mocked(optimo.createOrUpdateOrders).mock.calls[0][0];
        
        // Only the two new orders should be created
        expect(call).toHaveLength(2);
        const orderNo3 = `SYNC-LOC-1-${'20260312'}`;
        const orderNo4 = `SYNC-LOC-1-${'20260319'}`;
        expect(call[0].orderNo).toBe(orderNo3);
        expect(call[1].orderNo).toBe(orderNo4);

        expect(result.ordersCreated).toBe(2);
        expect(result.ordersSkipped).toBe(2);
    });

    it('should fall back to single-order creation when coordinates are missing', async () => {
        const locations = [{
            id: 'loc-2',
            address: '456 Oak Ave',
            collection_day: 'thursday',
            collection_frequency: 'weekly',
            first_name: 'Jane',
            last_name: 'Doe',
        }];
        vi.mocked(storage.getLocationsForSync).mockResolvedValue(locations);
        vi.mocked(storage.getApprovedLocationsWithoutCollectionDay).mockResolvedValue([]);
        vi.mocked(storage.getSyncOrderByOrderNo).mockResolvedValue(null);
        vi.mocked(optimo.createOrder).mockResolvedValue({ success: true } as any);

        const result = await runAutomatedSync();

        expect(optimo.createOrUpdateOrders).not.toHaveBeenCalled();
        expect(optimo.createOrder).toHaveBeenCalledTimes(4);
        expect(optimo.createOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                orderNo: `SYNC-LOC-2-${'20260226'}`,
                address: '456 Oak Ave',
                locationName: 'Jane Doe',
                locationNo: 'loc-2',
            }),
        );
        expect(result.ordersCreated).toBe(4);
        expect(result.ordersErrored).toBe(0);
    });
});
