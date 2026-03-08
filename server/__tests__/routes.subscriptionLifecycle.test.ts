import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import session from 'express-session';
import supertest from 'supertest';

// Mock dependencies before imports
vi.mock('../storage', () => ({
  storage: {
    getUserById: vi.fn(),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    cancelFutureOrdersForLocation: vi.fn().mockResolvedValue(0),
  },
  pool: {},
}));
vi.mock('../db', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  BaseRepository: class { async query() { return { rows: [] }; } },
}));

const { mockStripe, mockCleanup } = vi.hoisted(() => ({
  mockStripe: {
    subscriptions: {
      cancel: vi.fn(),
      update: vi.fn(),
    },
  },
  mockCleanup: vi.fn().mockResolvedValue({ deleted: 0, errors: 0 }),
}));

vi.mock('../stripeClient', () => ({
  getUncachableStripeClient: vi.fn().mockResolvedValue(mockStripe),
  getStripePublishableKey: vi.fn().mockReturnValue('pk_test'),
}));

vi.mock('../optimoRouteClient', () => ({
  getRoutes: vi.fn(),
  getCompletionDetailsFull: vi.fn(),
  searchOrders: vi.fn(),
  findOrdersForAddress: vi.fn(),
}));

// Mock the sync service that gets dynamically imported
vi.mock('../optimoSyncService', () => ({
  cleanupFutureOrdersForLocation: mockCleanup,
}));

vi.mock('../notificationService', () => ({
  sendPauseResumeConfirmation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../pushService', () => ({
  getVapidPublicKey: vi.fn().mockReturnValue('test-key'),
  saveSubscription: vi.fn(),
  removeSubscription: vi.fn(),
}));

// Stub Google GenAI
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: vi.fn() },
  })),
}));

import { registerRoutes } from '../routes';
import { storage } from '../storage';

const TEST_USER_ID = 'user-1111-2222';

const app = express();
app.use(express.json());
app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: true }));
app.use((req, _res, next) => {
  req.session.userId = TEST_USER_ID;
  next();
});
registerRoutes(app);

const request = supertest(app);

// Helper: wait for fire-and-forget promises to resolve
const flush = () => new Promise(r => setTimeout(r, 100));

describe('POST /api/subscriptions/:subscriptionId/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCleanup.mockResolvedValue({ deleted: 0, errors: 0 });
  });

  it('calls cleanupFutureOrdersForLocation with propertyId from Stripe metadata', async () => {
    mockStripe.subscriptions.cancel.mockResolvedValue({
      id: 'sub_123',
      status: 'canceled',
      metadata: { propertyId: 'loc-aaa-111' },
    });

    const res = await request.post('/api/subscriptions/sub_123/cancel');
    await flush();

    expect(res.status).toBe(200);
    expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith('sub_123');
    expect(storage.cancelFutureOrdersForLocation).toHaveBeenCalledWith(
      'loc-aaa-111',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(mockCleanup).toHaveBeenCalledWith('loc-aaa-111');
  });

  it('skips cleanup when no propertyId in metadata', async () => {
    mockStripe.subscriptions.cancel.mockResolvedValue({
      id: 'sub_456',
      status: 'canceled',
      metadata: {},
    });

    const res = await request.post('/api/subscriptions/sub_456/cancel');
    await flush();

    expect(res.status).toBe(200);
    expect(mockCleanup).not.toHaveBeenCalled();
    expect(storage.cancelFutureOrdersForLocation).not.toHaveBeenCalled();
  });

  it('returns success even when cleanup fails', async () => {
    mockStripe.subscriptions.cancel.mockResolvedValue({
      id: 'sub_789',
      status: 'canceled',
      metadata: { propertyId: 'loc-bbb-222' },
    });
    mockCleanup.mockRejectedValue(new Error('DB down'));

    const res = await request.post('/api/subscriptions/sub_789/cancel');
    await flush();

    // The endpoint responds before the cleanup finishes (fire-and-forget)
    expect(res.status).toBe(200);
  });
});

describe('POST /api/subscriptions/:subscriptionId/pause', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCleanup.mockResolvedValue({ deleted: 0, errors: 0 });
  });

  it('calls cleanupFutureOrdersForLocation with propertyId', async () => {
    mockStripe.subscriptions.update.mockResolvedValue({
      id: 'sub_pause_1',
      metadata: { propertyId: 'loc-ccc-333' },
    });

    const res = await request.post('/api/subscriptions/sub_pause_1/pause');
    await flush();

    expect(res.status).toBe(200);
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith('sub_pause_1', {
      pause_collection: { behavior: 'void' },
    });
    expect(storage.cancelFutureOrdersForLocation).toHaveBeenCalledWith(
      'loc-ccc-333',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(mockCleanup).toHaveBeenCalledWith('loc-ccc-333');
  });

  it('handles missing propertyId gracefully', async () => {
    mockStripe.subscriptions.update.mockResolvedValue({
      id: 'sub_pause_2',
      metadata: {},
    });

    const res = await request.post('/api/subscriptions/sub_pause_2/pause');
    await flush();

    expect(res.status).toBe(200);
    expect(mockCleanup).not.toHaveBeenCalled();
  });
});
