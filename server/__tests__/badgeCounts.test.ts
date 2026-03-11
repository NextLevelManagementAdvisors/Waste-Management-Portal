import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import session from 'express-session';
import supertest from 'supertest';

vi.mock('../storage', () => ({
  storage: {
    getUserById: vi.fn(),
    getUnreadCount: vi.fn(),
    query: vi.fn(),
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
vi.mock('../optimoRouteClient', () => ({}));
vi.mock('../repositories/ExpenseRepository', () => ({
  expenseRepo: {},
}));

import { registerAdminRoutes } from '../adminRoutes';
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

describe('GET /api/admin/badge-counts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.getUserById).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(roleRepo.getAdminRole).mockResolvedValue('support');
    vi.mocked(storage.getUnreadCount).mockResolvedValue(4 as any);
    vi.mocked(storage.query).mockImplementation(async (sql: string) => {
      if (sql.includes("FROM locations WHERE service_status = 'pending_review'")) {
        return { rows: [{ count: '2' }] } as any;
      }
      if (sql.includes("FROM missed_collection_reports WHERE status = 'pending'") && sql.includes('COUNT(*)')) {
        return { rows: [{ count: '3' }] } as any;
      }
      if (sql.includes("MIN(created_at) as oldest FROM missed_collection_reports")) {
        return { rows: [{ oldest: '2026-03-08T00:00:00.000Z' }] } as any;
      }
      if (sql.includes("MIN(created_at) as oldest FROM locations WHERE service_status = 'pending_review'")) {
        return { rows: [{ oldest: '2026-03-08T01:00:00.000Z' }] } as any;
      }
      if (sql.includes("FROM locations WHERE service_status = 'approved' AND collection_day IS NULL")) {
        return { rows: [{ count: '5' }] } as any;
      }
      if (sql.includes("FROM driver_custom_zones WHERE status = 'pending_approval'")) {
        return { rows: [{ count: '1' }] } as any;
      }
      if (sql.includes("FROM locations WHERE service_status = 'waitlist' AND coverage_flagged_at IS NOT NULL")) {
        return { rows: [{ count: '6' }] } as any;
      }
      if (sql.includes('FROM route_contracts') && sql.includes('FROM coverage_requests')) {
        return { rows: [{ expiring: '7', pending_coverage: '8' }] } as any;
      }
      if (sql.includes("FROM providers WHERE approval_status = 'pending_review'")) {
        return { rows: [{ count: '0' }] } as any;
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
  });

  it('uses service_status-based badge queries and returns counts', async () => {
    const res = await request.get('/api/admin/badge-counts');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      operations: 4,
      dashboard: 8,
      communications: 4,
      missedCollections: 3,
      addressReviews: 2,
      locationsNeedingCollectionDay: 5,
      pendingZones: 1,
      flaggedWaitlist: 6,
      contractsExpiring: 7,
      pendingCoverage: 8,
    });

    const sqlCalls = vi.mocked(storage.query).mock.calls.map(([sql]) => String(sql));
    expect(sqlCalls.some(sql => sql.includes('address_status'))).toBe(false);
    expect(sqlCalls.some(sql => sql.includes("service_status = 'pending_review'"))).toBe(true);
  });
});
