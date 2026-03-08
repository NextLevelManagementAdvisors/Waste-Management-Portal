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
    getRouteById: vi.fn(),
    getRouteBids: vi.fn(),
    getRouteStops: vi.fn(),
  },
}));

vi.mock('../websocket', () => ({
  broadcastToDriver: vi.fn(),
  broadcastToAdmins: vi.fn(),
  broadcastToUser: vi.fn(),
  broadcastToZoneDrivers: vi.fn(),
  webSocketManager: {
    broadcastToConversation: vi.fn(),
    broadcastToAdmins: vi.fn(),
  },
}));

import { registerTeamRoutes } from '../teamRoutes';
import { pool } from '../db';
import { storage } from '../storage';

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

describe('GET /api/team/routes/:routeId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.getDriverProfileByUserId).mockResolvedValue({
      id: 'driver-123',
      user_id: 'user-123',
      name: 'Test Driver',
      onboarding_status: 'completed',
      status: 'active',
    } as any);
    vi.mocked(pool.query as any).mockImplementation((query: string) => {
      if (typeof query === 'string' && query.includes('user_roles')) {
        return Promise.resolve({ rows: [{ role: 'driver' }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    vi.mocked(storage.getRouteBids).mockResolvedValue([] as any);
  });

  it('maps synced stop order fields into the driver-facing response shape', async () => {
    vi.mocked(storage.getRouteById).mockResolvedValue({
      id: 'route-1',
      title: 'Synced Route',
      scheduled_date: '2026-03-10',
      status: 'assigned',
      assigned_driver_id: 'driver-123',
    } as any);
    vi.mocked(storage.getRouteStops).mockResolvedValue([
      {
        id: 'stop-1',
        address: '123 Main St',
        customer_name: 'Jane Doe',
        order_type: 'recurring',
        stop_number: 7,
        status: 'scheduled',
      },
    ] as any);

    const res = await request(app).get('/api/team/routes/route-1');

    expect(res.status).toBe(200);
    expect(res.body.data.stops).toEqual([
      expect.objectContaining({
        address: '123 Main St',
        customer_name: 'Jane Doe',
        pickup_type: 'recurring',
        sequence_number: 7,
        status: 'scheduled',
      }),
    ]);
  });
});
