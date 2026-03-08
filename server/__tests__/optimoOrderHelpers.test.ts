import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../optimoRouteClient', () => ({
  getCompletionDetailsFull: vi.fn(),
}));

import * as optimo from '../optimoRouteClient';
import {
  buildOrderIdentifierBackfill,
  fetchCompletionPayloadsByOrderId,
  findMatchingOptimoRoute,
  getOptimoApiOrderIdentifier,
  getRouteDate,
  isOptimoId,
  normalizeOptimoStatus,
} from '../optimoOrderHelpers';

describe('optimoOrderHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects Optimo ids and normalizes completion payloads for mixed identifiers', async () => {
    vi.mocked(optimo.getCompletionDetailsFull)
      .mockResolvedValueOnce({
        orders: [
          {
            orderNo: 'ROUTE-1',
            data: {
              status: 'success',
              form: { note: 'completed' },
            },
          },
        ],
      } as any)
      .mockResolvedValueOnce({
        orders: [
          {
            id: '57aa5137170b1202d36fd49d839c3530',
            data: {
              status: 'completed',
            },
          },
        ],
      } as any);

    const payloads = await fetchCompletionPayloadsByOrderId([
      'ROUTE-1',
      '57aa5137170b1202d36fd49d839c3530',
    ]);

    expect(isOptimoId('57aa5137170b1202d36fd49d839c3530')).toBe(true);
    expect(isOptimoId('ROUTE-1')).toBe(false);
    expect(vi.mocked(optimo.getCompletionDetailsFull)).toHaveBeenNthCalledWith(1, ['ROUTE-1'], false);
    expect(vi.mocked(optimo.getCompletionDetailsFull)).toHaveBeenNthCalledWith(2, ['57aa5137170b1202d36fd49d839c3530'], true);
    expect(payloads.get('ROUTE-1')).toEqual({
      status: 'success',
      form: { note: 'completed' },
    });
    expect(payloads.get('57aa5137170b1202d36fd49d839c3530')).toEqual({
      status: 'completed',
    });
    expect(normalizeOptimoStatus('success')).toBe('completed');
    expect(normalizeOptimoStatus('on-route')).toBe('in_progress');
  });

  it('builds identifier backfills from imported Optimo routes that only expose order ids', () => {
    const route = {
      id: 'route-1',
      title: 'John Geodicke - 2026-03-06',
      scheduled_date: new Date('2026-03-06T05:00:00.000Z'),
      optimo_route_key: '2026-03-06_John Geodicke',
    };
    const localOrders = [
      {
        id: 'order-1',
        order_number: 1,
        address: '2370 Shenandoah Shores Rd, Front Royal, VA 22630, USA',
        optimo_order_no: null,
      },
      {
        id: 'order-2',
        order_number: 2,
        address: '233 Rollason Dr, Front Royal, VA 22630, USA',
        optimo_order_no: null,
      },
    ];
    const optimoRoutes = [
      {
        driverName: 'John Geodicke',
        stops: [
          {
            id: '57aa5137170b1202d36fd49d839c3530',
            orderNo: '',
            stopNumber: 1,
            address: '2370 Shenandoah Shores Rd, Front Royal, VA 22630, USA',
            scheduledAt: '07:27',
          },
          {
            id: 'ebe738318dbb1c979451b929651e7179',
            orderNo: '',
            stopNumber: 2,
            address: '233 Rollason Dr, Front Royal, VA 22630, USA',
            scheduledAt: '07:31',
          },
        ],
      },
    ];

    expect(getRouteDate(route)).toBe('2026-03-06');
    expect(findMatchingOptimoRoute(route, optimoRoutes)).toEqual(optimoRoutes[0]);
    expect(getOptimoApiOrderIdentifier(optimoRoutes[0].stops[0])).toBe('57aa5137170b1202d36fd49d839c3530');
    expect(buildOrderIdentifierBackfill(route, localOrders, optimoRoutes)).toEqual([
      {
        orderId: 'order-1',
        identifier: '57aa5137170b1202d36fd49d839c3530',
        orderNumber: 1,
        scheduledAt: '07:27',
      },
      {
        orderId: 'order-2',
        identifier: 'ebe738318dbb1c979451b929651e7179',
        orderNumber: 2,
        scheduledAt: '07:31',
      },
    ]);
  });
});
