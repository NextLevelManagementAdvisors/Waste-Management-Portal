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
    updateRouteOrder: vi.fn(),
    markRouteSynced: vi.fn(),
    updateRoute: vi.fn(),
    getSyncOrderByOrderNo: vi.fn(),
    createSyncOrder: vi.fn(),
    createAuditLog: vi.fn(),
    getDriverById: vi.fn(),
  },
  pool: {},
}));

vi.mock('../db', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  BaseRepository: class {
    async query() {
      return { rows: [] };
    }
  },
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
  startPlanning: vi.fn(),
  getRoutes: vi.fn(),
  getCompletionDetailsFull: vi.fn(),
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

describe('admin Optimo sync routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.getUserById).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(roleRepo.getAdminRole).mockResolvedValue('full_admin');
    vi.mocked(storage.createAuditLog).mockResolvedValue(undefined as any);
    vi.mocked(storage.updateRouteOrder).mockResolvedValue({} as any);
    vi.mocked(storage.markRouteSynced).mockResolvedValue(undefined as any);
    vi.mocked(storage.getSyncOrderByOrderNo).mockResolvedValue(null);
    vi.mocked(storage.createSyncOrder).mockResolvedValue({} as any);
    vi.mocked(optimo.createOrUpdateOrders).mockResolvedValue([{ success: true }] as any);
    vi.mocked(optimo.startPlanning).mockResolvedValue({ planningId: null } as any);
    vi.mocked(storage.getDriverById).mockResolvedValue(null);
    vi.mocked(storage.updateRoute).mockResolvedValue(undefined as any);
  });

  it('records synced route orders in the Optimo ledger', async () => {
    const route = {
      id: '12345678-aaaa-bbbb-cccc-1234567890ab',
      title: 'Monday Route',
      scheduled_date: '2026-03-09T05:00:00.000Z',
    };
    const order = {
      id: 'order-1',
      location_id: '87654321-bbbb-cccc-dddd-0987654321ab',
      address: '123 Main St',
      customer_name: 'Jane Doe',
    };

    vi.mocked(storage.getRouteById).mockResolvedValue(route as any);
    vi.mocked(storage.getRouteOrders).mockResolvedValue([order] as any);

    const res = await request.post(`/api/admin/routes/${route.id}/sync-to-optimo`).send();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ordersSynced: 1, ordersSkipped: 0, errors: [] });
    expect(optimo.createOrUpdateOrders).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          orderNo: 'ROUTE-12345678-87654321',
          date: '2026-03-09',
        }),
      ]),
    );
    expect(storage.updateRouteOrder).toHaveBeenCalledWith('order-1', { optimo_order_no: 'ROUTE-12345678-87654321' });
    expect(storage.getSyncOrderByOrderNo).toHaveBeenCalledWith('ROUTE-12345678-87654321');
    expect(storage.createSyncOrder).toHaveBeenCalledWith({
      locationId: '87654321-bbbb-cccc-dddd-0987654321ab',
      orderNo: 'ROUTE-12345678-87654321',
      scheduledDate: '2026-03-09',
    });
    expect(storage.markRouteSynced).toHaveBeenCalledWith(route.id);
  });

  it('records day-sync orders in the Optimo ledger', async () => {
    const route = {
      id: 'abcdef12-1111-2222-3333-abcdef123456',
      title: 'Tuesday Route',
      status: 'assigned',
      scheduled_date: '2026-03-10T05:00:00.000Z',
    };
    const order = {
      id: 'order-2',
      location_id: 'fedcba98-4444-5555-6666-fedcba987654',
      address: '456 Oak Ave',
      customer_name: 'John Doe',
    };

    vi.mocked(storage.getAllRoutes).mockResolvedValue([route] as any);
    vi.mocked(storage.getRouteOrders).mockImplementation(async (routeId: string) => {
      return routeId === route.id ? [order] : [];
    });

    const res = await request.post('/api/admin/planning/sync-day').send({ date: '2026-03-10' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      routesSynced: 1,
      ordersSynced: 1,
      ordersSkipped: 0,
      errors: [],
    });
    expect(storage.updateRouteOrder).toHaveBeenCalledWith('order-2', { optimo_order_no: 'ROUTE-abcdef12-fedcba98' });
    expect(storage.getSyncOrderByOrderNo).toHaveBeenCalledWith('ROUTE-abcdef12-fedcba98');
    expect(storage.createSyncOrder).toHaveBeenCalledWith({
      locationId: 'fedcba98-4444-5555-6666-fedcba987654',
      orderNo: 'ROUTE-abcdef12-fedcba98',
      scheduledDate: '2026-03-10',
    });
    expect(storage.markRouteSynced).toHaveBeenCalledWith(route.id);
  });
});
