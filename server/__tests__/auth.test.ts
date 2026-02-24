/**
 * Integration tests for authRoutes.ts
 * Covers every route handler registered by registerAuthRoutes().
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { registerAuthRoutes } from '../authRoutes';
import { storage } from '../storage';
import { getUncachableStripeClient } from '../stripeClient';

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
    query: vi.fn(),
    getPendingReferralForEmail: vi.fn(),
    completeReferral: vi.fn(),
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
  // Route handlers call .catch() on the return value, so these must return Promises
  sendMissedPickupConfirmation: vi.fn().mockResolvedValue(undefined),
  sendServiceUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../optimoRouteClient', () => ({
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
  return app;
}

/** Injects req.session.userId on every request — bypasses requireAuth. */
function createAuthApp(userId = 'user-1') {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use((req: any, _res: any, next: any) => { req.session.userId = userId; next(); });
  registerAuthRoutes(app);
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
  password_hash: '',
};

const baseProperty = {
  id: 'prop-1',
  user_id: 'user-1',
  address: '123 Main St',
  service_type: 'personal',
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

let testPasswordHash: string;

beforeAll(async () => {
  testPasswordHash = await bcrypt.hash('correctpassword12345', 1);
});

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(getUncachableStripeClient).mockResolvedValue({
    customers: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn().mockResolvedValue({ id: 'cus_test123' }),
      update: vi.fn().mockResolvedValue({}),
      retrieve: vi.fn().mockResolvedValue({ balance: 0 }),
    },
    invoices: {
      create: vi.fn().mockResolvedValue({ id: 'in_test123' }),
      finalizeInvoice: vi.fn().mockResolvedValue({ id: 'in_test123' }),
    },
    invoiceItems: { create: vi.fn().mockResolvedValue({}) },
  } as any);

  vi.mocked(storage.getPropertiesForUser).mockResolvedValue([]);
  vi.mocked(storage.query).mockResolvedValue({ rows: [] } as any);
});

