import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('../storage', () => ({
  storage: {
    getDriverProfileByUserId: vi.fn(),
    getProviderByOwnerUserId: vi.fn(),
    getProviderMembers: vi.fn(),
    getProviderVehicles: vi.fn(),
    dispatchRouteToDriver: vi.fn(),
    getProviderRoles: vi.fn(),
    addProviderMember: vi.fn(),
  },
}));

vi.mock('../notificationService', () => ({
  sendDriverNotification: vi.fn(),
}));

vi.mock('../websocket', () => ({
  broadcastToDriver: vi.fn(),
  broadcastToAdmins: vi.fn(),
  broadcastToUser: vi.fn(),
  broadcastToZoneDrivers: vi.fn(),
}));

import { registerTeamRoutes } from '../teamRoutes';
import { pool } from '../db';
import { storage } from '../storage';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: true,
  }));
  app.use((req: any, _res, next) => {
    req.session.userId = 'user-123';
    next();
  });
  registerTeamRoutes(app);
  return app;
}

describe('Provider management routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pool.query as any).mockImplementation((query: string) => {
      if (typeof query === 'string' && query.includes('SELECT role FROM user_roles')) {
        return Promise.resolve({ rows: [{ role: 'provider_owner' }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  it('does not dispatch a route when it is not assigned to the caller provider', async () => {
    vi.mocked(storage.getProviderByOwnerUserId as any).mockResolvedValue({
      id: 'provider-1',
      name: 'Acme Hauling',
    });
    vi.mocked(storage.getProviderMembers as any).mockResolvedValue([
      {
        id: 'member-1',
        driver_profile_id: 'driver-9',
        permissions: { execute_routes: true },
        optimoroute_driver_id: 'opt-9',
      },
    ]);
    vi.mocked(storage.getProviderVehicles as any).mockResolvedValue([]);
    vi.mocked(storage.dispatchRouteToDriver as any).mockResolvedValue(null);

    const res = await request(createApp())
      .post('/api/team/my-provider/routes/route-1/dispatch')
      .send({ driverId: 'driver-9' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Route not found or not assigned to this company' });
    expect(storage.dispatchRouteToDriver).toHaveBeenCalledWith('route-1', 'provider-1', 'driver-9', null);
  });

  it('checks existing provider membership by user_id instead of a nonexistent driver_profile_id column', async () => {
    vi.mocked(pool.query as any).mockImplementation((query: string) => {
      if (typeof query === 'string' && query.includes('SELECT role FROM user_roles')) {
        return Promise.resolve({ rows: [{ role: 'driver' }], rowCount: 1 });
      }
      if (typeof query === 'string' && query.includes('SELECT id, name FROM providers WHERE slug = $1')) {
        return Promise.resolve({ rows: [{ id: 'provider-1', name: 'Acme Hauling' }], rowCount: 1 });
      }
      if (typeof query === 'string' && query.includes('FROM provider_members pm')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    vi.mocked(storage.getDriverProfileByUserId as any).mockResolvedValue({
      id: 'driver-123',
      user_id: 'user-123',
      name: 'Test Driver',
      onboarding_status: 'completed',
      status: 'active',
    });
    vi.mocked(storage.getProviderRoles as any).mockResolvedValue([
      { id: 'role-driver', is_default_role: true },
    ]);
    vi.mocked(storage.addProviderMember as any).mockResolvedValue({ id: 'member-1' });

    const res = await request(createApp()).post('/api/team/provider/acme-hauling/join');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      provider: { id: 'provider-1', name: 'Acme Hauling' },
    });
    expect(storage.addProviderMember).toHaveBeenCalledWith({
      providerId: 'provider-1',
      userId: 'user-123',
      roleId: 'role-driver',
      employmentType: 'contractor',
    });

    const membershipQuery = vi.mocked(pool.query as any).mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('FROM provider_members pm'),
    )?.[0] as string | undefined;

    expect(membershipQuery).toContain('pm.user_id = $1');
    expect(membershipQuery).not.toContain('pm.driver_profile_id');
  });
});
