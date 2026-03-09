import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import session from 'express-session';
import supertest from 'supertest';

vi.mock('../storage', () => ({
  storage: {
    getUserById: vi.fn(),
  },
  pool: {},
}));

vi.mock('../db', () => ({
  pool: { query: vi.fn() },
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
vi.mock('../optimoRouteClient', () => ({}));
vi.mock('../websocket', () => ({
  broadcastToDriver: vi.fn(),
  broadcastToZoneDrivers: vi.fn(),
  broadcastToAdmins: vi.fn(),
  broadcastToUser: vi.fn(),
}));
vi.mock('../repositories/ExpenseRepository', () => ({
  expenseRepo: {},
}));

import { registerAdminRoutes } from '../adminRoutes';
import { pool } from '../db';
import { storage } from '../storage';
import { roleRepo } from '../repositories/RoleRepository';

const app = express();
app.use(express.json());
app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: true }));
app.use((req, _res, next) => {
  req.session.userId = 'admin-1';
  next();
});
registerAdminRoutes(app);

const request = supertest(app);

describe('GET /api/admin/exceptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.getUserById).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(roleRepo.getAdminRole).mockResolvedValue('support');
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (sql.includes('FROM on_demand_requests odr')) {
        return {
          rows: [
            {
              id: 'odr-1',
              service_name: 'Bulk pickup',
              requested_date: '2026-03-09',
              address: '1 Main St',
              created_at: '2026-03-09T10:00:00.000Z',
            },
          ],
        } as any;
      }

      if (sql.includes('FROM missed_collection_reports mcr')) {
        return {
          rows: [
            {
              id: 'mcr-1',
              reported_date: '2026-03-08',
              status: 'pending',
              address: '2 Main St',
              created_at: '2026-03-09T09:00:00.000Z',
            },
          ],
        } as any;
      }

      if (sql.includes('FROM routes r') && sql.includes('NOT EXISTS (SELECT 1 FROM route_bids')) {
        return {
          rows: [
            {
              id: 'route-1',
              title: 'North route',
              scheduled_date: '2026-03-10',
              status: 'open',
              created_at: '2026-03-08T08:00:00.000Z',
            },
          ],
        } as any;
      }

      if (sql.includes('FROM auto_assignment_log aal')) {
        return {
          rows: [
            {
              id: 1,
              location_id: 'loc-1',
              failure_reason: 'No eligible contract',
              created_at: '2026-03-09T08:00:00.000Z',
              address: 'Unknown location',
            },
          ],
        } as any;
      }

      if (sql.includes("WHERE r.status = 'draft'")) {
        return {
          rows: [
            {
              id: 'draft-1',
              title: 'Draft route',
              scheduled_date: '2026-03-11',
              created_at: '2026-03-09T07:00:00.000Z',
              order_count: 4,
            },
          ],
        } as any;
      }

      throw new Error(`Unexpected query: ${sql}`);
    });
  });

  it('uses schema-compatible queries and returns exception totals', async () => {
    const res = await request.get('/api/admin/exceptions');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalExceptions: 5,
      escalatedMissed: [
        expect.objectContaining({
          id: 'mcr-1',
          reported_date: '2026-03-08',
        }),
      ],
      failedAssignments: [
        expect.objectContaining({
          id: 1,
          failure_reason: 'No eligible contract',
          address: 'Unknown location',
        }),
      ],
    });

    const sqlCalls = vi.mocked(pool.query).mock.calls.map(([sql]) => String(sql));
    expect(sqlCalls.some(sql => sql.includes('mcr.collection_date AS reported_date'))).toBe(true);
    expect(sqlCalls.some(sql => sql.includes('mcr.reported_date'))).toBe(false);
    expect(sqlCalls.some(sql => sql.includes("COALESCE(aal.reason, aal.details, 'Assignment failed') AS failure_reason"))).toBe(true);
    expect(sqlCalls.some(sql => sql.includes('aal.assigned = false'))).toBe(true);
    expect(sqlCalls.some(sql => sql.includes('aal.success = false'))).toBe(false);
  });
});