// ===========================================================================
// POST /api/auth/register
// ===========================================================================
describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.mocked(storage.getUserByEmail).mockResolvedValue(null);
    vi.mocked(storage.createUser).mockResolvedValue({ ...baseUser, email: 'jane@example.com', first_name: 'Jane', last_name: 'Smith' } as any);
  });

  it('returns 201 with user data on success', async () => {
    const res = await supertest(createApp()).post('/api/auth/register').send({ firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', password: 'securepassword123' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'jane@example.com', firstName: 'Jane' });
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await supertest(createApp()).post('/api/auth/register').send({ email: 'test@example.com', password: 'somepassword123' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is shorter than 12 characters', async () => {
    const res = await supertest(createApp()).post('/api/auth/register').send({ firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', password: 'tooshort' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/12 characters/);
  });

  it('returns 409 when email is already registered', async () => {
    vi.mocked(storage.getUserByEmail).mockResolvedValue({ ...baseUser } as any);
    const res = await supertest(createApp()).post('/api/auth/register').send({ firstName: 'Jane', lastName: 'Smith', email: 'existing@example.com', password: 'securepassword123' });
    expect(res.status).toBe(409);
  });
});

// ===========================================================================
// POST /api/auth/login
// ===========================================================================
describe('POST /api/auth/login', () => {
  it('returns 200 with user data on correct credentials', async () => {
    vi.mocked(storage.getUserByEmail).mockResolvedValue({ ...baseUser, password_hash: testPasswordHash } as any);
    const res = await supertest(createApp()).post('/api/auth/login').send({ email: 'john@example.com', password: 'correctpassword12345' });
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('john@example.com');
  });

  it('returns 401 with wrong password', async () => {
    vi.mocked(storage.getUserByEmail).mockResolvedValue({ ...baseUser, password_hash: testPasswordHash } as any);
    const res = await supertest(createApp()).post('/api/auth/login').send({ email: 'john@example.com', password: 'wrongpassword12345' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when email does not exist', async () => {
    vi.mocked(storage.getUserByEmail).mockResolvedValue(null);
    const res = await supertest(createApp()).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'somepassword12345' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when email or password is absent', async () => {
    const res = await supertest(createApp()).post('/api/auth/login').send({ email: 'john@example.com' });
    expect(res.status).toBe(400);
  });

  it('returns 429 after 5 consecutive failed attempts (lockout)', async () => {
    const lockedEmail = `lock_${Date.now()}@example.com`;
    vi.mocked(storage.getUserByEmail).mockResolvedValue({ ...baseUser, email: lockedEmail, password_hash: testPasswordHash } as any);
    const app = createApp();
    for (let i = 0; i < 5; i++) {
      await supertest(app).post('/api/auth/login').send({ email: lockedEmail, password: 'wrongpassword12345' });
    }
    const res = await supertest(app).post('/api/auth/login').send({ email: lockedEmail, password: 'wrongpassword12345' });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/locked/i);
  });
});

// ===========================================================================
// POST /api/auth/logout
// ===========================================================================
describe('POST /api/auth/logout', () => {
  it('returns 200 with success:true', async () => {
    const res = await supertest(createApp()).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ===========================================================================
// GET /api/auth/me
// ===========================================================================
describe('GET /api/auth/me', () => {
  it('returns 401 when not authenticated', async () => {
    expect((await supertest(createApp()).get('/api/auth/me')).status).toBe(401);
  });

  it('returns 200 with user data when authenticated', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({ ...baseUser } as any);
    const res = await supertest(createAuthApp()).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('john@example.com');
  });
});

// ===========================================================================
// POST /api/properties
// ===========================================================================
describe('POST /api/properties', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).post('/api/properties').send({ address: '123 Main St' })).status).toBe(401);
  });

  it('returns 201 with property data on success', async () => {
    vi.mocked(storage.createProperty).mockResolvedValue({ ...baseProperty } as any);
    const res = await supertest(createAuthApp()).post('/api/properties').send({ address: '123 Main St', serviceType: 'personal' });
    expect(res.status).toBe(201);
    expect(res.body.data.address).toBe('123 Main St');
  });

  it('returns 400 when address is missing', async () => {
    expect((await supertest(createAuthApp()).post('/api/properties').send({ serviceType: 'personal' })).status).toBe(400);
  });
});

// ===========================================================================
// PUT /api/properties/:id
// ===========================================================================
describe('PUT /api/properties/:id', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).put('/api/properties/prop-1').send({ address: '456 Oak Ave' })).status).toBe(401);
  });

  it('returns 200 with updated property', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty } as any);
    vi.mocked(storage.updateProperty).mockResolvedValue({ ...baseProperty, address: '456 Oak Ave' } as any);
    const res = await supertest(createAuthApp()).put('/api/properties/prop-1').send({ address: '456 Oak Ave' });
    expect(res.status).toBe(200);
  });

  it('returns 404 when property not found or not owned', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty, user_id: 'other-user' } as any);
    expect((await supertest(createAuthApp()).put('/api/properties/prop-1').send({ address: '456 Oak Ave' })).status).toBe(404);
  });
});

// ===========================================================================
// PUT /api/auth/profile
// ===========================================================================
describe('PUT /api/auth/profile', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).put('/api/auth/profile').send({ firstName: 'Jane' })).status).toBe(401);
  });

  it('returns 200 with updated user', async () => {
    vi.mocked(storage.getUserByEmail).mockResolvedValue(null);
    vi.mocked(storage.updateUser).mockResolvedValue({ ...baseUser, first_name: 'Jane' } as any);
    const res = await supertest(createAuthApp()).put('/api/auth/profile').send({ firstName: 'Jane' });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('Jane');
  });

  it('returns 409 when new email is taken by another user', async () => {
    vi.mocked(storage.getUserByEmail).mockResolvedValue({ ...baseUser, id: 'other-user' } as any);
    expect((await supertest(createAuthApp()).put('/api/auth/profile').send({ email: 'taken@example.com' })).status).toBe(409);
  });
});

