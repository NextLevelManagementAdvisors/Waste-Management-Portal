/**
 * Integration tests for teamRoutes.ts
 * Covers every route handler registered by registerTeamRoutes().
 * (Google OAuth routes are excluded — they require live network calls to Google.)
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { registerTeamRoutes } from '../teamRoutes';
import { storage } from '../storage';
import { pool as dbPool } from '../db';
import { getUncachableStripeClient } from '../stripeClient';
import { encrypt } from '../encryption';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('../storage', () => ({
  storage: {
    getDriverByEmail: vi.fn(),
    getDriverById: vi.fn(),
    getDriverProfileByUserId: vi.fn(),
    createDriver: vi.fn(),
    createDriverProfile: vi.fn(),
    updateDriver: vi.fn(),
    getW9ByDriverId: vi.fn(),
    createW9: vi.fn(),
    getOpenRoutes: vi.fn(),
    getDriverRoutes: vi.fn(),
    getRouteById: vi.fn(),
    getRouteBids: vi.fn(),
    getRouteStops: vi.fn(),
    getBidByRouteAndDriver: vi.fn(),
    createRouteBid: vi.fn(),
    updateRoute: vi.fn(),
    deleteRouteBid: vi.fn(),
    getDriverSchedule: vi.fn(),
    getUserById: vi.fn(),
    query: vi.fn(),
  },
  pool: {},
}));

vi.mock('../db', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../stripeClient', () => ({
  getUncachableStripeClient: vi.fn(),
  getStripePublishableKey: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const mockUser = {
  id: 'user-1',
  first_name: 'Test',
  last_name: 'Driver',
  email: 'driver@test.com',
  phone: '555-0001',
  password_hash: null as string | null,
};

const mockDriver = {
  id: 'driver-1',
  user_id: 'user-1',
  name: 'Test Driver',
  email: 'driver@test.com',
  phone: '555-0001',
  status: 'active',
  onboarding_status: 'completed',
  rating: '5.00',
  total_jobs_completed: 3,
  w9_completed: true,
  direct_deposit_completed: true,
  stripe_connect_onboarded: false,
  stripe_connect_account_id: null as string | null,
  password_hash: null as string | null,
  availability: null,
  message_email_notifications: false,
  created_at: new Date().toISOString(),
};

const mockW9 = {
  id: 'w9-1',
  driver_id: 'driver-1',
  legal_name: 'Test Driver',
  federal_tax_classification: 'individual',
  address: '123 Main St',
  city: 'Anytown',
  state: 'CA',
  zip: '90210',
  tin_type: 'ssn',
  signature_date: '2024-01-01',
  signature_data: 'data:image/png;base64,abc',
  certification: true,
  account_number_encrypted: null as string | null,
  routing_number_encrypted: null as string | null,
  account_holder_name: null as string | null,
  account_type: null as string | null,
};

const mockRoute = {
  id: 'route-1',
  status: 'open',
  assigned_driver_id: null as string | null,
  address: '456 Elm St',
  scheduled_date: '2024-12-01',
  service_type: 'pickup',
};

const assignedRoute = {
  ...mockRoute,
  id: 'route-2',
  status: 'assigned',
  assigned_driver_id: 'driver-1',
};

const mockBid = {
  id: 'bid-1',
  route_id: 'route-1',
  driver_id: 'driver-1',
  bid_amount: 50,
  message: null,
};

function mockStripe() {
  return {
    accounts: {
      create: vi.fn().mockResolvedValue({ id: 'acct_test123' }),
      retrieve: vi.fn().mockResolvedValue({
        id: 'acct_test123',
        charges_enabled: true,
        payouts_enabled: true,
      }),
    },
    accountLinks: {
      create: vi.fn().mockResolvedValue({ url: 'https://connect.stripe.com/setup' }),
    },
  };
}

// ---------------------------------------------------------------------------
// App factories
// ---------------------------------------------------------------------------
function createApp() {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  registerTeamRoutes(app);
  return app;
}

function createDriverAuthApp(userId = 'user-1') {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use((req: any, _res: any, next: any) => {
    req.session.userId = userId;
    next();
  });
  registerTeamRoutes(app);
  return app;
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------
let testPasswordHash: string;

beforeAll(async () => {
  testPasswordHash = await bcrypt.hash('correctpassword', 1);
});

beforeEach(() => {
  vi.clearAllMocks();

  // Defaults — most tests use a completed driver with a valid user
  // pool.query: handle role check for requireDriverAuth, default empty for others
  vi.mocked(dbPool.query).mockImplementation(async (sql: any) => {
    if (typeof sql === 'string' && sql.includes('user_roles') && sql.includes('SELECT')) {
      return { rows: [{ '?column?': 1 }] } as any;
    }
    return { rows: [] } as any;
  });
  // getDriverProfileByUserId: used by requireDriverAuth middleware
  vi.mocked((storage as any).getDriverProfileByUserId).mockResolvedValue({ ...mockDriver } as any);
  vi.mocked((storage as any).createDriverProfile).mockResolvedValue({ ...mockDriver } as any);

  vi.mocked(storage.getDriverById).mockResolvedValue({ ...mockDriver } as any);
  vi.mocked(storage.getDriverByEmail).mockResolvedValue(null as any);
  vi.mocked(storage.createDriver).mockResolvedValue({ ...mockDriver } as any);
  vi.mocked(storage.updateDriver).mockResolvedValue({ ...mockDriver } as any);
  vi.mocked(storage.getW9ByDriverId).mockResolvedValue(null as any);
  vi.mocked(storage.createW9).mockResolvedValue({ ...mockW9 } as any);
  vi.mocked(storage.getOpenRoutes).mockResolvedValue([] as any);
  vi.mocked(storage.getDriverRoutes).mockResolvedValue([] as any);
  vi.mocked(storage.getRouteById).mockResolvedValue({ ...mockRoute } as any);
  vi.mocked(storage.getRouteBids).mockResolvedValue([] as any);
  vi.mocked(storage.getRouteStops).mockResolvedValue([] as any);
  vi.mocked(storage.getBidByRouteAndDriver).mockResolvedValue(null as any);
  vi.mocked(storage.createRouteBid).mockResolvedValue({ ...mockBid } as any);
  vi.mocked(storage.updateRoute).mockResolvedValue(undefined as any);
  vi.mocked(storage.deleteRouteBid).mockResolvedValue(undefined as any);
  vi.mocked(storage.getDriverSchedule).mockResolvedValue([] as any);
  vi.mocked(storage.getUserById).mockResolvedValue({ ...mockUser } as any);
  vi.mocked(storage.query).mockResolvedValue({ rows: [] } as any);
  vi.mocked(getUncachableStripeClient).mockResolvedValue(mockStripe() as any);
});

// ===========================================================================
// POST /api/team/auth/register
// ===========================================================================
describe('POST /api/team/auth/register', () => {
  it('returns 400 if name is missing', async () => {
    const res = await supertest(createApp())
      .post('/api/team/auth/register')
      .send({ email: 'x@x.com', password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('returns 400 if email is missing', async () => {
    const res = await supertest(createApp())
      .post('/api/team/auth/register')
      .send({ name: 'Bob', password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('returns 409 if email already exists', async () => {
    // pool.query check for existing user returns a row
    vi.mocked(dbPool.query).mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] } as any);
    const res = await supertest(createApp())
      .post('/api/team/auth/register')
      .send({ name: 'Bob', email: 'driver@test.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  it('returns 201 and driver data on success', async () => {
    vi.mocked(dbPool.query)
      .mockResolvedValueOnce({ rows: [] } as any)              // check existing user
      .mockResolvedValueOnce({ rows: [{ id: 'user-1' }] } as any) // INSERT user RETURNING id
      .mockResolvedValueOnce({ rows: [] } as any)              // INSERT driver role
      .mockResolvedValueOnce({ rows: [] } as any);             // INSERT customer role
    const res = await supertest(createApp())
      .post('/api/team/auth/register')
      .send({ name: 'Bob', email: 'new@test.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: 'driver-1' });
  });
});

// ===========================================================================
// POST /api/team/auth/login
// ===========================================================================
describe('POST /api/team/auth/login', () => {
  it('returns 400 if email is missing', async () => {
    const res = await supertest(createApp())
      .post('/api/team/auth/login')
      .send({ password: 'abc12345' });
    expect(res.status).toBe(400);
  });

  it('returns 401 if user not found', async () => {
    // pool.query for user lookup returns no rows (default behavior)
    const res = await supertest(createApp())
      .post('/api/team/auth/login')
      .send({ email: 'no@one.com', password: 'abc12345' });
    expect(res.status).toBe(401);
  });

  it('returns 401 if user has no password hash', async () => {
    vi.mocked(dbPool.query).mockResolvedValueOnce({
      rows: [{ ...mockUser, password_hash: null }],
    } as any);
    const res = await supertest(createApp())
      .post('/api/team/auth/login')
      .send({ email: 'driver@test.com', password: 'abc12345' });
    expect(res.status).toBe(401);
  });

  it('returns 401 if password is wrong', async () => {
    vi.mocked(dbPool.query).mockResolvedValueOnce({
      rows: [{ ...mockUser, password_hash: testPasswordHash }],
    } as any);
    const res = await supertest(createApp())
      .post('/api/team/auth/login')
      .send({ email: 'driver@test.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('returns 200 and driver data on success', async () => {
    vi.mocked(dbPool.query)
      .mockResolvedValueOnce({ rows: [{ ...mockUser, password_hash: testPasswordHash }] } as any)  // user lookup
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as any);  // role check
    const res = await supertest(createApp())
      .post('/api/team/auth/login')
      .send({ email: 'driver@test.com', password: 'correctpassword' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'driver-1' });
  });
});

// ===========================================================================
// POST /api/team/auth/logout
// ===========================================================================
describe('POST /api/team/auth/logout', () => {
  it('returns 200', async () => {
    const res = await supertest(createApp()).post('/api/team/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ===========================================================================
// GET /api/team/auth/me
// ===========================================================================
describe('GET /api/team/auth/me', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).get('/api/team/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 404 if driver profile not found in DB', async () => {
    vi.mocked((storage as any).getDriverProfileByUserId).mockResolvedValueOnce(null as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/auth/me');
    expect(res.status).toBe(404);
  });

  it('returns 200 with driver data', async () => {
    const res = await supertest(createDriverAuthApp()).get('/api/team/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'driver-1', name: 'Test Driver' });
  });
});

// ===========================================================================
// POST /api/team/onboarding/w9
// ===========================================================================
const validW9Body = {
  legal_name: 'Test Driver',
  federal_tax_classification: 'individual',
  address: '123 Main St',
  city: 'Anytown',
  state: 'CA',
  zip: '90210',
  tin_type: 'ssn',
  signature_date: '2024-01-01',
  certification: true,
  signature_data: 'data:image/png;base64,abc',
};

describe('POST /api/team/onboarding/w9', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).post('/api/team/onboarding/w9').send(validW9Body);
    expect(res.status).toBe(401);
  });

  it('returns 400 if required fields are missing', async () => {
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/onboarding/w9')
      .send({ legal_name: 'Only This' });
    expect(res.status).toBe(400);
  });

  it('returns 409 if W9 already submitted', async () => {
    vi.mocked(storage.getW9ByDriverId).mockResolvedValueOnce({ ...mockW9 } as any);
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/onboarding/w9')
      .send(validW9Body);
    expect(res.status).toBe(409);
  });

  it('returns 201 and W9 data on success', async () => {
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/onboarding/w9')
      .send(validW9Body);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ driver_id: 'driver-1' });
  });
});

// ===========================================================================
// GET /api/team/onboarding/w9
// ===========================================================================
describe('GET /api/team/onboarding/w9', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).get('/api/team/onboarding/w9');
    expect(res.status).toBe(401);
  });

  it('returns data: null when no W9 on file', async () => {
    const res = await supertest(createDriverAuthApp()).get('/api/team/onboarding/w9');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('returns W9 data without encrypted fields', async () => {
    vi.mocked(storage.getW9ByDriverId).mockResolvedValueOnce({
      ...mockW9,
      account_number_encrypted: 'secret',
      routing_number_encrypted: 'secret',
    } as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/onboarding/w9');
    expect(res.status).toBe(200);
    expect(res.body.data.legal_name).toBe('Test Driver');
    expect(res.body.data.account_number_encrypted).toBeUndefined();
    expect(res.body.data.routing_number_encrypted).toBeUndefined();
  });
});

// ===========================================================================
// PUT /api/team/onboarding/w9
// ===========================================================================
describe('PUT /api/team/onboarding/w9', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).put('/api/team/onboarding/w9').send(validW9Body);
    expect(res.status).toBe(401);
  });

  it('returns 400 if required fields are missing', async () => {
    const res = await supertest(createDriverAuthApp())
      .put('/api/team/onboarding/w9')
      .send({ legal_name: 'Only This' });
    expect(res.status).toBe(400);
  });

  it('returns 400 if certification is missing', async () => {
    const res = await supertest(createDriverAuthApp())
      .put('/api/team/onboarding/w9')
      .send({ ...validW9Body, certification: undefined });
    expect(res.status).toBe(400);
  });

  it('returns 400 if signature_data is missing', async () => {
    const res = await supertest(createDriverAuthApp())
      .put('/api/team/onboarding/w9')
      .send({ ...validW9Body, signature_data: undefined });
    expect(res.status).toBe(400);
  });

  it('returns 200 using query when existing W9', async () => {
    vi.mocked(storage.getW9ByDriverId).mockResolvedValueOnce({ ...mockW9 } as any);
    const res = await supertest(createDriverAuthApp())
      .put('/api/team/onboarding/w9')
      .send(validW9Body);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 200 using createW9 when no existing W9', async () => {
    const res = await supertest(createDriverAuthApp())
      .put('/api/team/onboarding/w9')
      .send(validW9Body);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ===========================================================================
// POST /api/team/onboarding/bank-account
// ===========================================================================
const validBankBody = {
  account_holder_name: 'Test Driver',
  routing_number: '021000021', // valid Chase ABA
  account_number: '123456789',
  account_type: 'checking',
};

describe('POST /api/team/onboarding/bank-account', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp())
      .post('/api/team/onboarding/bank-account')
      .send(validBankBody);
    expect(res.status).toBe(401);
  });

  it('returns 400 if account_holder_name is missing', async () => {
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/onboarding/bank-account')
      .send({ ...validBankBody, account_holder_name: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 if routing number is invalid', async () => {
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/onboarding/bank-account')
      .send({ ...validBankBody, routing_number: '123456789' }); // fails checksum
    expect(res.status).toBe(400);
  });

  it('returns 400 if account number is invalid', async () => {
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/onboarding/bank-account')
      .send({ ...validBankBody, account_number: 'abc' });
    expect(res.status).toBe(400);
  });

  it('returns 400 if account type is invalid', async () => {
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/onboarding/bank-account')
      .send({ ...validBankBody, account_type: 'investment' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with masked account on success', async () => {
    // Calls storage.query 3x + getDriverById; default mocks handle this
    vi.mocked(storage.getDriverById).mockResolvedValue({
      ...mockDriver,
      w9_completed: true,
      direct_deposit_completed: false,
    } as any);
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/onboarding/bank-account')
      .send(validBankBody);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.masked_account).toBe('****6789');
  });
});

// ===========================================================================
// GET /api/team/profile/bank-account
// ===========================================================================
describe('GET /api/team/profile/bank-account', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).get('/api/team/profile/bank-account');
    expect(res.status).toBe(401);
  });

  it('returns has_bank_account: false when no row', async () => {
    vi.mocked(storage.query).mockResolvedValueOnce({ rows: [] } as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/profile/bank-account');
    expect(res.status).toBe(200);
    expect(res.body.has_bank_account).toBe(false);
  });

  it('returns masked account data when row exists', async () => {
    const encryptedAcct = encrypt('1234567890');
    vi.mocked(storage.query).mockResolvedValueOnce({
      rows: [{
        account_holder_name: 'Test Driver',
        account_number_encrypted: encryptedAcct,
        account_type: 'checking',
      }],
    } as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/profile/bank-account');
    expect(res.status).toBe(200);
    expect(res.body.has_bank_account).toBe(true);
    expect(res.body.masked_account).toBe('****7890');
    expect(res.body.account_type).toBe('checking');
  });
});

// ===========================================================================
// POST /api/team/onboarding/bank-account/skip
// ===========================================================================
describe('POST /api/team/onboarding/bank-account/skip', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).post('/api/team/onboarding/bank-account/skip');
    expect(res.status).toBe(401);
  });

  it('returns 200 on success', async () => {
    const res = await supertest(createDriverAuthApp()).post('/api/team/onboarding/bank-account/skip');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ===========================================================================
// POST /api/team/onboarding/stripe-connect
// ===========================================================================
describe('POST /api/team/onboarding/stripe-connect', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).post('/api/team/onboarding/stripe-connect');
    expect(res.status).toBe(401);
  });

  it('returns 200 with new Stripe Connect account', async () => {
    // driver has no stripe_connect_account_id
    vi.mocked(storage.getDriverById).mockResolvedValueOnce({
      ...mockDriver,
      stripe_connect_account_id: null,
    } as any);
    const res = await supertest(createDriverAuthApp()).post('/api/team/onboarding/stripe-connect');
    expect(res.status).toBe(200);
    expect(res.body.data.url).toBe('https://connect.stripe.com/setup');
    expect(res.body.data.accountId).toBe('acct_test123');
  });

  it('returns 200 creating new account link for existing account', async () => {
    vi.mocked(storage.getDriverById).mockResolvedValueOnce({
      ...mockDriver,
      stripe_connect_account_id: 'acct_existing',
    } as any);
    const res = await supertest(createDriverAuthApp()).post('/api/team/onboarding/stripe-connect');
    expect(res.status).toBe(200);
    expect(res.body.data.url).toBe('https://connect.stripe.com/setup');
  });
});

// ===========================================================================
// GET /api/team/onboarding/stripe-connect/status
// ===========================================================================
describe('GET /api/team/onboarding/stripe-connect/status', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).get('/api/team/onboarding/stripe-connect/status');
    expect(res.status).toBe(401);
  });

  it('returns onboarded: false if no accountId on driver', async () => {
    vi.mocked(storage.getDriverById).mockResolvedValueOnce({
      ...mockDriver,
      stripe_connect_account_id: null,
    } as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/onboarding/stripe-connect/status');
    expect(res.status).toBe(200);
    expect(res.body.data.onboarded).toBe(false);
  });

  it('returns onboarded: true when charges and payouts enabled', async () => {
    vi.mocked(storage.getDriverById).mockResolvedValueOnce({
      ...mockDriver,
      stripe_connect_account_id: 'acct_test123',
      w9_completed: true,
    } as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/onboarding/stripe-connect/status');
    expect(res.status).toBe(200);
    expect(res.body.data.onboarded).toBe(true);
  });
});

// ===========================================================================
// GET /api/team/onboarding/stripe-connect/return
// ===========================================================================
describe('GET /api/team/onboarding/stripe-connect/return', () => {
  it('redirects to /team/ (no auth required)', async () => {
    const res = await supertest(createApp()).get('/api/team/onboarding/stripe-connect/return');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/team/');
  });
});

// ===========================================================================
// GET /api/team/onboarding/stripe-connect/refresh
// ===========================================================================
describe('GET /api/team/onboarding/stripe-connect/refresh', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).get('/api/team/onboarding/stripe-connect/refresh');
    expect(res.status).toBe(401);
  });

  it('redirects to /team/ if driver has no Stripe account', async () => {
    vi.mocked(storage.getDriverById).mockResolvedValueOnce({
      ...mockDriver,
      stripe_connect_account_id: null,
    } as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/onboarding/stripe-connect/refresh');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/team/');
  });

  it('redirects to Stripe URL on success', async () => {
    vi.mocked(storage.getDriverById).mockResolvedValueOnce({
      ...mockDriver,
      stripe_connect_account_id: 'acct_test123',
    } as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/onboarding/stripe-connect/refresh');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://connect.stripe.com/setup');
  });
});

// ===========================================================================
// GET /api/team/routes
// ===========================================================================
describe('GET /api/team/routes', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).get('/api/team/routes');
    expect(res.status).toBe(401);
  });

  it('returns 403 if not onboarded', async () => {
    vi.mocked((storage as any).getDriverProfileByUserId).mockResolvedValueOnce({
      ...mockDriver,
      onboarding_status: 'w9_pending',
    } as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/routes');
    expect(res.status).toBe(403);
  });

  it('returns 200 with routes list', async () => {
    vi.mocked(storage.getOpenRoutes).mockResolvedValueOnce([mockRoute] as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/routes');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

// ===========================================================================
// GET /api/team/my-routes
// ===========================================================================
describe('GET /api/team/my-routes', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).get('/api/team/my-routes');
    expect(res.status).toBe(401);
  });

  it('returns 403 if not onboarded', async () => {
    vi.mocked((storage as any).getDriverProfileByUserId).mockResolvedValueOnce({
      ...mockDriver,
      onboarding_status: 'deposit_pending',
    } as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/my-routes');
    expect(res.status).toBe(403);
  });

  it('returns 200 with driver routes', async () => {
    vi.mocked(storage.getDriverRoutes).mockResolvedValueOnce([assignedRoute] as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/my-routes');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

// ===========================================================================
// GET /api/team/routes/:routeId
// ===========================================================================
describe('GET /api/team/routes/:routeId', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).get('/api/team/routes/route-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 if route not found', async () => {
    vi.mocked(storage.getRouteById).mockResolvedValueOnce(null as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/routes/nope');
    expect(res.status).toBe(404);
  });

  it('returns 200 with route and bids', async () => {
    vi.mocked(storage.getRouteBids).mockResolvedValueOnce([mockBid] as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/routes/route-1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('route-1');
    expect(res.body.data.bids).toHaveLength(1);
  });
});

// ===========================================================================
// POST /api/team/routes/:routeId/bid
// ===========================================================================
describe('POST /api/team/routes/:routeId/bid', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp())
      .post('/api/team/routes/route-1/bid')
      .send({ bid_amount: 50 });
    expect(res.status).toBe(401);
  });

  it('returns 400 if bid_amount is missing or zero', async () => {
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/routes/route-1/bid')
      .send({ bid_amount: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 404 if route not found', async () => {
    vi.mocked(storage.getRouteById).mockResolvedValueOnce(null as any);
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/routes/nope/bid')
      .send({ bid_amount: 50 });
    expect(res.status).toBe(404);
  });

  it('returns 400 if route is not open or bidding', async () => {
    vi.mocked(storage.getRouteById).mockResolvedValueOnce({
      ...mockRoute,
      status: 'completed',
    } as any);
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/routes/route-1/bid')
      .send({ bid_amount: 50 });
    expect(res.status).toBe(400);
  });

  it('returns 409 if driver already bid on this route', async () => {
    vi.mocked(storage.getBidByRouteAndDriver).mockResolvedValueOnce({ ...mockBid } as any);
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/routes/route-1/bid')
      .send({ bid_amount: 50 });
    expect(res.status).toBe(409);
  });

  it('returns 201 with bid data on success', async () => {
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/routes/route-1/bid')
      .send({ bid_amount: 75, message: 'I can do it!' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: 'bid-1' });
  });
});

// ===========================================================================
// DELETE /api/team/routes/:routeId/bid
// ===========================================================================
describe('DELETE /api/team/routes/:routeId/bid', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).delete('/api/team/routes/route-1/bid');
    expect(res.status).toBe(401);
  });

  it('returns 404 if bid not found', async () => {
    vi.mocked(storage.getBidByRouteAndDriver).mockResolvedValueOnce(null as any);
    const res = await supertest(createDriverAuthApp()).delete('/api/team/routes/route-1/bid');
    expect(res.status).toBe(404);
  });

  it('returns 200 on success', async () => {
    vi.mocked(storage.getBidByRouteAndDriver).mockResolvedValueOnce({ ...mockBid } as any);
    const res = await supertest(createDriverAuthApp()).delete('/api/team/routes/route-1/bid');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ===========================================================================
// POST /api/team/routes/:routeId/complete
// ===========================================================================
describe('POST /api/team/routes/:routeId/complete', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).post('/api/team/routes/route-2/complete');
    expect(res.status).toBe(401);
  });

  it('returns 404 if route not found', async () => {
    vi.mocked(storage.getRouteById).mockResolvedValueOnce(null as any);
    const res = await supertest(createDriverAuthApp()).post('/api/team/routes/nope/complete');
    expect(res.status).toBe(404);
  });

  it('returns 403 if driver is not assigned', async () => {
    vi.mocked(storage.getRouteById).mockResolvedValueOnce({
      ...assignedRoute,
      assigned_driver_id: 'other-driver',
    } as any);
    const res = await supertest(createDriverAuthApp()).post('/api/team/routes/route-2/complete');
    expect(res.status).toBe(403);
  });

  it('returns 400 if route status is not assigned/in_progress', async () => {
    vi.mocked(storage.getRouteById).mockResolvedValueOnce({
      ...assignedRoute,
      status: 'completed',
    } as any);
    const res = await supertest(createDriverAuthApp()).post('/api/team/routes/route-2/complete');
    expect(res.status).toBe(400);
  });

  it('returns 200 on success', async () => {
    vi.mocked(storage.getRouteById).mockResolvedValueOnce({ ...assignedRoute } as any);
    const res = await supertest(createDriverAuthApp()).post('/api/team/routes/route-2/complete');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ===========================================================================
// GET /api/team/schedule
// ===========================================================================
describe('GET /api/team/schedule', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).get('/api/team/schedule');
    expect(res.status).toBe(401);
  });

  it('returns 403 if not onboarded', async () => {
    vi.mocked((storage as any).getDriverProfileByUserId).mockResolvedValueOnce({
      ...mockDriver,
      onboarding_status: 'w9_pending',
    } as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/schedule');
    expect(res.status).toBe(403);
  });

  it('returns 200 with schedule', async () => {
    vi.mocked(storage.getDriverSchedule).mockResolvedValueOnce([assignedRoute] as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/schedule');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

// ===========================================================================
// GET /api/team/profile
// ===========================================================================
describe('GET /api/team/profile', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).get('/api/team/profile');
    expect(res.status).toBe(401);
  });

  it('returns 404 if driver profile not found', async () => {
    vi.mocked((storage as any).getDriverProfileByUserId).mockResolvedValueOnce(null as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/profile');
    expect(res.status).toBe(404);
  });

  it('returns 200 with driver profile', async () => {
    const res = await supertest(createDriverAuthApp()).get('/api/team/profile');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'driver-1', name: 'Test Driver' });
  });
});

// ===========================================================================
// PUT /api/team/profile
// ===========================================================================
describe('PUT /api/team/profile', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).put('/api/team/profile').send({ name: 'New Name' });
    expect(res.status).toBe(401);
  });

  it('returns 200 with updated profile', async () => {
    vi.mocked(storage.updateDriver).mockResolvedValueOnce({
      ...mockDriver,
      name: 'New Name',
    } as any);
    const res = await supertest(createDriverAuthApp())
      .put('/api/team/profile')
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
  });
});

// ===========================================================================
// GET /api/team/onboarding/status
// ===========================================================================
describe('GET /api/team/onboarding/status', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).get('/api/team/onboarding/status');
    expect(res.status).toBe(401);
  });

  it('returns 404 if driver not found in getDriverById', async () => {
    vi.mocked(storage.getDriverById).mockResolvedValueOnce(null as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/onboarding/status');
    expect(res.status).toBe(404);
  });

  it('returns 200 with onboarding status fields', async () => {
    const res = await supertest(createDriverAuthApp()).get('/api/team/onboarding/status');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      w9_completed: true,
      direct_deposit_completed: true,
      onboarding_status: 'completed',
    });
  });
});

// ===========================================================================
// GET /api/team/profile/message-notifications
// ===========================================================================
describe('GET /api/team/profile/message-notifications', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).get('/api/team/profile/message-notifications');
    expect(res.status).toBe(401);
  });

  it('returns the preference value from DB', async () => {
    vi.mocked(storage.query).mockResolvedValueOnce({
      rows: [{ message_email_notifications: true }],
    } as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/profile/message-notifications');
    expect(res.status).toBe(200);
    expect(res.body.message_email_notifications).toBe(true);
  });

  it('defaults to false when no row', async () => {
    vi.mocked(storage.query).mockResolvedValueOnce({ rows: [] } as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/profile/message-notifications');
    expect(res.status).toBe(200);
    expect(res.body.message_email_notifications).toBe(false);
  });
});

// ===========================================================================
// PUT /api/team/profile/message-notifications
// ===========================================================================
describe('PUT /api/team/profile/message-notifications', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp())
      .put('/api/team/profile/message-notifications')
      .send({ enabled: true });
    expect(res.status).toBe(401);
  });

  it('returns 400 if enabled is not a boolean', async () => {
    const res = await supertest(createDriverAuthApp())
      .put('/api/team/profile/message-notifications')
      .send({ enabled: 'yes' });
    expect(res.status).toBe(400);
  });

  it('returns 200 and echoes the new preference', async () => {
    const res = await supertest(createDriverAuthApp())
      .put('/api/team/profile/message-notifications')
      .send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message_email_notifications).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SSO Guard
// ---------------------------------------------------------------------------
describe('GET /api/team/auth/google — SSO guard', () => {
  it('returns 403 when SSO is disabled', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_SSO_ENABLED = 'false';

    const res = await supertest(createApp()).get('/api/team/auth/google');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/disabled/i);
  });
});
