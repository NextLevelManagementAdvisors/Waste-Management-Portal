/**
 * Integration tests for routes.ts
 * Covers: Stripe, OptimoRoute, AI support, profile message notifications.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerAuthRoutes } from '../authRoutes';
import { registerRoutes } from '../routes';
import { storage } from '../storage';
import { getUncachableStripeClient, getStripePublishableKey } from '../stripeClient';
import * as optimoRoute from '../optimoRouteClient';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('../storage', () => ({
  storage: {
    getUserById: vi.fn(),
    getUserByEmail: vi.fn(),
    createUser: vi.fn(),
    getPropertiesForUser: vi.fn(),
    updateUser: vi.fn(),
    getCustomer: vi.fn(),
    query: vi.fn(),
    getPendingReferralForEmail: vi.fn(),
    completeReferral: vi.fn(),
    // stubs for authRoutes side-effects
    findReferrerByCode: vi.fn(),
    createReferral: vi.fn(),
    createPasswordResetToken: vi.fn(),
    getValidResetToken: vi.fn(),
    markResetTokenUsed: vi.fn(),
    getPropertyById: vi.fn(),
    createProperty: vi.fn(),
    updateProperty: vi.fn(),
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
  },
  pool: {},
}));

vi.mock('../stripeClient', () => ({
  getUncachableStripeClient: vi.fn(),
  getStripePublishableKey: vi.fn(),
}));

vi.mock('../gmailClient', () => ({ sendEmail: vi.fn() }));
vi.mock('../notificationService', () => ({
  sendMissedPickupConfirmation: vi.fn(),
  sendServiceUpdate: vi.fn(),
}));
vi.mock('../optimoRouteClient', () => ({
  getNextPickupForAddress: vi.fn(),
  getCompletionHistoryForAddress: vi.fn(),
  getRoutes: vi.fn(),
  searchOrders: vi.fn(),
  createOrder: vi.fn(),
}));

// ---------------------------------------------------------------------------
// App factories
// ---------------------------------------------------------------------------
function createApp() {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  registerAuthRoutes(app);
  registerRoutes(app);
  return app;
}

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
// Shared fixtures
// ---------------------------------------------------------------------------
const baseUser = {
  id: 'user-1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  phone: '',
  member_since: '2025-01-01',
  autopay_enabled: false,
  stripe_customer_id: 'cus_test123',
  is_admin: false,
  admin_role: null,
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
  password_hash: 'hashed',
};

const mockStripe = () => ({
  customers: {
    list: vi.fn().mockResolvedValue({ data: [] }),
    create: vi.fn().mockResolvedValue({ id: 'cus_new', email: 'test@example.com' }),
    update: vi.fn().mockResolvedValue({ id: 'cus_test123', balance: -1000 }),
    retrieve: vi.fn().mockResolvedValue({ id: 'cus_test123', balance: 0 }),
  },
  paymentMethods: {
    list: vi.fn().mockResolvedValue({ data: [{ id: 'pm_1', type: 'card' }] }),
    attach: vi.fn().mockResolvedValue({ id: 'pm_1' }),
    detach: vi.fn().mockResolvedValue({ id: 'pm_1' }),
  },
  setupIntents: {
    create: vi.fn().mockResolvedValue({ client_secret: 'seti_secret_123' }),
  },
  subscriptions: {
    create: vi.fn().mockResolvedValue({ id: 'sub_1', status: 'active' }),
    list: vi.fn().mockResolvedValue({ data: [{ id: 'sub_1', items: { data: [{ price: { product: 'prod_1' } }] } }] }),
    retrieve: vi.fn().mockResolvedValue({ id: 'sub_1', items: { data: [{ id: 'si_1' }] } }),
    update: vi.fn().mockResolvedValue({ id: 'sub_1' }),
    cancel: vi.fn().mockResolvedValue({ id: 'sub_1', status: 'canceled' }),
  },
  products: {
    list: vi.fn().mockResolvedValue({ data: [{ id: 'prod_1', name: 'Weekly Pickup', description: 'desc', active: true, metadata: {}, default_price: null }] }),
    retrieve: vi.fn().mockResolvedValue({ id: 'prod_1', name: 'Weekly Pickup' }),
  },
  prices: {
    list: vi.fn().mockResolvedValue({ data: [{ id: 'price_1', unit_amount: 4999, currency: 'usd', recurring: { interval: 'month' }, active: true, metadata: {} }] }),
  },
  invoices: {
    list: vi.fn().mockResolvedValue({ data: [{ id: 'in_1', status: 'paid' }] }),
    pay: vi.fn().mockResolvedValue({ id: 'in_1', status: 'paid' }),
    create: vi.fn().mockResolvedValue({ id: 'in_new' }),
    finalizeInvoice: vi.fn().mockResolvedValue({ id: 'in_new', status: 'open' }),
  },
  invoiceItems: {
    create: vi.fn().mockResolvedValue({ id: 'ii_1' }),
  },
  checkout: {
    sessions: {
      create: vi.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/pay/cs_1' }),
    },
  },
  billingPortal: {
    sessions: {
      create: vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/p/portal_1' }),
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUncachableStripeClient).mockResolvedValue(mockStripe() as any);
  vi.mocked(getStripePublishableKey).mockResolvedValue('pk_test_123');
  vi.mocked(storage.getPropertiesForUser).mockResolvedValue([]);
  vi.mocked(storage.query).mockResolvedValue({ rows: [] } as any);
  vi.mocked(storage.getPendingReferralForEmail).mockResolvedValue(null);
});

// ===========================================================================
// GET /api/google-maps-key
// ===========================================================================
describe('GET /api/google-maps-key', () => {
  it('returns 500 when GOOGLE_MAPS_API_KEY is not set', async () => {
    const original = process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    const res = await supertest(createApp()).get('/api/google-maps-key');
    expect(res.status).toBe(500);
    process.env.GOOGLE_MAPS_API_KEY = original;
  });

  it('returns the API key when configured', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';
    const res = await supertest(createApp()).get('/api/google-maps-key');
    expect(res.status).toBe(200);
    expect(res.body.apiKey).toBe('test-maps-key');
    delete process.env.GOOGLE_MAPS_API_KEY;
  });
});

// ===========================================================================
// GET /api/stripe/publishable-key
// ===========================================================================
describe('GET /api/stripe/publishable-key', () => {
  it('returns the publishable key', async () => {
    const res = await supertest(createApp()).get('/api/stripe/publishable-key');
    expect(res.status).toBe(200);
    expect(res.body.publishableKey).toBe('pk_test_123');
  });
});

// ===========================================================================
// GET /api/products
// ===========================================================================
describe('GET /api/products', () => {
  it('returns list of active products', async () => {
    const res = await supertest(createApp()).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.data[0].name).toBe('Weekly Pickup');
  });
});

// ===========================================================================
// GET /api/products/:productId/prices
// ===========================================================================
describe('GET /api/products/:productId/prices', () => {
  it('returns prices for a given product', async () => {
    const res = await supertest(createApp()).get('/api/products/prod_1/prices');
    expect(res.status).toBe(200);
    expect(res.body.data[0].id).toBe('price_1');
    expect(res.body.data[0].unit_amount).toBe(4999);
  });
});

// ===========================================================================
// POST /api/customers
// ===========================================================================
describe('POST /api/customers', () => {
  it('creates and returns a Stripe customer', async () => {
    const res = await supertest(createApp()).post('/api/customers').send({ email: 'test@example.com', name: 'Test User' });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('cus_new');
  });
});

// ===========================================================================
// GET /api/customers/:customerId
// ===========================================================================
describe('GET /api/customers/:customerId', () => {
  it('returns 404 when customer not found in DB', async () => {
    vi.mocked(storage.getCustomer).mockResolvedValue(null);
    const res = await supertest(createApp()).get('/api/customers/cus_notfound');
    expect(res.status).toBe(404);
  });

  it('returns customer data when found', async () => {
    vi.mocked(storage.getCustomer).mockResolvedValue({ id: 'cus_test123', email: 'test@example.com' } as any);
    const res = await supertest(createApp()).get('/api/customers/cus_test123');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('cus_test123');
  });
});

// ===========================================================================
// GET /api/customers/:customerId/payment-methods
// ===========================================================================
describe('GET /api/customers/:customerId/payment-methods', () => {
  it('returns payment methods list', async () => {
    const res = await supertest(createApp()).get('/api/customers/cus_test123/payment-methods');
    expect(res.status).toBe(200);
    expect(res.body.data[0].id).toBe('pm_1');
  });
});

// ===========================================================================
// POST /api/customers/:customerId/payment-methods
// ===========================================================================
describe('POST /api/customers/:customerId/payment-methods', () => {
  it('attaches a payment method to customer', async () => {
    const res = await supertest(createApp()).post('/api/customers/cus_test123/payment-methods').send({ paymentMethodId: 'pm_1' });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('pm_1');
  });
});

// ===========================================================================
// DELETE /api/payment-methods/:paymentMethodId
// ===========================================================================
describe('DELETE /api/payment-methods/:paymentMethodId', () => {
  it('detaches the payment method', async () => {
    const res = await supertest(createApp()).delete('/api/payment-methods/pm_1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('pm_1');
  });
});

// ===========================================================================
// POST /api/customers/:customerId/default-payment-method
// ===========================================================================
describe('POST /api/customers/:customerId/default-payment-method', () => {
  it('sets the default payment method', async () => {
    const res = await supertest(createApp()).post('/api/customers/cus_test123/default-payment-method').send({ paymentMethodId: 'pm_1' });
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// POST /api/setup-intent
// ===========================================================================
describe('POST /api/setup-intent', () => {
  it('returns a client secret for a SetupIntent', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({ ...baseUser } as any);
    const res = await supertest(createAuthApp()).post('/api/setup-intent');
    expect(res.status).toBe(200);
    expect(res.body.data.clientSecret).toBe('seti_secret_123');
  });

  it('returns 401 when not authenticated', async () => {
    const res = await supertest(createApp()).post('/api/setup-intent');
    expect(res.status).toBe(401);
  });

  it('returns 400 when user has no stripe_customer_id', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({ ...baseUser, stripe_customer_id: null } as any);
    const res = await supertest(createAuthApp()).post('/api/setup-intent');
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// POST /api/subscriptions
// ===========================================================================
describe('POST /api/subscriptions', () => {
  it('creates and returns a subscription', async () => {
    const res = await supertest(createApp()).post('/api/subscriptions').send({ customerId: 'cus_test123', priceId: 'price_1' });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('sub_1');
  });
});

// ===========================================================================
// GET /api/customers/:customerId/subscriptions
// ===========================================================================
describe('GET /api/customers/:customerId/subscriptions', () => {
  it('returns subscriptions with product details', async () => {
    const res = await supertest(createApp()).get('/api/customers/cus_test123/subscriptions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ===========================================================================
// PATCH /api/subscriptions/:subscriptionId
// ===========================================================================
describe('PATCH /api/subscriptions/:subscriptionId', () => {
  it('updates a subscription (payment method)', async () => {
    const res = await supertest(createApp()).patch('/api/subscriptions/sub_1').send({ paymentMethodId: 'pm_1' });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('sub_1');
  });
});

// ===========================================================================
// POST /api/subscriptions/:subscriptionId/cancel
// ===========================================================================
describe('POST /api/subscriptions/:subscriptionId/cancel', () => {
  it('cancels the subscription', async () => {
    const res = await supertest(createApp()).post('/api/subscriptions/sub_1/cancel');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('canceled');
  });
});

// ===========================================================================
// POST /api/subscriptions/:subscriptionId/pause
// ===========================================================================
describe('POST /api/subscriptions/:subscriptionId/pause', () => {
  it('pauses the subscription', async () => {
    const res = await supertest(createApp()).post('/api/subscriptions/sub_1/pause');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('sub_1');
  });
});

// ===========================================================================
// POST /api/subscriptions/:subscriptionId/resume
// ===========================================================================
describe('POST /api/subscriptions/:subscriptionId/resume', () => {
  it('resumes the subscription', async () => {
    const res = await supertest(createApp()).post('/api/subscriptions/sub_1/resume');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('sub_1');
  });
});

// ===========================================================================
// GET /api/customers/:customerId/invoices
// ===========================================================================
describe('GET /api/customers/:customerId/invoices', () => {
  it('returns invoices for the customer', async () => {
    const res = await supertest(createApp()).get('/api/customers/cus_test123/invoices');
    expect(res.status).toBe(200);
    expect(res.body.data[0].id).toBe('in_1');
  });
});

// ===========================================================================
// POST /api/invoices/:invoiceId/pay
// ===========================================================================
describe('POST /api/invoices/:invoiceId/pay', () => {
  it('pays an invoice', async () => {
    const res = await supertest(createApp()).post('/api/invoices/in_1/pay').send({ paymentMethodId: 'pm_1' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('paid');
  });
});

// ===========================================================================
// POST /api/checkout
// ===========================================================================
describe('POST /api/checkout', () => {
  it('returns a checkout session URL', async () => {
    const res = await supertest(createApp()).post('/api/checkout').send({ customerId: 'cus_test123', priceId: 'price_1', successUrl: 'https://example.com/success', cancelUrl: 'https://example.com/cancel' });
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/stripe\.com/);
  });
});

// ===========================================================================
// POST /api/invoices  (requireAuth)
// ===========================================================================
describe('POST /api/invoices', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).post('/api/invoices').send({ amount: 5000, description: 'Extra service' })).status).toBe(401);
  });

  it('returns 400 when amount or description is missing', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({ ...baseUser } as any);
    expect((await supertest(createAuthApp()).post('/api/invoices').send({ amount: 5000 })).status).toBe(400);
  });

  it('returns 200 with finalized invoice when authenticated', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({ ...baseUser } as any);
    const res = await supertest(createAuthApp()).post('/api/invoices').send({ amount: 5000, description: 'Extra service' });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('in_new');
  });

  it('returns 400 when user has no stripe_customer_id', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({ ...baseUser, stripe_customer_id: null } as any);
    expect((await supertest(createAuthApp()).post('/api/invoices').send({ amount: 5000, description: 'Extra service' })).status).toBe(400);
  });
});

// ===========================================================================
// POST /api/customer-portal
// ===========================================================================
describe('POST /api/customer-portal', () => {
  it('returns billing portal URL', async () => {
    const res = await supertest(createApp()).post('/api/customer-portal').send({ customerId: 'cus_test123', returnUrl: 'https://example.com' });
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/stripe\.com/);
  });
});

// ===========================================================================
// GET /api/optimoroute/next-pickup  (requireAuth + address ownership)
// ===========================================================================
describe('GET /api/optimoroute/next-pickup', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).get('/api/optimoroute/next-pickup?address=123+Main+St')).status).toBe(401);
  });

  it('returns 400 when address query param is missing', async () => {
    expect((await supertest(createAuthApp()).get('/api/optimoroute/next-pickup')).status).toBe(400);
  });

  it('returns 403 when address not in user properties', async () => {
    vi.mocked(storage.getPropertiesForUser).mockResolvedValue([{ address: 'Different St' }] as any);
    expect((await supertest(createAuthApp()).get('/api/optimoroute/next-pickup?address=123+Main+St')).status).toBe(403);
  });

  it('returns 200 with pickup data when address is verified', async () => {
    vi.mocked(storage.getPropertiesForUser).mockResolvedValue([{ address: '123 Main St' }] as any);
    vi.mocked(optimoRoute.getNextPickupForAddress).mockResolvedValue({ date: '2025-02-10' } as any);
    const res = await supertest(createAuthApp()).get('/api/optimoroute/next-pickup?address=123+Main+St');
    expect(res.status).toBe(200);
    expect(res.body.data.date).toBe('2025-02-10');
  });
});

// ===========================================================================
// GET /api/optimoroute/history  (requireAuth + address ownership)
// ===========================================================================
describe('GET /api/optimoroute/history', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).get('/api/optimoroute/history?address=123+Main+St')).status).toBe(401);
  });

  it('returns 400 when address is missing', async () => {
    expect((await supertest(createAuthApp()).get('/api/optimoroute/history')).status).toBe(400);
  });

  it('returns 200 with history when address verified', async () => {
    vi.mocked(storage.getPropertiesForUser).mockResolvedValue([{ address: '123 Main St' }] as any);
    vi.mocked(optimoRoute.getCompletionHistoryForAddress).mockResolvedValue([{ date: '2025-01-01', status: 'done' }] as any);
    const res = await supertest(createAuthApp()).get('/api/optimoroute/history?address=123+Main+St');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

// ===========================================================================
// GET /api/optimoroute/routes  (requireAuth)
// ===========================================================================
describe('GET /api/optimoroute/routes', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).get('/api/optimoroute/routes?date=2025-02-10')).status).toBe(401);
  });

  it('returns 400 when date is missing', async () => {
    expect((await supertest(createAuthApp()).get('/api/optimoroute/routes')).status).toBe(400);
  });

  it('returns 200 with route data', async () => {
    vi.mocked(optimoRoute.getRoutes).mockResolvedValue([{ routeId: 'r1' }] as any);
    const res = await supertest(createAuthApp()).get('/api/optimoroute/routes?date=2025-02-10');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

// ===========================================================================
// GET /api/optimoroute/search  (requireAuth)
// ===========================================================================
describe('GET /api/optimoroute/search', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).get('/api/optimoroute/search?from=2025-01-01&to=2025-02-01')).status).toBe(401);
  });

  it('returns 400 when from or to params are missing', async () => {
    expect((await supertest(createAuthApp()).get('/api/optimoroute/search?from=2025-01-01')).status).toBe(400);
  });

  it('returns 200 with search results', async () => {
    vi.mocked(optimoRoute.searchOrders).mockResolvedValue([{ orderNo: 'SP-001' }] as any);
    const res = await supertest(createAuthApp()).get('/api/optimoroute/search?from=2025-01-01&to=2025-02-01');
    expect(res.status).toBe(200);
    expect(res.body.data[0].orderNo).toBe('SP-001');
  });
});

// ===========================================================================
// POST /api/optimoroute/create-order  (requireAuth + address ownership)
// ===========================================================================
describe('POST /api/optimoroute/create-order', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).post('/api/optimoroute/create-order').send({ orderNo: 'ORD-1', type: 'D', date: '2025-02-10', address: '123 Main St' })).status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    expect((await supertest(createAuthApp()).post('/api/optimoroute/create-order').send({ orderNo: 'ORD-1' })).status).toBe(400);
  });

  it('returns 403 when address not in user properties', async () => {
    vi.mocked(storage.getPropertiesForUser).mockResolvedValue([{ address: 'Other St' }] as any);
    expect((await supertest(createAuthApp()).post('/api/optimoroute/create-order').send({ orderNo: 'ORD-1', type: 'D', date: '2025-02-10', address: '123 Main St' })).status).toBe(403);
  });

  it('returns 200 when order is created', async () => {
    vi.mocked(storage.getPropertiesForUser).mockResolvedValue([{ address: '123 Main St' }] as any);
    vi.mocked(optimoRoute.createOrder).mockResolvedValue({ success: true } as any);
    const res = await supertest(createAuthApp()).post('/api/optimoroute/create-order').send({ orderNo: 'ORD-1', type: 'D', date: '2025-02-10', address: '123 Main St' });
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// POST /api/ai/support  (requireAuth)
// ===========================================================================
describe('POST /api/ai/support', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).post('/api/ai/support').send({ prompt: 'Hello' })).status).toBe(401);
  });

  it('returns 400 when prompt is missing', async () => {
    expect((await supertest(createAuthApp()).post('/api/ai/support').send({})).status).toBe(400);
  });

  it('returns 503 when GEMINI_API_KEY is not configured', async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const res = await supertest(createAuthApp()).post('/api/ai/support').send({ prompt: 'Hello' });
    expect(res.status).toBe(503);
    process.env.GEMINI_API_KEY = original;
  });
});

// ===========================================================================
// GET /api/profile/message-notifications  (requireAuth)
// ===========================================================================
describe('GET /api/profile/message-notifications', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).get('/api/profile/message-notifications')).status).toBe(401);
  });

  it('returns the notification preference', async () => {
    vi.mocked(storage.query).mockResolvedValue({ rows: [{ message_email_notifications: true }] } as any);
    const res = await supertest(createAuthApp()).get('/api/profile/message-notifications');
    expect(res.status).toBe(200);
    expect(res.body.message_email_notifications).toBe(true);
  });

  it('defaults to false when no row is found', async () => {
    vi.mocked(storage.query).mockResolvedValue({ rows: [] } as any);
    const res = await supertest(createAuthApp()).get('/api/profile/message-notifications');
    expect(res.status).toBe(200);
    expect(res.body.message_email_notifications).toBe(false);
  });
});

// ===========================================================================
// PUT /api/profile/message-notifications  (requireAuth)
// ===========================================================================
describe('PUT /api/profile/message-notifications', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).put('/api/profile/message-notifications').send({ enabled: true })).status).toBe(401);
  });

  it('returns 400 when enabled is not a boolean', async () => {
    expect((await supertest(createAuthApp()).put('/api/profile/message-notifications').send({ enabled: 'yes' })).status).toBe(400);
  });

  it('returns 200 and echoes the new preference', async () => {
    const res = await supertest(createAuthApp()).put('/api/profile/message-notifications').send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message_email_notifications).toBe(true);
  });
});
