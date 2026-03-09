import { describe, expect, it } from 'vitest';

import {
  countCompletedRouteOrders,
  getRouteProgressCounts,
} from '../../admin/components/operations/planningCalendarProgress.ts';

describe('planningCalendarProgress', () => {
  it('keeps route summary progress stable after orders are loaded for expansion', () => {
    const route = {
      orderCount: 68,
      estimatedOrders: 68,
      completedOrderCount: 57,
    } as const;

    const orders = Array.from({ length: 68 }, (_, index) => ({
      id: `order-${index + 1}`,
      status: 'completed',
    })) as any;

    expect(getRouteProgressCounts(route, orders)).toEqual({
      orderCount: 68,
      completedOrders: 57,
      derivedCompletedOrders: 68,
    });
  });

  it('derives completed counts from loaded orders when the route summary does not include one', () => {
    const route = {
      orderCount: 4,
      estimatedOrders: 4,
      completedOrderCount: undefined,
    } as const;

    const orders = [
      { id: 'order-1', status: 'pending', optimo_order_no: 'ORD-1' },
      { id: 'order-2', status: 'completed', optimo_order_no: 'ORD-2' },
      { id: 'order-3', status: 'failed', optimo_order_no: 'ORD-3' },
      { id: 'order-4', status: 'pending', optimo_order_no: 'ORD-4' },
    ] as any;

    expect(countCompletedRouteOrders(orders, { 'ORD-4': 'success' })).toBe(3);
    expect(getRouteProgressCounts(route, orders, { 'ORD-4': 'success' })).toEqual({
      orderCount: 4,
      completedOrders: 3,
      derivedCompletedOrders: 3,
    });
  });
});
