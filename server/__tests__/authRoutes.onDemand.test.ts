import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import session from 'express-session';
import supertest from 'supertest';

// Mock all dependencies before imports
vi.mock('../storage', () => ({
  storage: {
    getLocationById: vi.fn(),
    getUserById: vi.fn(),
    getOnDemandRequestById: vi.fn(),
    updateOnDemandRequest: vi.fn(),
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
  pool: {},
}));
vi.mock('../db', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  BaseRepository: class { async query() { return { rows: [] }; } },
}));
vi.mock('../optimoRouteClient', () => ({
  deleteOrder: vi.fn(),
  updateOrder: vi.fn(),
  findOrdersForAddress: vi.fn(),
  getRoutes: vi.fn(),
  getCompletionDetailsFull: vi.fn(),
  searchOrders: vi.fn(),
  createOrder: vi.fn(),
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
}));
vi.mock('../collectionDayOptimizer', () => ({ findOptimalCollectionDay: vi.fn() }));
vi.mock('../activateSelections', () => ({ activatePendingSelections: vi.fn() }));
vi.mock('../feasibilityCheck', () => ({ runFeasibilityAndApprove: vi.fn() }));
vi.mock('../routeSuggestionService', () => ({ geocodeAddress: vi.fn(), findNearestZone: vi.fn() }));
vi.mock('../slackNotifier', () => ({ notifyNewAddressReview: vi.fn() }));
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
const TEST_REQUEST_ID = 'abcdef12-1111-2222-3333-abcdef123456';
const EXPECTED_ORDER_NO = 'OD-ABCDEF12';

const app = express();
app.use(express.json());
app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: true }));
app.use((req, _res, next) => {
  req.session.userId = TEST_USER_ID;
  next();
});
registerAuthRoutes(app);

const request = supertest(app);

describe('PUT /api/on-demand-request/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.getOnDemandRequestById).mockResolvedValue({
      id: TEST_REQUEST_ID,
      user_id: TEST_USER_ID,
      status: 'pending',
      service_name: 'Bulk Pickup',
      address: '456 Oak Ave',
    } as any);
    vi.mocked(storage.updateOnDemandRequest).mockResolvedValue({ id: TEST_REQUEST_ID } as any);
    vi.mocked(optimoRoute.deleteOrder).mockResolvedValue({ success: true } as any);
    vi.mocked(optimoRoute.updateOrder).mockResolvedValue({ success: true } as any);
  });

  describe('cancellation', () => {
    it('calls deleteOrder with OD-prefixed orderNo', async () => {
      const res = await request.put(`/api/on-demand-request/${TEST_REQUEST_ID}`).send({
        status: 'cancelled',
        cancellationReason: 'Changed my mind',
      });

      expect(res.status).toBe(200);
      expect(optimoRoute.deleteOrder).toHaveBeenCalledWith(EXPECTED_ORDER_NO);
      expect(storage.updateOnDemandRequest).toHaveBeenCalledWith(
        TEST_REQUEST_ID,
        expect.objectContaining({ status: 'cancelled', cancellationReason: 'Changed my mind' }),
      );
    });

    it('succeeds when OptimoRoute delete fails', async () => {
      vi.mocked(optimoRoute.deleteOrder).mockRejectedValue(new Error('API error'));

      const res = await request.put(`/api/on-demand-request/${TEST_REQUEST_ID}`).send({
        status: 'cancelled',
      });

      expect(res.status).toBe(200);
      expect(storage.updateOnDemandRequest).toHaveBeenCalled();
    });

    it('rejects modification of completed requests', async () => {
      vi.mocked(storage.getOnDemandRequestById).mockResolvedValue({
        id: TEST_REQUEST_ID,
        user_id: TEST_USER_ID,
        status: 'completed',
      } as any);

      const res = await request.put(`/api/on-demand-request/${TEST_REQUEST_ID}`).send({
        status: 'cancelled',
      });

      expect(res.status).toBe(400);
      expect(optimoRoute.deleteOrder).not.toHaveBeenCalled();
    });
  });

  describe('reschedule', () => {
    it('calls updateOrder with new date', async () => {
      const res = await request.put(`/api/on-demand-request/${TEST_REQUEST_ID}`).send({
        date: '2026-04-01',
      });

      expect(res.status).toBe(200);
      expect(optimoRoute.updateOrder).toHaveBeenCalledWith(EXPECTED_ORDER_NO, { date: '2026-04-01' });
      expect(storage.updateOnDemandRequest).toHaveBeenCalledWith(
        TEST_REQUEST_ID,
        expect.objectContaining({ requestedDate: '2026-04-01' }),
      );
    });

    it('succeeds when OptimoRoute update fails', async () => {
      vi.mocked(optimoRoute.updateOrder).mockRejectedValue(new Error('API error'));

      const res = await request.put(`/api/on-demand-request/${TEST_REQUEST_ID}`).send({
        date: '2026-04-01',
      });

      expect(res.status).toBe(200);
      expect(storage.updateOnDemandRequest).toHaveBeenCalled();
    });

    it('returns 400 when neither status nor date provided', async () => {
      const res = await request.put(`/api/on-demand-request/${TEST_REQUEST_ID}`).send({});

      expect(res.status).toBe(400);
      expect(optimoRoute.deleteOrder).not.toHaveBeenCalled();
      expect(optimoRoute.updateOrder).not.toHaveBeenCalled();
    });
  });

  it('returns 403 when request belongs to different user', async () => {
    vi.mocked(storage.getOnDemandRequestById).mockResolvedValue({
      id: TEST_REQUEST_ID,
      user_id: 'other-user',
      status: 'pending',
    } as any);

    const res = await request.put(`/api/on-demand-request/${TEST_REQUEST_ID}`).send({
      status: 'cancelled',
    });

    expect(res.status).toBe(403);
    expect(optimoRoute.deleteOrder).not.toHaveBeenCalled();
  });
});
