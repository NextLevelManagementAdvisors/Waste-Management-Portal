import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import session from 'express-session';
import supertest from 'supertest';

vi.mock('../storage', () => ({
  storage: {
    getUserById: vi.fn(),
    getRouteById: vi.fn(),
    getRouteOrders: vi.fn(),
    getAllRoutes: vi.fn(),
    removeRouteOrder: vi.fn(),
    deleteRoute: vi.fn(),
    updateRoute: vi.fn(),
    updateRouteOrder: vi.fn(),
    markRouteSynced: vi.fn(),
    getSyncOrderByOrderNo: vi.fn(),
    createSyncOrder: vi.fn(),
    createAuditLog: vi.fn(),
    getDriverById: vi.fn(),
    addRouteOrders: vi.fn(),
    getRouteOrderById: vi.fn(),
  },
  pool: {},
}));

vi.mock('../db', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  BaseRepository: class { async query() { return { rows: [] }; } },
}));

vi.mock('../settings', () => ({
  getAllSettings: vi.fn(),
  saveSetting: vi.fn(),
}));

vi.mock('../integrationTests', () => ({
  testAllIntegrations: vi.fn(),
  testSingleIntegration: vi.fn(),
}));

vi.mock('../repositories/RoleRepository', () => ({
  roleRepo: {
    getAdminRole: vi.fn(),
  },
}));

vi.mock('../stripeClient', () => ({
  getUncachableStripeClient: vi.fn(),
  getStripePublishableKey: vi.fn(),
}));

vi.mock('../gmailClient', () => ({ sendEmail: vi.fn() }));
vi.mock('../notificationService', () => ({
  sendCollectionReminder: vi.fn().mockResolvedValue(undefined),
  sendBillingAlert: vi.fn().mockResolvedValue(undefined),
  sendServiceUpdate: vi.fn().mockResolvedValue(undefined),
  sendCustomNotification: vi.fn().mockResolvedValue(undefined),
  sendDriverNotification: vi.fn().mockResolvedValue(undefined),
  sendRouteCancelNotification: vi.fn().mockResolvedValue(undefined),
  sendServiceStatusNotification: vi.fn().mockResolvedValue(undefined),
  sendMissedCollectionResolution: vi.fn().mockResolvedValue(undefined),
  sendOnDemandApproval: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../optimoRouteClient', () => ({
  createOrder: vi.fn(),
  createOrUpdateOrders: vi.fn(),
  deleteOrder: vi.fn(),
  deleteOrders: vi.fn(),
  getRoutes: vi.fn(),
  getCompletionDetailsFull: vi.fn(),
  startPlanning: vi.fn(),
}));
vi.mock('../optimoSyncService', () => ({
  cleanupFutureOrdersForLocation: vi.fn(),
}));
vi.mock('../repositories/ExpenseRepository', () => ({
  expenseRepo: {},
}));

import { registerAdminRoutes } from '../adminRoutes';
import { storage } from '../storage';
import { roleRepo } from '../repositories/RoleRepository';
import * as optimo from '../optimoRouteClient';

const app = express();
app.use(express.json());
app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: true }));
app.use((req, _res, next) => {
  req.session.userId = 'admin-1';
  next();
});
registerAdminRoutes(app);

const request = supertest(app);

const ROUTE_ID = '12345678-aaaa-bbbb-cccc-1234567890ab';
const ORDER_ID = 'order-1111-2222-3333-444444444444';

