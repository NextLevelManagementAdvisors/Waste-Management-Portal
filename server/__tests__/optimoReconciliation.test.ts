import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../optimoRouteClient', () => ({
  searchOrders: vi.fn(),
  getSchedulingInfo: vi.fn(),
  getCompletionDetailsFull: vi.fn(),
}));

import { reconcileDeletedOrders } from '../optimoOrderHelpers';
import * as optimo from '../optimoRouteClient';

const mockStorage = {
  updateRouteOrder: vi.fn().mockResolvedValue({}),
};

describe('reconcileDeletedOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects order deleted in OptimoRoute and updates order status', async () => {
    vi.mocked(optimo.searchOrders).mockResolvedValue({
      orders: [{ orderNo: 'ROUTE-other-order' }],
    });
    vi.mocked(optimo.getSchedulingInfo).mockResolvedValue({
      success: true,
      orderScheduled: false,
    });

    const orders = [
      { id: 'order-1', optimo_order_no: 'ROUTE-12345678-aaa', status: 'scheduled' },
    ];

    const result = await reconcileDeletedOrders('2026-03-09', orders, mockStorage);

    expect(result).toEqual({ deleted: 1, rescheduled: 0, unchanged: 0 });
    expect(mockStorage.updateRouteOrder).toHaveBeenCalledWith('order-1', {
      status: 'deleted_in_optimo',
      notes: 'Deleted from OptimoRoute externally',
    });
  });

  it('detects order rescheduled in OptimoRoute', async () => {
    vi.mocked(optimo.searchOrders).mockResolvedValue({
      orders: [{ orderNo: 'ROUTE-other-order' }],
    });
    vi.mocked(optimo.getSchedulingInfo).mockResolvedValue({
      success: true,
      orderScheduled: true,
      scheduleInformation: {
        stopNumber: 1,
        scheduledAt: '14:00',
        scheduledAtDt: '2026-03-12T14:00:00',
        driverSerial: 'DRV-1',
      },
    });

    const orders = [
      { id: 'order-2', optimo_order_no: 'ROUTE-12345678-bbb', status: 'pending' },
    ];

    const result = await reconcileDeletedOrders('2026-03-09', orders, mockStorage);

    expect(result).toEqual({ deleted: 0, rescheduled: 1, unchanged: 0 });
    expect(mockStorage.updateRouteOrder).toHaveBeenCalledWith('order-2', {
      status: 'rescheduled_in_optimo',
      notes: 'Rescheduled in OptimoRoute to 2026-03-12',
    });
  });

  it('leaves order unchanged when order still exists in OptimoRoute', async () => {
    vi.mocked(optimo.searchOrders).mockResolvedValue({
      orders: [{ orderNo: 'ROUTE-12345678-aaa' }],
    });

    const orders = [
      { id: 'order-1', optimo_order_no: 'ROUTE-12345678-aaa', status: 'scheduled' },
    ];

    const result = await reconcileDeletedOrders('2026-03-09', orders, mockStorage);

    expect(result).toEqual({ deleted: 0, rescheduled: 0, unchanged: 1 });
    expect(mockStorage.updateRouteOrder).not.toHaveBeenCalled();
  });

  it('skips orders without optimo_order_no', async () => {
    vi.mocked(optimo.searchOrders).mockResolvedValue({ orders: [] });

    const orders = [
      { id: 'order-1', status: 'pending' },
      { id: 'order-2', optimo_order_no: '', status: 'pending' },
    ];

    const result = await reconcileDeletedOrders('2026-03-09', orders, mockStorage);

    expect(result).toEqual({ deleted: 0, rescheduled: 0, unchanged: 0 });
    expect(optimo.searchOrders).not.toHaveBeenCalled();
    expect(mockStorage.updateRouteOrder).not.toHaveBeenCalled();
  });

  it('skips orders already in terminal status', async () => {
    vi.mocked(optimo.searchOrders).mockResolvedValue({ orders: [] });

    const orders = [
      { id: 'order-1', optimo_order_no: 'ROUTE-aaa', status: 'completed' },
      { id: 'order-2', optimo_order_no: 'ROUTE-bbb', status: 'failed' },
      { id: 'order-3', optimo_order_no: 'ROUTE-ccc', status: 'cancelled' },
      { id: 'order-4', optimo_order_no: 'ROUTE-ddd', status: 'deleted_in_optimo' },
    ];

    const result = await reconcileDeletedOrders('2026-03-09', orders, mockStorage);

    expect(result).toEqual({ deleted: 0, rescheduled: 0, unchanged: 0 });
    expect(optimo.searchOrders).not.toHaveBeenCalled();
  });

  it('handles searchOrders API failure gracefully', async () => {
    vi.mocked(optimo.searchOrders).mockRejectedValue(new Error('API down'));

    const orders = [
      { id: 'order-1', optimo_order_no: 'ROUTE-aaa', status: 'scheduled' },
      { id: 'order-2', optimo_order_no: 'ROUTE-bbb', status: 'pending' },
    ];

    const result = await reconcileDeletedOrders('2026-03-09', orders, mockStorage);

    expect(result).toEqual({ deleted: 0, rescheduled: 0, unchanged: 2 });
    expect(mockStorage.updateRouteOrder).not.toHaveBeenCalled();
  });

  it('handles getSchedulingInfo failure by marking as deleted', async () => {
    vi.mocked(optimo.searchOrders).mockResolvedValue({ orders: [] });
    vi.mocked(optimo.getSchedulingInfo).mockRejectedValue(new Error('timeout'));

    const orders = [
      { id: 'order-1', optimo_order_no: 'ROUTE-aaa', status: 'scheduled' },
    ];

    const result = await reconcileDeletedOrders('2026-03-09', orders, mockStorage);

    expect(result).toEqual({ deleted: 1, rescheduled: 0, unchanged: 0 });
    expect(mockStorage.updateRouteOrder).toHaveBeenCalledWith('order-1', {
      status: 'deleted_in_optimo',
      notes: 'Deleted from OptimoRoute (scheduling info unavailable)',
    });
  });

  it('handles mixed scenario with multiple orders', async () => {
    vi.mocked(optimo.searchOrders).mockResolvedValue({
      orders: [{ orderNo: 'ROUTE-exists' }],
    });
    vi.mocked(optimo.getSchedulingInfo)
      .mockResolvedValueOnce({ success: true, orderScheduled: false }) // deleted
      .mockResolvedValueOnce({
        success: true,
        orderScheduled: true,
        scheduleInformation: {
          stopNumber: 1,
          scheduledAt: '10:00',
          scheduledAtDt: '2026-03-15T10:00:00',
          driverSerial: 'DRV-1',
        },
      }); // rescheduled

    const orders = [
      { id: 'order-1', optimo_order_no: 'ROUTE-exists', status: 'scheduled' },
      { id: 'order-2', optimo_order_no: 'ROUTE-deleted', status: 'pending' },
      { id: 'order-3', optimo_order_no: 'ROUTE-moved', status: 'scheduled' },
      { id: 'order-4', status: 'pending' }, // no optimo_order_no
      { id: 'order-5', optimo_order_no: 'ROUTE-done', status: 'completed' }, // terminal
    ];

    const result = await reconcileDeletedOrders('2026-03-09', orders, mockStorage);

    expect(result).toEqual({ deleted: 1, rescheduled: 1, unchanged: 1 });
    expect(mockStorage.updateRouteOrder).toHaveBeenCalledTimes(2);
  });
});
