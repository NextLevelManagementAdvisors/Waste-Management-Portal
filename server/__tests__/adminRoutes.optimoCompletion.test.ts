import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import session from 'express-session';
import supertest from 'supertest';

vi.mock('../storage', () => ({
  storage: {
    getUserById: vi.fn(),
    query: vi.fn(),
    createAuditLog: vi.fn(),
    updateRouteOrder: vi.fn(),
    updateRoute: vi.fn(),
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
  getRoutes: vi.fn(),
  getCompletionDetailsFull: vi.fn(),
  searchOrders: vi.fn().mockResolvedValue({ orders: [] }),
  getSchedulingInfo: vi.fn().mockResolvedValue({ success: false, orderScheduled: false }),
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

describe('POST /api/admin/routes/pull-completion-for-date', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.getUserById).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(roleRepo.getAdminRole).mockResolvedValue('full_admin');
    vi.mocked(storage.createAuditLog).mockResolvedValue(undefined as any);
    vi.mocked(storage.updateRoute).mockResolvedValue({} as any);
  });

  it('backfills imported order identifiers from Optimo ids and marks completed orders', async () => {
    const route = {
      id: 'route-1',
      title: 'John Geodicke - 2026-03-06',
      status: 'assigned',
      scheduled_date: '2026-03-06T05:00:00.000Z',
      optimo_route_key: '2026-03-06_John Geodicke',
    };
    const orders = [
      {
        id: 'order-1',
        route_id: 'route-1',
        optimo_order_no: null,
        status: 'pending',
        on_demand_request_id: null,
        order_number: 1,
        scheduled_at: null,
        address: '2370 Shenandoah Shores Rd, Front Royal, VA 22630, USA',
      },
    ];

    vi.mocked(storage.query).mockImplementation(async (sql: string) => {
      if (sql.includes('FROM routes') && sql.includes("status NOT IN ('completed', 'cancelled', 'draft')")) {
        return { rows: [route] } as any;
      }
      if (sql.includes('FROM route_orders') && sql.includes('LEFT JOIN locations')) {
        return { rows: orders } as any;
      }
      if (sql.includes('WITH derived AS')) {
        return { rows: [], rowCount: 0 } as any;
      }
      if (sql.includes('SELECT status FROM route_orders WHERE route_id = $1')) {
        return { rows: orders.map(order => ({ status: order.status })) } as any;
      }
      if (sql.includes('scheduled_date < CURRENT_DATE')) {
        return { rows: [] } as any;
      }
      return { rows: [] } as any;
    });
    vi.mocked(storage.updateRouteOrder).mockImplementation(async (orderId: string, data: any) => {
      const order = orders.find(candidate => candidate.id === orderId)!;
      Object.assign(order, data);
      return order as any;
    });
    vi.mocked(optimo.getRoutes).mockResolvedValue({
      routes: [
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
      ],
    } as any);

    const res = await request
      .post('/api/admin/routes/pull-completion-for-date')
      .send({ date: '2026-03-06' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ routesUpdated: 1, ordersUpdated: 1 });
    expect(optimo.getCompletionDetailsFull).toHaveBeenCalledWith(['57aa5137170b1202d36fd49d839c3530'], true);
    expect(storage.updateRouteOrder).toHaveBeenCalledWith('order-1', expect.objectContaining({
      optimo_order_no: '57aa5137170b1202d36fd49d839c3530',
      scheduled_at: '07:27',
    }));
    expect(storage.updateRouteOrder).toHaveBeenCalledWith('order-1', { status: 'completed' });
    expect(storage.updateRoute).toHaveBeenCalledWith('route-1', expect.objectContaining({ status: 'completed' }));
    expect(orders[0].status).toBe('completed');
  });
});