// ===========================================================================
// PUT /api/auth/password
// ===========================================================================
describe('PUT /api/auth/password', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).put('/api/auth/password').send({ currentPassword: 'old', newPassword: 'newpassword123456' })).status).toBe(401);
  });

  it('returns 200 when password is changed successfully', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({ ...baseUser, password_hash: testPasswordHash } as any);
    vi.mocked(storage.updateUser).mockResolvedValue({ ...baseUser } as any);
    const res = await supertest(createAuthApp()).put('/api/auth/password').send({ currentPassword: 'correctpassword12345', newPassword: 'newpassword123456' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 401 when current password is wrong', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({ ...baseUser, password_hash: testPasswordHash } as any);
    expect((await supertest(createAuthApp()).put('/api/auth/password').send({ currentPassword: 'wrongoldpassword', newPassword: 'newpassword123456' })).status).toBe(401);
  });

  it('returns 400 when new password is shorter than 12 characters', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({ ...baseUser, password_hash: testPasswordHash } as any);
    expect((await supertest(createAuthApp()).put('/api/auth/password').send({ currentPassword: 'correctpassword12345', newPassword: 'short' })).status).toBe(400);
  });
});

// ===========================================================================
// POST /api/auth/forgot-password
// ===========================================================================
describe('POST /api/auth/forgot-password', () => {
  it('always returns 200 (prevents email enumeration)', async () => {
    vi.mocked(storage.getUserByEmail).mockResolvedValue(null);
    const res = await supertest(createApp()).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when email is missing', async () => {
    expect((await supertest(createApp()).post('/api/auth/forgot-password').send({})).status).toBe(400);
  });
});

// ===========================================================================
// GET /api/auth/verify-reset-token
// ===========================================================================
describe('GET /api/auth/verify-reset-token', () => {
  it('returns 400 when token query param is missing', async () => {
    expect((await supertest(createApp()).get('/api/auth/verify-reset-token')).status).toBe(400);
  });

  it('returns 200 for a valid token', async () => {
    vi.mocked(storage.getValidResetToken).mockResolvedValue({ user_id: 'user-1', token: 'abc123', expires_at: new Date() } as any);
    const res = await supertest(createApp()).get('/api/auth/verify-reset-token?token=abc123');
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  it('returns 400 for an expired/invalid token', async () => {
    vi.mocked(storage.getValidResetToken).mockResolvedValue(null);
    expect((await supertest(createApp()).get('/api/auth/verify-reset-token?token=expired')).status).toBe(400);
  });
});

// ===========================================================================
// POST /api/auth/reset-password
// ===========================================================================
describe('POST /api/auth/reset-password', () => {
  it('returns 200 when password is reset successfully', async () => {
    vi.mocked(storage.getValidResetToken).mockResolvedValue({ user_id: 'user-1' } as any);
    vi.mocked(storage.updateUser).mockResolvedValue({ ...baseUser } as any);
    vi.mocked(storage.markResetTokenUsed).mockResolvedValue(undefined);
    const res = await supertest(createApp()).post('/api/auth/reset-password').send({ token: 'abc123', newPassword: 'newpassword123456' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 for an invalid token', async () => {
    vi.mocked(storage.getValidResetToken).mockResolvedValue(null);
    expect((await supertest(createApp()).post('/api/auth/reset-password').send({ token: 'bad', newPassword: 'newpassword123456' })).status).toBe(400);
  });

  it('returns 400 when new password is too short', async () => {
    expect((await supertest(createApp()).post('/api/auth/reset-password').send({ token: 'abc123', newPassword: 'short' })).status).toBe(400);
  });
});

// ===========================================================================
// PUT /api/auth/autopay
// ===========================================================================
describe('PUT /api/auth/autopay', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).put('/api/auth/autopay').send({ enabled: true })).status).toBe(401);
  });

  it('returns 200 when autopay is toggled', async () => {
    vi.mocked(storage.updateUser).mockResolvedValue({ ...baseUser } as any);
    const res = await supertest(createAuthApp()).put('/api/auth/autopay').send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when enabled is not a boolean', async () => {
    expect((await supertest(createAuthApp()).put('/api/auth/autopay').send({ enabled: 'yes' })).status).toBe(400);
  });
});

