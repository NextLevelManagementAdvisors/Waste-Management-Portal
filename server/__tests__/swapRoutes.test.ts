import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import session from 'express-session';
import supertest from 'supertest';

vi.mock('../storage', () => ({
  storage: {
    getUserById: vi.fn(),
    createAuditLog: vi.fn(),
    updateSwapStatus: vi.fn(),
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
  sendProviderChangeNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../optimoRouteClient', () => ({}));
vi.mock('../repositories/ExpenseRepository', () => ({
  expenseRepo: {},
}));
vi.mock('../swapRecommendationService', () => ({
  generateSwapRecommendations: vi.fn(),
}));

import { registerAdminRoutes } from '../adminRoutes';
import { storage } from '../storage';
import { roleRepo } from '../repositories/RoleRepository';
import { generateSwapRecommendations } from '../swapRecommendationService';

const app = express();
app.use(express.json());
app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: true }));
app.use((req, _res, next) => {
  req.session.userId = 'admin-1';
  next();
});
registerAdminRoutes(app);

const request = supertest(app);

describe('swap admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.getUserById).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(storage.createAuditLog).mockResolvedValue(undefined as any);
  });

  it('allows support admins to generate swap recommendations', async () => {
    vi.mocked(roleRepo.getAdminRole).mockResolvedValue('support');
    vi.mocked(generateSwapRecommendations).mockResolvedValue([{ id: 'swap-1' }] as any);

    const res = await request.post('/api/admin/swaps/generate');

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ recommendations: [{ id: 'swap-1' }] });
    expect(generateSwapRecommendations).toHaveBeenCalledTimes(1);
    expect(storage.createAuditLog).toHaveBeenCalledWith('admin-1', 'generate_swaps', 'system', undefined, { count: 1 });
  });

  it('allows support admins to reject swap recommendations', async () => {
    vi.mocked(roleRepo.getAdminRole).mockResolvedValue('support');
    vi.mocked(storage.updateSwapStatus).mockResolvedValue({ id: 'swap-1', status: 'rejected' } as any);

    const res = await request
      .put('/api/admin/swaps/swap-1/decision')
      .send({ decision: 'rejected' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ swap: { id: 'swap-1', status: 'rejected' } });
    expect(storage.updateSwapStatus).toHaveBeenCalledWith('swap-1', 'rejected', 'admin-1');
    expect(storage.createAuditLog).toHaveBeenCalledWith('admin-1', 'swap_rejected', 'swap_recommendation', 'swap-1', {});
  });

  it('still blocks viewer admins from generating swaps', async () => {
    vi.mocked(roleRepo.getAdminRole).mockResolvedValue('viewer');

    const res = await request.post('/api/admin/swaps/generate');

    expect(res.status).toBe(403);
    expect(generateSwapRecommendations).not.toHaveBeenCalled();
  });
});
