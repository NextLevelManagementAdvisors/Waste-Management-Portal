import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage', () => ({
  storage: {
    getRouteByOptimoKey: vi.fn(),
    getDriverByOptimoSerial: vi.fn(),
    createRoute: vi.fn(),
    updateRoute: vi.fn(),
    markRouteSynced: vi.fn(),
    findLocationByAddress: vi.fn(),
    addRouteStops: vi.fn(),
    updateRouteStop: vi.fn(),
  },
}));

vi.mock('../optimoRouteClient', () => ({
  getRoutes: vi.fn(),
  getCompletionDetailsFull: vi.fn(),
}));

import { storage } from '../storage';
import * as optimo from '../optimoRouteClient';
import { importRoutesFromOptimo } from '../optimoImportService';

describe('importRoutesFromOptimo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.getRouteByOptimoKey).mockResolvedValue(null as any);
    vi.mocked(storage.getDriverByOptimoSerial).mockResolvedValue(null as any);
    vi.mocked(storage.createRoute).mockResolvedValue({ id: 'route-1' } as any);
    vi.mocked(storage.updateRoute).mockResolvedValue({} as any);
    vi.mocked(storage.markRouteSynced).mockResolvedValue(undefined as any);
    vi.mocked(storage.findLocationByAddress).mockResolvedValue(null as any);
    vi.mocked(storage.updateRouteStop).mockResolvedValue({} as any);
    vi.mocked(storage.addRouteStops).mockImplementation(async (_routeId: string, stops: any[]) => (
      stops.map((stop, index) => ({
        id: `stop-${index + 1}`,
        ...stop,
      }))
    ) as any);
  });

  it('stores Optimo stop ids when order numbers are blank and applies completion status by id', async () => {
    vi.mocked(optimo.getRoutes).mockResolvedValue({
      routes: [
        {
          driverName: 'John Geodicke',
          stops: [
            {
              id: 'depot-start-id',
              orderNo: '',
              stopNumber: 0,
              address: '137 Silas Ln, Front Royal, VA 22630, USA',
              locationName: 'Depot',
              type: 'start',
            },
            {
              id: '57aa5137170b1202d36fd49d839c3530',
              orderNo: '',
              stopNumber: 1,
              address: '2370 Shenandoah Shores Rd, Front Royal, VA 22630, USA',
              locationName: 'Shenandoah Shores',
            },
            {
              id: 'ebe738318dbb1c979451b929651e7179',
              orderNo: '',
              stopNumber: 2,
              address: '233 Rollason Dr, Front Royal, VA 22630, USA',
              locationName: 'Shenandoah Shores',
            },
            {
              id: 'depot-end-id',
              orderNo: '',
              stopNumber: 3,
              address: '137 Silas Ln, Front Royal, VA 22630, USA',
              locationName: 'Depot',
              type: 'end',
            },
          ],
        },
      ],
    } as any);
    vi.mocked(optimo.getCompletionDetailsFull).mockResolvedValue({
      orders: [
        {
          id: '57aa5137170b1202d36fd49d839c3530',
          data: { status: 'success' },
        },
        {
          id: 'ebe738318dbb1c979451b929651e7179',
          data: { status: 'success' },
        },
      ],
    } as any);

    const result = await importRoutesFromOptimo('2026-03-06');

    expect(storage.addRouteStops).toHaveBeenCalledWith('route-1', [
      expect.objectContaining({
        optimo_order_no: '57aa5137170b1202d36fd49d839c3530',
        stop_number: 1,
      }),
      expect.objectContaining({
        optimo_order_no: 'ebe738318dbb1c979451b929651e7179',
        stop_number: 2,
      }),
    ]);
    expect(optimo.getCompletionDetailsFull).toHaveBeenCalledWith([
      '57aa5137170b1202d36fd49d839c3530',
      'ebe738318dbb1c979451b929651e7179',
    ], true);
    expect(storage.updateRouteStop).toHaveBeenCalledWith('stop-1', { status: 'completed' });
    expect(storage.updateRouteStop).toHaveBeenCalledWith('stop-2', { status: 'completed' });
    expect(storage.updateRoute).toHaveBeenCalledWith('route-1', expect.objectContaining({ status: 'completed' }));
    expect(result.routesImported).toBe(1);
    expect(result.stopsImported).toBe(2);
  });
});