// ===========================================================================
// GET /api/service-alerts  (public)
// ===========================================================================
describe('GET /api/service-alerts', () => {
  it('returns service alerts array', async () => {
    vi.mocked(storage.getActiveServiceAlerts).mockResolvedValue([{ id: '1', message: 'Holiday hours', type: 'info' }] as any);
    const res = await supertest(createApp()).get('/api/service-alerts');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].message).toBe('Holiday hours');
  });
});

// ===========================================================================
// GET /api/special-pickup-services  (public)
// ===========================================================================
describe('GET /api/special-pickup-services', () => {
  it('returns special pickup services', async () => {
    vi.mocked(storage.getSpecialPickupServices).mockResolvedValue([{ id: '1', name: 'Bulk Pickup', description: 'Large items', price: '49.99', icon_name: 'truck' }] as any);
    const res = await supertest(createApp()).get('/api/special-pickup-services');
    expect(res.status).toBe(200);
    expect(res.body.data[0].name).toBe('Bulk Pickup');
    expect(res.body.data[0].price).toBe(49.99);
  });
});

// ===========================================================================
// POST /api/tip-dismissal
// ===========================================================================
describe('POST /api/tip-dismissal', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).post('/api/tip-dismissal').send({ propertyId: 'prop-1', pickupDate: '2025-02-10' })).status).toBe(401);
  });

  it('returns 200 when tip prompt is dismissed', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty } as any);
    vi.mocked(storage.createTipDismissal).mockResolvedValue(undefined);
    const res = await supertest(createAuthApp()).post('/api/tip-dismissal').send({ propertyId: 'prop-1', pickupDate: '2025-02-10' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 when property is not owned by user', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty, user_id: 'other-user' } as any);
    expect((await supertest(createAuthApp()).post('/api/tip-dismissal').send({ propertyId: 'prop-1', pickupDate: '2025-02-10' })).status).toBe(403);
  });
});

// ===========================================================================
// GET /api/tip-dismissals/:propertyId
// ===========================================================================
describe('GET /api/tip-dismissals/:propertyId', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).get('/api/tip-dismissals/prop-1')).status).toBe(401);
  });

  it('returns 200 with dismissed dates', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty } as any);
    vi.mocked(storage.getTipDismissalsForProperty).mockResolvedValue(['2025-02-10'] as any);
    const res = await supertest(createAuthApp()).get('/api/tip-dismissals/prop-1');
    expect(res.status).toBe(200);
    expect(res.body.data).toContain('2025-02-10');
  });

  it('returns 403 when property not owned', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty, user_id: 'other' } as any);
    expect((await supertest(createAuthApp()).get('/api/tip-dismissals/prop-1')).status).toBe(403);
  });
});

// ===========================================================================
// POST /api/missed-pickup
// ===========================================================================
describe('POST /api/missed-pickup', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).post('/api/missed-pickup').send({ propertyId: 'prop-1', date: '2025-02-10' })).status).toBe(401);
  });

  it('returns 200 when report is submitted', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty } as any);
    vi.mocked(storage.createMissedPickupReport).mockResolvedValue({ id: 'rpt-1' } as any);
    const res = await supertest(createAuthApp()).post('/api/missed-pickup').send({ propertyId: 'prop-1', date: '2025-02-10' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 when property not owned', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty, user_id: 'other' } as any);
    expect((await supertest(createAuthApp()).post('/api/missed-pickup').send({ propertyId: 'prop-1', date: '2025-02-10' })).status).toBe(403);
  });
});

