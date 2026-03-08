import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import session from 'express-session';
import supertest from 'supertest';

// Mock all dependencies before imports
vi.mock('../storage', () => ({
  storage: {
    getLocationById: vi.fn(),
    getUserById: vi.fn(),
    upsertCollectionIntent: vi.fn(),
    getCollectionIntent: vi.fn(),
    deleteCollectionIntent: vi.fn(),
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
  pool: {},
}));
vi.mock('../db', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  BaseRepository: class { async query() { return { rows: [] }; } },
}));
vi.mock('../optimoRouteClient', () => ({
  findOrdersForAddress: vi.fn(),
  deleteOrder: vi.fn(),
  createOrder: vi.fn(),
  getRoutes: vi.fn(),
  getCompletionDetailsFull: vi.fn(),
  searchOrders: vi.fn(),
}));
vi.mock('../stripeClient', () => ({
  getUncachableStripeClient: vi.fn(),
  getStripePublishableKey: vi.fn(),
}));
vi.mock('../gmailClient', () => ({ sendEmail: vi.fn() }));
vi.mock('../notificationService', () => ({
  sendMissedCollectionConfirmation: vi.fn().mockResolvedValue(undefined),
  sendServiceUpdate: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendCollectionCompleteNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../collectionDayOptimizer', () => ({
  findOptimalCollectionDay: vi.fn(),
}));
vi.mock('../activateSelections', () => ({
  activatePendingSelections: vi.fn(),
}));
vi.mock('../feasibilityCheck', () => ({
  runFeasibilityAndApprove: vi.fn(),
}));
vi.mock('../routeSuggestionService', () => ({
  geocodeAddress: vi.fn(),
  findNearestZone: vi.fn(),
}));
vi.mock('../slackNotifier', () => ({
  notifyNewAddressReview: vi.fn(),
}));
vi.mock('../addressReviewMessages', () => ({
  approvalMessage: vi.fn().mockReturnValue({ subject: '', text: '', html: '' }),
}));
vi.mock('../uploadMiddleware', () => ({
  onDemandUpload: { single: () => (_req: any, _res: any, next: any) => next() },
  missedCollectionUpload: { single: () => (_req: any, _res: any, next: any) => next() },
}));

import { registerAuthRoutes } from '../authRoutes';
import { storage } from '../storage';
import * as optimoRoute from '../optimoRouteClient';

const TEST_USER_ID = 'user-aaaa-1111';
const TEST_LOCATION_ID = 'loc-bbbb-2222';
const TEST_DATE = '2026-03-12';

const app = express();
app.use(express.json());
app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: true }));
app.use((req, _res, next) => {
  req.session.userId = TEST_USER_ID;
  next();
});
registerAuthRoutes(app);

const request = supertest(app);