describe('admin route lifecycle — OptimoRoute propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.getUserById).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(roleRepo.getAdminRole).mockResolvedValue('full_admin');
    vi.mocked(storage.createAuditLog).mockResolvedValue(undefined as any);
    vi.mocked(storage.removeRouteOrder).mockResolvedValue(undefined as any);
    vi.mocked(storage.deleteRoute).mockResolvedValue(undefined as any);
  });

  describe('DELETE /api/admin/routes/:id/orders/:orderId', () => {
    it('removes order from route', async () => {
      const res = await request.delete(`/api/admin/routes/${ROUTE_ID}/orders/${ORDER_ID}`);

      expect(res.status).toBe(200);
      expect(storage.removeRouteOrder).toHaveBeenCalledWith(ORDER_ID);
    });

    it('BUG: does NOT delete OptimoRoute order for order with optimo_order_no', async () => {
      // The order has a synced order number but the endpoint does not clean it up
      // This test documents the gap — when fixed, this assertion should be inverted
      const res = await request.delete(`/api/admin/routes/${ROUTE_ID}/orders/${ORDER_ID}`);

      expect(res.status).toBe(200);
      expect(storage.removeRouteOrder).toHaveBeenCalledWith(ORDER_ID);
      // BUG: Should call optimo.deleteOrder('ROUTE-xxx') but currently does not
      expect(optimo.deleteOrder).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/admin/routes/:id', () => {
    it('only allows draft/open routes', async () => {
      vi.mocked(storage.getRouteById).mockResolvedValue({
        id: ROUTE_ID,
        status: 'assigned',
      } as any);

      const res = await request.delete(`/api/admin/routes/${ROUTE_ID}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/draft or open/);
    });

    it('removes all orders then the route', async () => {
      vi.mocked(storage.getRouteById).mockResolvedValue({
        id: ROUTE_ID,
        status: 'draft',
        title: 'Test Route',
      } as any);
      vi.mocked(storage.getRouteOrders).mockResolvedValue([
        { id: 'order-a' },
        { id: 'order-b' },
      ] as any);

      const res = await request.delete(`/api/admin/routes/${ROUTE_ID}`);

      expect(res.status).toBe(200);
      expect(storage.removeRouteOrder).toHaveBeenCalledTimes(2);
      expect(storage.removeRouteOrder).toHaveBeenCalledWith('order-a');
      expect(storage.removeRouteOrder).toHaveBeenCalledWith('order-b');
      expect(storage.deleteRoute).toHaveBeenCalledWith(ROUTE_ID);
    });

    it('BUG: does NOT batch-delete synced OptimoRoute orders', async () => {
      vi.mocked(storage.getRouteById).mockResolvedValue({
        id: ROUTE_ID,
        status: 'draft',
        title: 'Test Route',
      } as any);
      vi.mocked(storage.getRouteOrders).mockResolvedValue([
        { id: 'order-a', optimo_order_no: 'ROUTE-12345678-aaaa' },
        { id: 'order-b', optimo_order_no: 'ROUTE-12345678-bbbb' },
      ] as any);

      const res = await request.delete(`/api/admin/routes/${ROUTE_ID}`);

      expect(res.status).toBe(200);
      // BUG: Should call optimo.deleteOrders(['ROUTE-12345678-aaaa', 'ROUTE-12345678-bbbb'])
      // but currently does not. Only draft/open routes can be deleted, so this only matters
      // if a route had been synced then somehow reverted to draft status.
      expect(optimo.deleteOrders).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/admin/routes/:id/sync-to-optimo', () => {
    it('returns 400 when assigned driver has no OptimoRoute serial', async () => {
      vi.mocked(storage.getRouteById).mockResolvedValue({
        id: ROUTE_ID,
        title: 'Monday Route',
        scheduled_date: '2026-03-09T05:00:00.000Z',
        assigned_driver_id: 'driver-1',
      } as any);
      vi.mocked(storage.getDriverById).mockResolvedValue({
        id: 'driver-1',
        name: 'John Doe',
        optimoroute_driver_id: null,
      } as any);

      const res = await request.post(`/api/admin/routes/${ROUTE_ID}/sync-to-optimo`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no OptimoRoute serial/i);
      expect(optimo.createOrUpdateOrders).not.toHaveBeenCalled();
    });

    it('syncs route with linked driver and triggers planning', async () => {
      const order = {
        id: 'order-1',
        location_id: '87654321-bbbb-cccc-dddd-0987654321ab',
        address: '123 Main St',
        customer_name: 'Jane Doe',
        latitude: 42.365142,
        longitude: -71.052882,
      };
      vi.mocked(storage.getRouteById).mockResolvedValue({
        id: ROUTE_ID,
        title: 'Monday Route',
        scheduled_date: '2026-03-09T05:00:00.000Z',
        assigned_driver_id: 'driver-1',
      } as any);
      vi.mocked(storage.getDriverById).mockResolvedValue({
        id: 'driver-1',
        name: 'John Doe',
        optimoroute_driver_id: 'SERIAL-001',
      } as any);
      vi.mocked(storage.getRouteOrders).mockResolvedValue([order] as any);
      vi.mocked(optimo.createOrUpdateOrders).mockResolvedValue([{ success: true }] as any);
      vi.mocked(storage.updateRouteOrder).mockResolvedValue({} as any);
      vi.mocked(storage.markRouteSynced).mockResolvedValue(undefined as any);
      vi.mocked(storage.getSyncOrderByOrderNo).mockResolvedValue(null);
      vi.mocked(storage.createSyncOrder).mockResolvedValue({} as any);
      vi.mocked(optimo.startPlanning).mockResolvedValue({ planningId: 42 } as any);

      const res = await request.post(`/api/admin/routes/${ROUTE_ID}/sync-to-optimo`);

      expect(res.status).toBe(200);
      expect(optimo.createOrUpdateOrders).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            orderNo: expect.stringContaining('ROUTE-'),
            assignedTo: { serial: 'SERIAL-001' },
          }),
        ]),
      );
      expect(optimo.startPlanning).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2026-03-09',
          useDrivers: [{ driverSerial: 'SERIAL-001' }],
        }),
      );
    });
  });
});
