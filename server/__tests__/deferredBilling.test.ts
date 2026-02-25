/**
 * Tests for the deferred billing feature:
 * - Pending service selections CRUD (authRoutes)
 * - Subscription guard: reject if property not approved (routes)
 * - Admin approval triggers subscription creation (adminRoutes)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerAuthRoutes } from '../authRoutes';
import { registerRoutes } from '../routes';
import { storage } from '../storage';
import { getUncachableStripeClient, getStripePublishableKey } from '../stripeClient';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('../storage', () => ({
  storage: {
    getUserByEmail: vi.fn(),
    getUserById: vi.fn(),
    createUser: vi.fn(),
    getPropertiesForUser: vi.fn(),
    updateUser: vi.fn(),
    getPropertyById: vi.fn(),
    createProperty: vi.fn(),
    updateProperty: vi.fn(),
    savePendingSelections: vi.fn(),
    getPendingSelections: vi.fn(),
    deletePendingSelections: vi.fn(),
    updateServiceStatus: vi.fn(),
    getPendingReviewProperties: vi.fn(),
    getPendingReviewCount: vi.fn(),
    // stubs needed by other routes
    findReferrerByCode: vi.fn(),
    createReferral: vi.fn(),
    createPasswordResetToken: vi.fn(),
    getValidResetToken: vi.fn(),
    markResetTokenUsed: vi.fn(),
    createMissedPickupReport: vi.fn(),
    getMissedPickupReports: vi.fn(),
    createSpecialPickupRequest: vi.fn(),
    getSpecialPickupRequests: vi.fn(),
    getActiveServiceAlerts: vi.fn(),
    getSpecialPickupServices: vi.fn(),
    getOrCreateReferralCode: vi.fn(),
    getReferralsByUser: vi.fn(),
    getReferralTotalRewards: vi.fn(),
    upsertCollectionIntent: vi.fn(),
    deleteCollectionIntent: vi.fn(),
    getCollectionIntent: vi.fn(),
    upsertDriverFeedback: vi.fn(),
    getDriverFeedbackForProperty: vi.fn(),
    getDriverFeedback: vi.fn(),
    createTipDismissal: vi.fn(),
    getTipDismissalsForProperty: vi.fn(),
    initiateTransfer: vi.fn(),
    getPropertyByTransferToken: vi.fn(),
    cancelTransfer: vi.fn(),
    completeTransfer: vi.fn(),
    getDriverById: vi.fn(),
    query: vi.fn(),
    getPendingReferralForEmail: vi.fn(),
    completeReferral: vi.fn(),
    getCustomer: vi.fn(),
  },
  pool: {},
}));

vi.mock('../db', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

vi.mock('../stripeClient', () => ({
  getUncachableStripeClient: vi.fn(),
  getStripePublishableKey: vi.fn(),
}));

vi.mock('../gmailClient', () => ({ sendEmail: vi.fn() }));
vi.mock('../notificationService', () => ({
  sendMissedPickupConfirmation: vi.fn().mockResolvedValue(undefined),
  sendServiceUpdate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../optimoRouteClient', () => ({
  getNextPickupForAddress: vi.fn(),
  getCompletionHistoryForAddress: vi.fn(),
  getRoutes: vi.fn(),
  searchOrders: vi.fn(),
  createOrder: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseProperty = {
  id: 'prop-1',
  user_id: 'user-1',
  address: '123 Main St, City, CA 90210',
  service_type: 'personal',
  service_status: 'pending_review',
  in_hoa: false,
  community_name: null,
  has_gate_code: false,
  gate_code: null,
  notes: null,
  notification_preferences: {},
  transfer_status: null,
  pending_owner: null,
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
};

const approvedProperty = {
  ...baseProperty,
  service_status: 'approved',
};

const pendingSelections = [
  { id: 'sel-1', propertyId: 'prop-1', userId: 'user-1', serviceId: 'svc-trash', quantity: 1, useSticker: false, createdAt: new Date() },
  { id: 'sel-2', propertyId: 'prop-1', userId: 'user-1', serviceId: 'svc-recycling', quantity: 2, useSticker: true, createdAt: new Date() },
];

// ---------------------------------------------------------------------------
// App factories
// ---------------------------------------------------------------------------
function createAuthApp(userId = 'user-1') {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use((req: any, _res: any, next: any) => { req.session.userId = userId; next(); });
  registerAuthRoutes(app);
  registerRoutes(app);
  return app;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  // Default user mock for ownership verification on customer routes
  vi.mocked(storage.getUserById).mockResolvedValue({
    id: 'user-1',
    first_name: 'Test',
    last_name: 'User',
    email: 'test@example.com',
    phone: '',
    stripe_customer_id: 'cus_test123',
    password_hash: 'hash',
    member_since: '2025-01-01',
    autopay_enabled: false,
    is_admin: false,
    admin_role: null,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
  } as any);

  vi.mocked(getStripePublishableKey).mockResolvedValue('pk_test_123');
  vi.mocked(getUncachableStripeClient).mockResolvedValue({
    customers: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn().mockResolvedValue({ id: 'cus_new' }),
      retrieve: vi.fn().mockResolvedValue({ id: 'cus_test123' }),
    },
    products: {
      list: vi.fn().mockResolvedValue({ data: [
        { id: 'svc-trash', name: 'Trash', default_price: { id: 'price_trash' } },
        { id: 'svc-recycling', name: 'Recycling', default_price: { id: 'price_recycling' } },
      ]}),
    },
    subscriptions: {
      create: vi.fn().mockResolvedValue({ id: 'sub_new', status: 'active' }),
      list: vi.fn().mockResolvedValue({ data: [] }),
      retrieve: vi.fn().mockResolvedValue({ id: 'sub_1' }),
      update: vi.fn().mockResolvedValue({ id: 'sub_1' }),
    },
    setupIntents: {
      create: vi.fn().mockResolvedValue({ client_secret: 'seti_secret' }),
    },
    paymentMethods: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      attach: vi.fn().mockResolvedValue({}),
      detach: vi.fn().mockResolvedValue({}),
    },
    invoices: {
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
    checkout: {
      sessions: { create: vi.fn().mockResolvedValue({ url: 'https://stripe.com/session' }) },
    },
  } as any);
});

// ===========================================================================
// POST /api/properties/:propertyId/pending-selections
// ===========================================================================
describe('POST /api/properties/:propertyId/pending-selections', () => {
  it('saves pending selections for an owned property', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue(baseProperty as any);
    vi.mocked(storage.savePendingSelections).mockResolvedValue(undefined);

    const res = await supertest(createAuthApp())
      .post('/api/properties/prop-1/pending-selections')
      .send({
        selections: [
          { serviceId: 'svc-trash', quantity: 1, useSticker: false },
          { serviceId: 'svc-recycling', quantity: 2, useSticker: true },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(storage.savePendingSelections).toHaveBeenCalledWith('prop-1', 'user-1', [
      { serviceId: 'svc-trash', quantity: 1, useSticker: false },
      { serviceId: 'svc-recycling', quantity: 2, useSticker: true },
    ]);
  });

  it('rejects if property not found', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue(null);

    const res = await supertest(createAuthApp())
      .post('/api/properties/prop-999/pending-selections')
      .send({ selections: [{ serviceId: 'svc-trash', quantity: 1 }] });

    expect(res.status).toBe(404);
  });

  it('rejects if property belongs to different user', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty, user_id: 'other-user' } as any);

    const res = await supertest(createAuthApp())
      .post('/api/properties/prop-1/pending-selections')
      .send({ selections: [{ serviceId: 'svc-trash', quantity: 1 }] });

    expect(res.status).toBe(404);
  });

  it('rejects if selections is not an array', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue(baseProperty as any);

    const res = await supertest(createAuthApp())
      .post('/api/properties/prop-1/pending-selections')
      .send({ selections: 'not-an-array' });

    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// GET /api/properties/:propertyId/pending-selections
// ===========================================================================
describe('GET /api/properties/:propertyId/pending-selections', () => {
  it('returns pending selections for an owned property', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue(baseProperty as any);
    vi.mocked(storage.getPendingSelections).mockResolvedValue(pendingSelections);

    const res = await supertest(createAuthApp())
      .get('/api/properties/prop-1/pending-selections');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].serviceId).toBe('svc-trash');
    expect(res.body.data[1].quantity).toBe(2);
  });

  it('rejects if property not found', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue(null);

    const res = await supertest(createAuthApp())
      .get('/api/properties/prop-999/pending-selections');

    expect(res.status).toBe(404);
  });

  it('rejects if property belongs to different user', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty, user_id: 'other-user' } as any);

    const res = await supertest(createAuthApp())
      .get('/api/properties/prop-1/pending-selections');

    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// POST /api/subscriptions — subscription guard
// ===========================================================================
describe('POST /api/subscriptions (address approval guard)', () => {
  it('rejects subscription creation for pending_review property', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue(baseProperty as any);

    const res = await supertest(createAuthApp())
      .post('/api/subscriptions')
      .send({
        customerId: 'cus_test123',
        priceId: 'price_trash',
        quantity: 1,
        metadata: { propertyId: 'prop-1' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not been approved/);
  });

  it('rejects subscription creation for denied property', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty, service_status: 'denied' } as any);

    const res = await supertest(createAuthApp())
      .post('/api/subscriptions')
      .send({
        customerId: 'cus_test123',
        priceId: 'price_trash',
        metadata: { propertyId: 'prop-1' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not been approved/);
  });

  it('allows subscription creation for approved property', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue(approvedProperty as any);

    const res = await supertest(createAuthApp())
      .post('/api/subscriptions')
      .send({
        customerId: 'cus_test123',
        priceId: 'price_trash',
        quantity: 1,
        metadata: { propertyId: 'prop-1' },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('sub_new');
  });

  it('allows subscription creation without propertyId metadata', async () => {
    const res = await supertest(createAuthApp())
      .post('/api/subscriptions')
      .send({
        customerId: 'cus_test123',
        priceId: 'price_trash',
        quantity: 1,
      });

    expect(res.status).toBe(200);
  });
});