// ===========================================================================
// GET /api/missed-pickups
// ===========================================================================
describe('GET /api/missed-pickups', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).get('/api/missed-pickups')).status).toBe(401);
  });

  it('returns 200 with reports array', async () => {
    vi.mocked(storage.getMissedPickupReports).mockResolvedValue([{ id: 'rpt-1' }] as any);
    const res = await supertest(createAuthApp()).get('/api/missed-pickups');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

// ===========================================================================
// POST /api/special-pickup
// ===========================================================================
describe('POST /api/special-pickup', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).post('/api/special-pickup').send({ propertyId: 'prop-1', serviceName: 'Bulk Pickup', servicePrice: 49.99, date: '2025-02-10' })).status).toBe(401);
  });

  it('returns 200 on success', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty } as any);
    vi.mocked(storage.createSpecialPickupRequest).mockResolvedValue({ id: 'sp-1' } as any);
    vi.mocked(storage.getUserById).mockResolvedValue({ ...baseUser } as any);
    const res = await supertest(createAuthApp()).post('/api/special-pickup').send({ propertyId: 'prop-1', serviceName: 'Bulk Pickup', servicePrice: 49.99, date: '2025-02-10' });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('sp-1');
  });

  it('returns 403 when property not owned', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty, user_id: 'other' } as any);
    expect((await supertest(createAuthApp()).post('/api/special-pickup').send({ propertyId: 'prop-1', serviceName: 'Bulk Pickup', servicePrice: 49.99, date: '2025-02-10' })).status).toBe(403);
  });
});

// ===========================================================================
// GET /api/special-pickups
// ===========================================================================
describe('GET /api/special-pickups', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).get('/api/special-pickups')).status).toBe(401);
  });

  it('returns 200 with requests list', async () => {
    vi.mocked(storage.getSpecialPickupRequests).mockResolvedValue([{ id: 'sp-1' }] as any);
    const res = await supertest(createAuthApp()).get('/api/special-pickups');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

// ===========================================================================
// POST /api/collection-intent
// ===========================================================================
describe('POST /api/collection-intent', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).post('/api/collection-intent').send({ propertyId: 'prop-1', intent: 'out', date: '2025-02-10' })).status).toBe(401);
  });

  it('returns 200 when intent is saved', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty } as any);
    vi.mocked(storage.upsertCollectionIntent).mockResolvedValue({ id: 'ci-1' } as any);
    const res = await supertest(createAuthApp()).post('/api/collection-intent').send({ propertyId: 'prop-1', intent: 'out', date: '2025-02-10' });
    expect(res.status).toBe(200);
  });

  it('returns 403 when property not owned', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty, user_id: 'other' } as any);
    expect((await supertest(createAuthApp()).post('/api/collection-intent').send({ propertyId: 'prop-1', intent: 'out', date: '2025-02-10' })).status).toBe(403);
  });
});

// ===========================================================================
// DELETE /api/collection-intent
// ===========================================================================
describe('DELETE /api/collection-intent', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).delete('/api/collection-intent').send({ propertyId: 'prop-1', date: '2025-02-10' })).status).toBe(401);
  });

  it('returns 200 on successful deletion', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty } as any);
    vi.mocked(storage.deleteCollectionIntent).mockResolvedValue(undefined);
    const res = await supertest(createAuthApp()).delete('/api/collection-intent').send({ propertyId: 'prop-1', date: '2025-02-10' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ===========================================================================
// GET /api/collection-intent/:propertyId/:date
// ===========================================================================
describe('GET /api/collection-intent/:propertyId/:date', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).get('/api/collection-intent/prop-1/2025-02-10')).status).toBe(401);
  });

  it('returns 200 with intent data', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty } as any);
    vi.mocked(storage.getCollectionIntent).mockResolvedValue({ intent: 'out' } as any);
    const res = await supertest(createAuthApp()).get('/api/collection-intent/prop-1/2025-02-10');
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// POST /api/driver-feedback
// ===========================================================================
describe('POST /api/driver-feedback', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).post('/api/driver-feedback').send({ propertyId: 'prop-1', pickupDate: '2025-02-10', rating: 5 })).status).toBe(401);
  });

  it('returns 200 when feedback is saved', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty } as any);
    vi.mocked(storage.upsertDriverFeedback).mockResolvedValue({ id: 'fb-1' } as any);
    const res = await supertest(createAuthApp()).post('/api/driver-feedback').send({ propertyId: 'prop-1', pickupDate: '2025-02-10', rating: 5 });
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// GET /api/driver-feedback/:propertyId/list
// ===========================================================================
describe('GET /api/driver-feedback/:propertyId/list', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).get('/api/driver-feedback/prop-1/list')).status).toBe(401);
  });

  it('returns 200 with feedback list', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty } as any);
    vi.mocked(storage.getDriverFeedbackForProperty).mockResolvedValue([{ id: 'fb-1', rating: 5 }] as any);
    const res = await supertest(createAuthApp()).get('/api/driver-feedback/prop-1/list');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