describe('POST /api/collection-intent — skip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.getLocationById).mockResolvedValue({
      id: TEST_LOCATION_ID,
      user_id: TEST_USER_ID,
      address: '123 Main St, Springfield',
    } as any);
    vi.mocked(optimoRoute.findOrdersForAddress).mockResolvedValue([]);
    vi.mocked(optimoRoute.deleteOrder).mockResolvedValue({ success: true } as any);
    vi.mocked(storage.upsertCollectionIntent).mockResolvedValue({ id: 'intent-1' } as any);
  });

  it('calls findOrdersForAddress then deleteOrder for matching orders', async () => {
    vi.mocked(optimoRoute.findOrdersForAddress).mockResolvedValue([
      { orderNo: 'SYNC-BBBB-20260312', date: TEST_DATE } as any,
    ]);

    const res = await request.post('/api/collection-intent').send({
      locationId: TEST_LOCATION_ID,
      intent: 'skip',
      date: TEST_DATE,
    });

    expect(res.status).toBe(200);
    expect(optimoRoute.findOrdersForAddress).toHaveBeenCalledWith('123 Main St, Springfield', TEST_DATE, TEST_DATE);
    expect(optimoRoute.deleteOrder).toHaveBeenCalledWith('SYNC-BBBB-20260312', true);
    expect(storage.upsertCollectionIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TEST_USER_ID,
        locationId: TEST_LOCATION_ID,
        intent: 'skip',
        collectionDate: TEST_DATE,
        optimoOrderNo: 'SYNC-BBBB-20260312',
      }),
    );
  });

  it('succeeds silently when no synced order exists for the date', async () => {
    vi.mocked(optimoRoute.findOrdersForAddress).mockResolvedValue([]);

    const res = await request.post('/api/collection-intent').send({
      locationId: TEST_LOCATION_ID,
      intent: 'skip',
      date: TEST_DATE,
    });

    expect(res.status).toBe(200);
    expect(optimoRoute.deleteOrder).not.toHaveBeenCalled();
    expect(storage.upsertCollectionIntent).toHaveBeenCalled();
  });

  it('succeeds when OptimoRoute API fails (non-blocking)', async () => {
    vi.mocked(optimoRoute.findOrdersForAddress).mockRejectedValue(new Error('API timeout'));

    const res = await request.post('/api/collection-intent').send({
      locationId: TEST_LOCATION_ID,
      intent: 'skip',
      date: TEST_DATE,
    });

    expect(res.status).toBe(200);
    expect(storage.upsertCollectionIntent).toHaveBeenCalled();
  });

  it('is idempotent on double skip', async () => {
    vi.mocked(optimoRoute.findOrdersForAddress).mockResolvedValue([
      { orderNo: 'SYNC-BBBB-20260312', date: TEST_DATE } as any,
    ]);

    const res1 = await request.post('/api/collection-intent').send({
      locationId: TEST_LOCATION_ID, intent: 'skip', date: TEST_DATE,
    });
    const res2 = await request.post('/api/collection-intent').send({
      locationId: TEST_LOCATION_ID, intent: 'skip', date: TEST_DATE,
    });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(optimoRoute.deleteOrder).toHaveBeenCalledTimes(2);
  });

  it('returns 403 when location belongs to different user', async () => {
    vi.mocked(storage.getLocationById).mockResolvedValue({
      id: TEST_LOCATION_ID,
      user_id: 'other-user-id',
      address: '123 Main St',
    } as any);

    const res = await request.post('/api/collection-intent').send({
      locationId: TEST_LOCATION_ID, intent: 'skip', date: TEST_DATE,
    });

    expect(res.status).toBe(403);
    expect(optimoRoute.deleteOrder).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/collection-intent — undo skip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.getLocationById).mockResolvedValue({
      id: TEST_LOCATION_ID,
      user_id: TEST_USER_ID,
      address: '123 Main St, Springfield',
    } as any);
    vi.mocked(storage.deleteCollectionIntent).mockResolvedValue(undefined as any);
    vi.mocked(optimoRoute.createOrder).mockResolvedValue({ success: true } as any);
    vi.mocked(storage.getUserById).mockResolvedValue({
      id: TEST_USER_ID,
      first_name: 'Jane',
      last_name: 'Doe',
    } as any);
  });

  it('re-creates OptimoRoute order with SKIP-UNDO prefix when undoing a skip', async () => {
    vi.mocked(storage.getCollectionIntent).mockResolvedValue({ intent: 'skip' } as any);

    const res = await request.delete('/api/collection-intent').send({
      locationId: TEST_LOCATION_ID,
      date: TEST_DATE,
    });

    expect(res.status).toBe(200);
    expect(optimoRoute.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNo: expect.stringMatching(/^SKIP-UNDO-LOC-BBBB-/),
        type: 'P',
        date: TEST_DATE,
        address: '123 Main St, Springfield',
        locationName: 'Jane Doe',
        duration: 10,
        notes: 'Re-created after customer cancelled skip',
      }),
    );
    expect(storage.deleteCollectionIntent).toHaveBeenCalledWith(TEST_LOCATION_ID, TEST_DATE);
  });

  it('does not call createOrder for non-skip intent', async () => {
    vi.mocked(storage.getCollectionIntent).mockResolvedValue({ intent: 'extra' } as any);

    const res = await request.delete('/api/collection-intent').send({
      locationId: TEST_LOCATION_ID,
      date: TEST_DATE,
    });

    expect(res.status).toBe(200);
    expect(optimoRoute.createOrder).not.toHaveBeenCalled();
    expect(storage.deleteCollectionIntent).toHaveBeenCalled();
  });

  it('handles order recreation failure gracefully', async () => {
    vi.mocked(storage.getCollectionIntent).mockResolvedValue({ intent: 'skip' } as any);
    vi.mocked(optimoRoute.createOrder).mockRejectedValue(new Error('API error'));

    const res = await request.delete('/api/collection-intent').send({
      locationId: TEST_LOCATION_ID,
      date: TEST_DATE,
    });

    expect(res.status).toBe(200);
    expect(storage.deleteCollectionIntent).toHaveBeenCalledWith(TEST_LOCATION_ID, TEST_DATE);
  });

  it('does not call createOrder when no existing intent found', async () => {
    vi.mocked(storage.getCollectionIntent).mockResolvedValue(null);

    const res = await request.delete('/api/collection-intent').send({
      locationId: TEST_LOCATION_ID,
      date: TEST_DATE,
    });

    expect(res.status).toBe(200);
    expect(optimoRoute.createOrder).not.toHaveBeenCalled();
  });
});
