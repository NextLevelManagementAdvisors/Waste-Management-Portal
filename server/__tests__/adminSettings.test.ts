/**
 * Tests for admin settings routes and integration tests.
 * Covers: SETTING_DEFINITIONS structure, GET /api/admin/settings,
 * PUT /api/admin/settings, google_oauth category, displayType metadata,
 * and integration test orchestration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerAdminRoutes } from '../adminRoutes';
import { storage } from '../storage';
import { getAllSettings, saveSetting } from '../settings';
import { testAllIntegrations, testSingleIntegration } from '../integrationTests';
import { roleRepo } from '../repositories/RoleRepository';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('../storage', () => ({
  storage: {
    getUserById: vi.fn(),
    getAdminStats: vi.fn(),
    query: vi.fn(),
    createAuditLog: vi.fn(),
  },
  pool: {},
}));

vi.mock('../db', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
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
  sendPickupReminder: vi.fn().mockResolvedValue(undefined),
  sendBillingAlert: vi.fn().mockResolvedValue(undefined),
  sendServiceUpdate: vi.fn().mockResolvedValue(undefined),
  sendCustomNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../optimoRouteClient', () => ({
  getRoutes: vi.fn(),
  searchOrders: vi.fn(),
  createOrder: vi.fn(),
}));
vi.mock('../repositories/ExpenseRepository', () => ({
  expenseRepo: {},
}));

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(
  session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: true,
  }),
);

// Inject admin session for all requests
app.use((req, _res, next) => {
  req.session.userId = 'admin-1';
  next();
});

registerAdminRoutes(app);

const request = supertest(app);

const adminUser = {
  id: 'admin-1',
  email: 'admin@test.com',
  name: 'Admin',
  admin_role: 'full_admin',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockAdminAuth() {
  vi.mocked(storage.getUserById).mockResolvedValue(adminUser as any);
  vi.mocked(roleRepo.getAdminRole).mockResolvedValue('full_admin');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GET /api/admin/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminAuth();
  });

  it('returns settings with canonical category from SETTING_DEFINITIONS', async () => {
    // Simulate DB rows where OAuth creds still have old 'gmail' category
    vi.mocked(getAllSettings).mockResolvedValue([
      { key: 'GOOGLE_OAUTH_CLIENT_ID', value: 'test-client-id', category: 'gmail', is_secret: false, source: 'db', updated_at: '2024-01-01' },
      { key: 'GOOGLE_OAUTH_CLIENT_SECRET', value: '••••cret', category: 'gmail', is_secret: true, source: 'db', updated_at: '2024-01-01' },
    ]);

    const res = await request.get('/api/admin/settings');
    expect(res.status).toBe(200);

    const oauthClientId = res.body.find((s: any) => s.key === 'GOOGLE_OAUTH_CLIENT_ID');
    const oauthClientSecret = res.body.find((s: any) => s.key === 'GOOGLE_OAUTH_CLIENT_SECRET');

    // Category should be overridden to 'google_oauth' regardless of DB value
    expect(oauthClientId.category).toBe('google_oauth');
    expect(oauthClientSecret.category).toBe('google_oauth');
  });

  it('returns display_type metadata for all settings', async () => {
    vi.mocked(getAllSettings).mockResolvedValue([]);

    const res = await request.get('/api/admin/settings');
    expect(res.status).toBe(200);

    // Every setting should have a display_type
    for (const setting of res.body) {
      expect(setting.display_type).toBeDefined();
      expect(['text', 'secret', 'toggle', 'file_json', 'hidden']).toContain(setting.display_type);
    }
  });

  it('returns correct display_type for specific settings', async () => {
    vi.mocked(getAllSettings).mockResolvedValue([]);

    const res = await request.get('/api/admin/settings');
    const byKey = (key: string) => res.body.find((s: any) => s.key === key);

    expect(byKey('GOOGLE_OAUTH_CLIENT_ID').display_type).toBe('text');
    expect(byKey('GOOGLE_OAUTH_CLIENT_SECRET').display_type).toBe('secret');
    expect(byKey('GOOGLE_SSO_ENABLED').display_type).toBe('toggle');
    expect(byKey('GMAIL_SERVICE_ACCOUNT_JSON').display_type).toBe('file_json');
    expect(byKey('GMAIL_AUTH_MODE').display_type).toBe('hidden');
    expect(byKey('OPTIMO_SYNC_ENABLED').display_type).toBe('toggle');
  });

  it('returns all expected categories', async () => {
    vi.mocked(getAllSettings).mockResolvedValue([]);

    const res = await request.get('/api/admin/settings');
    const categories = [...new Set(res.body.map((s: any) => s.category))];

    expect(categories).toContain('google_oauth');
    expect(categories).toContain('gmail');
    expect(categories).toContain('google_sso');
    expect(categories).toContain('google_maps');
    expect(categories).toContain('twilio');
    expect(categories).toContain('stripe');
    expect(categories).toContain('optimoroute');
    expect(categories).toContain('gemini');
    expect(categories).toContain('app');
  });

  it('merges DB values with definition metadata', async () => {
    vi.mocked(getAllSettings).mockResolvedValue([
      { key: 'TWILIO_ACCOUNT_SID', value: 'AC123', category: 'twilio', is_secret: false, source: 'db', updated_at: '2024-01-01' },
    ]);

    const res = await request.get('/api/admin/settings');
    const twilio = res.body.find((s: any) => s.key === 'TWILIO_ACCOUNT_SID');

    expect(twilio.value).toBe('AC123');
    expect(twilio.label).toBe('Account SID');
    expect(twilio.display_type).toBe('text');
    expect(twilio.source).toBe('db');
  });

  it('falls back to env vars for settings not in DB', async () => {
    vi.mocked(getAllSettings).mockResolvedValue([]);
    process.env.APP_DOMAIN = 'https://test.example.com';

    const res = await request.get('/api/admin/settings');
    const appDomain = res.body.find((s: any) => s.key === 'APP_DOMAIN');

    expect(appDomain.value).toBe('https://test.example.com');
    expect(appDomain.source).toBe('env');

    delete process.env.APP_DOMAIN;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(null as any);
    vi.mocked(roleRepo.getAdminRole).mockResolvedValue(null);

    const unauthApp = express();
    unauthApp.use(express.json());
    unauthApp.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
    registerAdminRoutes(unauthApp);

    const res = await supertest(unauthApp).get('/api/admin/settings');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/admin/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminAuth();
  });

  it('saves a valid setting', async () => {
    vi.mocked(saveSetting).mockResolvedValue(undefined);

    const res = await request
      .put('/api/admin/settings')
      .send({ key: 'APP_DOMAIN', value: 'https://new.example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(saveSetting).toHaveBeenCalledWith('APP_DOMAIN', 'https://new.example.com', 'app', false, 'admin-1');
  });

  it('rejects unknown setting keys', async () => {
    const res = await request
      .put('/api/admin/settings')
      .send({ key: 'UNKNOWN_KEY', value: 'test' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown setting/);
  });

  it('saves google_oauth settings with correct category', async () => {
    vi.mocked(saveSetting).mockResolvedValue(undefined);

    const res = await request
      .put('/api/admin/settings')
      .send({ key: 'GOOGLE_OAUTH_CLIENT_ID', value: 'new-client-id' });

    expect(res.status).toBe(200);
    // Category should be 'google_oauth', not 'gmail'
    expect(saveSetting).toHaveBeenCalledWith(
      'GOOGLE_OAUTH_CLIENT_ID',
      'new-client-id',
      'google_oauth',
      false,
      'admin-1',
    );
  });

  it('rejects missing key or value', async () => {
    const res = await request
      .put('/api/admin/settings')
      .send({ key: 'APP_DOMAIN' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/integrations/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminAuth();
  });

  it('tests all integrations', async () => {
    vi.mocked(testAllIntegrations).mockResolvedValue({
      twilio: { status: 'connected', message: 'OK' },
      google_oauth: { status: 'connected', message: 'OAuth credentials configured' },
    });

    const res = await request.get('/api/admin/integrations/status');
    expect(res.status).toBe(200);
    expect(res.body.results.twilio.status).toBe('connected');
    expect(res.body.results.google_oauth.status).toBe('connected');
  });

  it('tests a single integration', async () => {
    vi.mocked(testSingleIntegration).mockResolvedValue({
      status: 'connected',
      message: 'OAuth credentials configured',
    });

    const res = await request.get('/api/admin/integrations/status?integration=google_oauth');
    expect(res.status).toBe(200);
    expect(res.body.results.google_oauth.status).toBe('connected');
    expect(testSingleIntegration).toHaveBeenCalledWith('google_oauth', undefined);
  });
});

describe('Integration test functions', () => {
  it('google_oauth is a valid test target', async () => {
    // testSingleIntegration should not return "Unknown integration" for google_oauth
    vi.restoreAllMocks();
    // We can't easily test the actual function without network calls,
    // but we verify the function exists in the TEST_MAP by importing directly
    const { testSingleIntegration: realTest } = await vi.importActual<typeof import('../integrationTests')>('../integrationTests');

    // Without credentials, should return not_configured
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const result = await realTest('google_oauth');
    expect(result.status).toBe('not_configured');
    expect(result.message).toMatch(/Missing/);
  });
});
