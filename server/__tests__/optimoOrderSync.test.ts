import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../optimoRouteClient', () => ({
  createOrder: vi.fn(),
  createOrUpdateOrders: vi.fn(),
}));

import * as optimo from '../optimoRouteClient';
import { syncOrdersWithFallback } from '../optimoOrderSync';

describe('syncOrdersWithFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(optimo.createOrder).mockResolvedValue({ success: true } as any);
    vi.mocked(optimo.createOrUpdateOrders).mockResolvedValue([{ success: true, orders: [] }] as any);
  });

  it('uses bulk sync when coordinates are present and the bulk API accepts the order', async () => {
    vi.mocked(optimo.createOrUpdateOrders).mockResolvedValue([
      {
        success: true,
        orders: [{ success: true, orderNo: 'ORD-1' }],
      },
    ] as any);

    const result = await syncOrdersWithFallback([
      {
        bulkInput: {
          orderNo: 'ORD-1',
          type: 'P',
          date: '2026-03-12',
          location: {
            address: '123 Main St',
            locationName: 'Jane Doe',
            latitude: 42.1,
            longitude: -71.1,
          },
        },
        meta: { id: 'one' },
      },
    ]);

    expect(optimo.createOrUpdateOrders).toHaveBeenCalledOnce();
    expect(optimo.createOrder).not.toHaveBeenCalled();
    expect(result.successes).toHaveLength(1);
    expect(result.successes[0].method).toBe('bulk');
    expect(result.failures).toHaveLength(0);
  });

  it('uses single-order creation when coordinates are missing', async () => {
    const result = await syncOrdersWithFallback([
      {
        bulkInput: {
          orderNo: 'ORD-2',
          type: 'P',
          date: '2026-03-12',
          location: {
            address: '456 Oak Ave',
            locationName: 'John Doe',
          },
        },
        meta: { id: 'two' },
      },
    ]);

    expect(optimo.createOrUpdateOrders).not.toHaveBeenCalled();
    expect(optimo.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNo: 'ORD-2',
        address: '456 Oak Ave',
        locationName: 'John Doe',
      }),
    );
    expect(result.successes).toHaveLength(1);
    expect(result.successes[0].method).toBe('single');
    expect(result.failures).toHaveLength(0);
  });

  it('retries location-related bulk failures with single-order creation', async () => {
    vi.mocked(optimo.createOrUpdateOrders).mockResolvedValue([
      {
        success: true,
        orders: [
          {
            success: false,
            orderNo: 'ORD-3',
            code: 'ERR_LOC_NON_EXISTING_LOC',
            message: 'Location could not be resolved',
          },
        ],
      },
    ] as any);

    const result = await syncOrdersWithFallback([
      {
        bulkInput: {
          orderNo: 'ORD-3',
          type: 'P',
          date: '2026-03-12',
          location: {
            address: '789 Pine St',
            locationName: 'Jamie Doe',
            latitude: 39.9,
            longitude: -75.1,
          },
        },
        meta: { id: 'three' },
      },
    ]);

    expect(optimo.createOrUpdateOrders).toHaveBeenCalledOnce();
    expect(optimo.createOrder).toHaveBeenCalledOnce();
    expect(result.successes).toHaveLength(1);
    expect(result.successes[0].method).toBe('single');
    expect(result.failures).toHaveLength(0);
  });

  it('does not retry non-location bulk failures', async () => {
    vi.mocked(optimo.createOrUpdateOrders).mockResolvedValue([
      {
        success: true,
        orders: [
          {
            success: false,
            orderNo: 'ORD-4',
            code: 'ERR_DRIVER_UNKNOWN',
            message: 'Assigned driver does not exist',
          },
        ],
      },
    ] as any);

    const result = await syncOrdersWithFallback([
      {
        bulkInput: {
          orderNo: 'ORD-4',
          type: 'P',
          date: '2026-03-12',
          location: {
            address: '1010 Maple Rd',
            locationName: 'Taylor Doe',
            latitude: 39.1,
            longitude: -76.1,
          },
        },
        meta: { id: 'four' },
      },
    ]);

    expect(optimo.createOrUpdateOrders).toHaveBeenCalledOnce();
    expect(optimo.createOrder).not.toHaveBeenCalled();
    expect(result.successes).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].method).toBe('bulk');
  });

  it('falls back to single-order creation when the bulk endpoint throws', async () => {
    vi.mocked(optimo.createOrUpdateOrders).mockRejectedValue(new Error('Bulk API unavailable'));

    const result = await syncOrdersWithFallback([
      {
        bulkInput: {
          orderNo: 'ORD-5',
          type: 'P',
          date: '2026-03-12',
          location: {
            address: '500 Cedar Ln',
            locationName: 'Morgan Doe',
            latitude: 38.9,
            longitude: -77.1,
          },
        },
        meta: { id: 'five' },
      },
    ]);

    expect(optimo.createOrUpdateOrders).toHaveBeenCalledOnce();
    expect(optimo.createOrder).toHaveBeenCalledOnce();
    expect(result.successes).toHaveLength(1);
    expect(result.successes[0].method).toBe('single');
    expect(result.failures).toHaveLength(0);
  });
});