// ===========================================================================
// GET /api/driver-feedback/:propertyId/:pickupDate
// ===========================================================================
describe('GET /api/driver-feedback/:propertyId/:pickupDate', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).get('/api/driver-feedback/prop-1/2025-02-10')).status).toBe(401);
  });

  it('returns 200 with feedback for the given date', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty } as any);
    vi.mocked(storage.getDriverFeedback).mockResolvedValue({ id: 'fb-1', rating: 5 } as any);
    const res = await supertest(createAuthApp()).get('/api/driver-feedback/prop-1/2025-02-10');
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// GET /api/referrals
// ===========================================================================
describe('GET /api/referrals', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).get('/api/referrals')).status).toBe(401);
  });

  it('returns 200 with referral data including code and share link', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({ ...baseUser } as any);
    vi.mocked(storage.getOrCreateReferralCode).mockResolvedValue('REF123' as any);
    vi.mocked(storage.getReferralsByUser).mockResolvedValue([] as any);
    vi.mocked(storage.getReferralTotalRewards).mockResolvedValue(0 as any);
    const res = await supertest(createAuthApp()).get('/api/referrals');
    expect(res.status).toBe(200);
    expect(res.body.data.referralCode).toBe('REF123');
    expect(res.body.data.shareLink).toMatch(/REF123/);
  });
});

// ===========================================================================
// POST /api/account-transfer  (initiate)
// ===========================================================================
describe('POST /api/account-transfer', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).post('/api/account-transfer').send({ propertyId: 'prop-1', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' })).status).toBe(401);
  });

  it('returns 200 when transfer is initiated', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty } as any);
    vi.mocked(storage.initiateTransfer).mockResolvedValue(undefined);
    vi.mocked(storage.getUserById).mockResolvedValue({ ...baseUser } as any);
    const res = await supertest(createAuthApp()).post('/api/account-transfer').send({ propertyId: 'prop-1', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
  });

  it('returns 403 when property not owned', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty, user_id: 'other' } as any);
    expect((await supertest(createAuthApp()).post('/api/account-transfer').send({ propertyId: 'prop-1', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' })).status).toBe(403);
  });
});

// ===========================================================================
// GET /api/account-transfer/:token
// ===========================================================================
describe('GET /api/account-transfer/:token', () => {
  it('returns 200 with transfer details', async () => {
    vi.mocked(storage.getPropertyByTransferToken).mockResolvedValue({ ...baseProperty, pending_owner: { firstName: 'Jane', email: 'jane@example.com' } } as any);
    const res = await supertest(createApp()).get('/api/account-transfer/valid-token');
    expect(res.status).toBe(200);
    expect(res.body.data.address).toBe('123 Main St');
  });

  it('returns 404 for an invalid token', async () => {
    vi.mocked(storage.getPropertyByTransferToken).mockResolvedValue(null);
    expect((await supertest(createApp()).get('/api/account-transfer/bad-token')).status).toBe(404);
  });
});

