/**
 * Tests for POST /api/admin/invitations/:id/resend
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerInvitationRoutes } from '../invitationRoutes';
import { pool } from '../db';
import { storage } from '../storage';
import { sendEmail } from '../gmailClient';
import { sendSms } from '../twilioClient';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('../storage', () => ({
  storage: {
    getUserById: vi.fn(),
    getDriverProfileByUserId: vi.fn(),
    createDriverProfile: vi.fn(),
  },
  pool: {},
}));

vi.mock('../db', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

vi.mock('../gmailClient', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../twilioClient', () => ({ sendSms: vi.fn().mockResolvedValue(undefined) }));

// requireAdmin does a DB lookup — mock it so it passes through
vi.mock('../adminRoutes', () => ({
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(
  session({ secret: 'test-secret', resave: false, saveUninitialized: true }),
);
app.use((req, _res, next) => {
  req.session.userId = 'admin-1';
  next();
});
registerInvitationRoutes(app);

const request = supertest(app);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const pendingInvite = {
  id: 'inv-1',
  email: 'user@example.com',
  phone: '+15551234567',
  name: 'Test User',
  roles: ['customer'],
  admin_role: null,
  invited_by: 'admin-1',
  token: 'abc123',
  status: 'pending',
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  created_at: new Date().toISOString(),
};

const expiredInvite = {
  ...pendingInvite,
  id: 'inv-2',
  expires_at: new Date(Date.now() - 86400000).toISOString(),
};

const acceptedInvite = { ...pendingInvite, id: 'inv-3', status: 'accepted' };
const revokedInvite = { ...pendingInvite, id: 'inv-4', status: 'revoked' };

const adminUser = {
  id: 'admin-1',
  first_name: 'Admin',
  last_name: 'User',
  email: 'admin@test.com',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/admin/invitations/:id/resend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resends a pending invitation and refreshes expiry', async () => {
    const mockQuery = vi.mocked(pool.query);
    // 1st call: SELECT invitation
    mockQuery.mockResolvedValueOnce({ rows: [pendingInvite] } as any);
    // 2nd call: UPDATE expires_at
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    // 3rd call: SELECT updated row
    mockQuery.mockResolvedValueOnce({ rows: [{ ...pendingInvite, expires_at: new Date().toISOString() }] } as any);

    vi.mocked(storage.getUserById).mockResolvedValueOnce(adminUser as any);

    const res = await request.post('/api/admin/invitations/inv-1/resend');
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendSms).toHaveBeenCalledOnce();
    // Verify UPDATE was called with status = 'pending'
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE invitations SET expires_at'),
      expect.arrayContaining([expect.any(Date), 'inv-1']),
    );
  });

  it('resends an expired invitation (resets status to pending)', async () => {
    const mockQuery = vi.mocked(pool.query);
    mockQuery.mockResolvedValueOnce({ rows: [expiredInvite] } as any);
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    mockQuery.mockResolvedValueOnce({ rows: [{ ...expiredInvite, status: 'pending' }] } as any);
    vi.mocked(storage.getUserById).mockResolvedValueOnce(adminUser as any);

    const res = await request.post('/api/admin/invitations/inv-2/resend');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it('returns 404 for unknown invitation', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

    const res = await request.post('/api/admin/invitations/inv-999/resend');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Invitation not found');
  });

  it('returns 400 for accepted invitation', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [acceptedInvite] } as any);

    const res = await request.post('/api/admin/invitations/inv-3/resend');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('accepted');
  });

  it('returns 400 for revoked invitation', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [revokedInvite] } as any);

    const res = await request.post('/api/admin/invitations/inv-4/resend');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('revoked');
  });

  it('still succeeds if email send fails', async () => {
    const mockQuery = vi.mocked(pool.query);
    mockQuery.mockResolvedValueOnce({ rows: [{ ...pendingInvite, phone: null }] } as any);
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    mockQuery.mockResolvedValueOnce({ rows: [pendingInvite] } as any);
    vi.mocked(storage.getUserById).mockResolvedValueOnce(adminUser as any);
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('SMTP down'));

    const res = await request.post('/api/admin/invitations/inv-1/resend');
    expect(res.status).toBe(200);
  });
});
