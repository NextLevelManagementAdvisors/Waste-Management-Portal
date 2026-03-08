import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage', () => ({
  storage: {
    query: vi.fn(),
    getRouteByOptimoKey: vi.fn(),
    getRouteById: vi.fn(),
    getDriverByOptimoSerial: vi.fn(),
    createRoute: vi.fn(),
    updateRoute: vi.fn(),
    markRouteSynced: vi.fn(),
    findLocationByAddress: vi.fn(),
    addRouteStops: vi.fn(),
    getRouteStops: vi.fn(),
    updateRouteStop: vi.fn(),
    removeRouteStop: vi.fn(),
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
  const routesById = new Map<string, any>();
  const routeStopsByRoute = new Map<string, any[]>();
  const driverNameMatches = new Map<string, any[]>();
  let nextRouteId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
    routesById.clear();
    routeStopsByRoute.clear();
    driverNameMatches.clear();
    nextRouteId = 1;

    vi.mocked(storage.query).mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('FROM driver_profiles') && sql.includes('LOWER(TRIM(name))')) {
        const name = String(params?.[0] || '').trim().toLowerCase();
        return { rows: driverNameMatches.get(name) || [] } as any;
      }

      if (sql.includes('FROM routes r') && sql.includes('rs.optimo_order_no = ANY')) {
        const date = params?.[0];
        const identifiers = Array.isArray(params?.[1]) ? params?.[1] : [];
        const rows = Array.from(routesById.values())
          .filter(route => route.scheduled_date === date && route.source === 'optimo_import')
          .map(route => ({
            id: route.id,
            matched_stop_count: (routeStopsByRoute.get(route.id) || []).filter(stop => identifiers.includes(stop.optimo_order_no)).length,
          }))
          .filter(row => row.matched_stop_count > 0)
          .sort((a, b) => b.matched_stop_count - a.matched_stop_count);
        return { rows: rows.slice(0, 1) } as any;
      }

      return { rows: [] } as any;
    });

    vi.mocked(storage.getRouteByOptimoKey).mockImplementation(async (key: string) => {
      return Array.from(routesById.values()).find(route => route.optimo_route_key === key) || null;
    });

    vi.mocked(storage.getRouteById).mockImplementation(async (routeId: string) => {
      return routesById.get(routeId) || null;
    });

    vi.mocked(storage.getDriverByOptimoSerial).mockResolvedValue(null as any);

    vi.mocked(storage.createRoute).mockImplementation(async (data: any) => {
      const routeId = `route-${nextRouteId++}`;
      const route = { id: routeId, ...data };
      routesById.set(routeId, route);
      return route as any;
    });

    vi.mocked(storage.updateRoute).mockImplementation(async (routeId: string, data: any) => {
      const current = routesById.get(routeId) || { id: routeId };
      const updated = { ...current, ...data };
      routesById.set(routeId, updated);
      return updated as any;
    });

    vi.mocked(storage.markRouteSynced).mockResolvedValue(undefined as any);

    vi.mocked(storage.findLocationByAddress).mockResolvedValue(null as any);

    vi.mocked(storage.addRouteStops).mockImplementation(async (routeId: string, stops: any[]) => {
      const existing = routeStopsByRoute.get(routeId) || [];
      const inserted = stops.map((stop, index) => ({
        id: `${routeId}-stop-${existing.length + index + 1}`,
        route_id: routeId,
        status: 'pending',
        ...stop,
      }));
      routeStopsByRoute.set(routeId, [...existing, ...inserted]);
      return inserted as any;
    });

    vi.mocked(storage.getRouteStops).mockImplementation(async (routeId: string) => {
      return [...(routeStopsByRoute.get(routeId) || [])] as any;
    });

    vi.mocked(storage.updateRouteStop).mockImplementation(async (stopId: string, data: any) => {
      for (const [routeId, stops] of routeStopsByRoute.entries()) {
        const index = stops.findIndex(stop => stop.id === stopId);
        if (index === -1) continue;
        const updated = { ...stops[index], ...data };
        const nextStops = [...stops];
        nextStops[index] = updated;
        routeStopsByRoute.set(routeId, nextStops);
        return updated as any;
      }
      return null as any;
    });

    vi.mocked(storage.removeRouteStop).mockImplementation(async (stopId: string) => {
      for (const [routeId, stops] of routeStopsByRoute.entries()) {
        routeStopsByRoute.set(routeId, stops.filter(stop => stop.id !== stopId));
      }
    });
  });

  it('stores Optimo stop ids, scheduled times, and applies completion status by id', async () => {
    vi.mocked(optimo.getRoutes).mockResolvedValue({
      routes: [
        {
          driverName: 'John Geodicke',
          startTime: { localTime: '07:00' },
          endTime: { localTime: '09:30' },
          duration: 150,
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
              scheduledAt: '07:27',
              address: '2370 Shenandoah Shores Rd, Front Royal, VA 22630, USA',
              locationName: 'Shenandoah Shores',
            },
            {
              id: 'ebe738318dbb1c979451b929651e7179',
              orderNo: '',
              stopNumber: 2,
              scheduledAt: '08:03',
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
        scheduled_at: '07:27',
      }),
      expect.objectContaining({
        optimo_order_no: 'ebe738318dbb1c979451b929651e7179',
        stop_number: 2,
        scheduled_at: '08:03',
      }),
    ]);
    expect(optimo.getCompletionDetailsFull).toHaveBeenCalledWith([
      '57aa5137170b1202d36fd49d839c3530',
      'ebe738318dbb1c979451b929651e7179',
    ], true);
    expect(routesById.get('route-1')).toEqual(expect.objectContaining({
      start_time: '07:00',
      end_time: '09:30',
      status: 'completed',
    }));
    expect(routeStopsByRoute.get('route-1')).toEqual([
      expect.objectContaining({ id: 'route-1-stop-1', status: 'completed' }),
      expect.objectContaining({ id: 'route-1-stop-2', status: 'completed' }),
    ]);
    expect(result.routesImported).toBe(1);
    expect(result.routesUpdated).toBe(0);
    expect(result.stopsImported).toBe(2);
  });

  it('updates existing imported routes and re-syncs driver-facing stop data', async () => {
    routesById.set('route-existing', {
      id: 'route-existing',
      title: 'Old Driver - 2026-03-10',
      scheduled_date: '2026-03-10',
      source: 'optimo_import',
      status: 'assigned',
      assigned_driver_id: 'driver-old',
      optimo_route_key: '2026-03-10_Old Driver',
    });
    routeStopsByRoute.set('route-existing', [
      {
        id: 'stop-1',
        route_id: 'route-existing',
        location_id: 'loc-1',
        address: '123 Main St',
        location_name: 'Old Main',
        optimo_order_no: 'old-id',
        stop_number: 1,
        status: 'pending',
        order_type: 'recurring',
      },
      {
        id: 'stop-obsolete',
        route_id: 'route-existing',
        location_id: 'loc-old',
        address: '999 Old Rd',
        location_name: 'Old Stop',
        optimo_order_no: 'obsolete-id',
        stop_number: 2,
        status: 'pending',
        order_type: 'recurring',
      },
    ]);
    driverNameMatches.set('new driver', [{ id: 'driver-new' }]);

    vi.mocked(storage.findLocationByAddress).mockImplementation(async (address: string) => {
      if (address === '123 Main St') return { id: 'loc-1' } as any;
      if (address === '456 Oak Ave') return { id: 'loc-2' } as any;
      return null as any;
    });
    vi.mocked(optimo.getRoutes).mockResolvedValue({
      routes: [
        {
          driverName: 'New Driver',
          startTime: { localTime: '08:00' },
          endTime: { localTime: '11:00' },
          duration: 180,
          stops: [
            {
              id: 'old-id',
              orderNo: '',
              stopNumber: 2,
              scheduledAt: '08:15',
              address: '123 Main St',
              locationName: 'Main Stop',
            },
            {
              id: 'new-id',
              orderNo: '',
              stopNumber: 3,
              scheduledAt: '09:00',
              address: '456 Oak Ave',
              locationName: 'Oak Stop',
            },
          ],
        },
      ],
    } as any);
    vi.mocked(optimo.getCompletionDetailsFull).mockResolvedValue({
      orders: [
        { id: 'old-id', data: { status: 'on_route' } },
        { id: 'new-id', data: { status: 'scheduled' } },
      ],
    } as any);

    const result = await importRoutesFromOptimo('2026-03-10');

    expect(result.routesImported).toBe(0);
    expect(result.routesUpdated).toBe(1);
    expect(routesById.get('route-existing')).toEqual(expect.objectContaining({
      title: 'New Driver - 2026-03-10',
      assigned_driver_id: 'driver-new',
      start_time: '08:00',
      end_time: '11:00',
      optimo_route_key: '2026-03-10_New Driver',
      status: 'in_progress',
    }));
    expect(storage.updateRouteStop).toHaveBeenCalledWith('stop-1', expect.objectContaining({
      stop_number: 2,
      scheduled_at: '08:15',
      location_name: 'Main Stop',
    }));
    expect(storage.addRouteStops).toHaveBeenCalledWith('route-existing', [
      expect.objectContaining({
        location_id: 'loc-2',
        address: '456 Oak Ave',
        optimo_order_no: 'new-id',
        stop_number: 3,
        scheduled_at: '09:00',
      }),
    ]);
    expect(storage.removeRouteStop).toHaveBeenCalledWith('stop-obsolete');
    expect(routeStopsByRoute.get('route-existing')).toEqual([
      expect.objectContaining({
        id: 'stop-1',
        optimo_order_no: 'old-id',
        stop_number: 2,
        scheduled_at: '08:15',
        status: 'in_progress',
      }),
      expect.objectContaining({
        optimo_order_no: 'new-id',
        status: 'scheduled',
      }),
    ]);
  });
});