// ===========================================================================
// POST /api/account-transfer/:token/accept
// ===========================================================================
describe('POST /api/account-transfer/:token/accept', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).post('/api/account-transfer/valid-token/accept')).status).toBe(401);
  });

  it('returns 200 when transfer is accepted (no email restriction)', async () => {
    vi.mocked(storage.getPropertyByTransferToken).mockResolvedValue({ ...baseProperty, pending_owner: null } as any);
    vi.mocked(storage.getUserById).mockResolvedValue({ ...baseUser } as any);
    vi.mocked(storage.completeTransfer).mockResolvedValue(undefined);
    const res = await supertest(createAuthApp()).post('/api/account-transfer/valid-token/accept');
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
  });

  it('returns 403 when logged-in email does not match invitation email', async () => {
    vi.mocked(storage.getPropertyByTransferToken).mockResolvedValue({ ...baseProperty, pending_owner: { email: 'someone-else@example.com' } } as any);
    vi.mocked(storage.getUserById).mockResolvedValue({ ...baseUser } as any);
    expect((await supertest(createAuthApp()).post('/api/account-transfer/valid-token/accept')).status).toBe(403);
  });
});

// ===========================================================================
// POST /api/account-transfer/cancel
// ===========================================================================
describe('POST /api/account-transfer/cancel', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).post('/api/account-transfer/cancel').send({ propertyId: 'prop-1' })).status).toBe(401);
  });

  it('returns 200 when pending transfer is cancelled', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty, transfer_status: 'pending' } as any);
    vi.mocked(storage.cancelTransfer).mockResolvedValue(undefined);
    const res = await supertest(createAuthApp()).post('/api/account-transfer/cancel').send({ propertyId: 'prop-1' });
    expect(res.status).toBe(200);
  });

  it('returns 400 when there is no pending transfer', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty, transfer_status: null } as any);
    expect((await supertest(createAuthApp()).post('/api/account-transfer/cancel').send({ propertyId: 'prop-1' })).status).toBe(400);
  });
});

// ===========================================================================
// POST /api/account-transfer/remind
// ===========================================================================
describe('POST /api/account-transfer/remind', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).post('/api/account-transfer/remind').send({ propertyId: 'prop-1' })).status).toBe(401);
  });

  it('returns 200 when reminder email is sent', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty, transfer_status: 'pending', pending_owner: JSON.stringify({ email: 'newowner@example.com' }) } as any);
    vi.mocked(storage.getUserById).mockResolvedValue({ ...baseUser } as any);
    const res = await supertest(createAuthApp()).post('/api/account-transfer/remind').send({ propertyId: 'prop-1' });
    expect(res.status).toBe(200);
  });

  it('returns 400 when there is no pending transfer', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty, transfer_status: null } as any);
    expect((await supertest(createAuthApp()).post('/api/account-transfer/remind').send({ propertyId: 'prop-1' })).status).toBe(400);
  });
});

// ===========================================================================
// PUT /api/properties/:id/notifications
// ===========================================================================
describe('PUT /api/properties/:id/notifications', () => {
  it('returns 401 without authentication', async () => {
    expect((await supertest(createApp()).put('/api/properties/prop-1/notifications').send({ pickupReminders: { email: true } })).status).toBe(401);
  });

  it('returns 200 when notification preferences are updated', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty } as any);
    vi.mocked(storage.updateProperty).mockResolvedValue({ ...baseProperty } as any);
    const res = await supertest(createAuthApp()).put('/api/properties/prop-1/notifications').send({ pickupReminders: { email: true } });
    expect(res.status).toBe(200);
  });

  it('returns 403 when property not owned', async () => {
    vi.mocked(storage.getPropertyById).mockResolvedValue({ ...baseProperty, user_id: 'other' } as any);
    expect((await supertest(createAuthApp()).put('/api/properties/prop-1/notifications').send({ pickupReminders: { email: true } })).status).toBe(403);
  });
});
