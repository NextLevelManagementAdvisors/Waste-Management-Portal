/**
 * Integration tests for communicationRoutes.ts
 * Covers all conversation and message routes for drivers, customers, and admins.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerCommunicationRoutes } from '../communicationRoutes';
import { storage } from '../storage';
import { broadcastToParticipants } from '../websocket';
import { sendMessageNotificationEmail } from '../notificationService';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('../storage', () => ({
  storage: {
    getUserById: vi.fn(),
    getDriverById: vi.fn(),
    getDrivers: vi.fn(),
    createDriver: vi.fn(),
    getAllConversations: vi.fn(),
    getConversationById: vi.fn(),
    getConversationParticipants: vi.fn(),
    getConversationsForCustomer: vi.fn(),
    getConversationsForDriver: vi.fn(),
    getMessages: vi.fn(),
    createMessage: vi.fn(),
    createConversation: vi.fn(),
    markConversationRead: vi.fn(),
    isParticipant: vi.fn(),
    getUnreadCount: vi.fn(),
    updateConversationStatus: vi.fn(),
    query: vi.fn(),
  },
  pool: {},
}));

vi.mock('../websocket', () => ({
  broadcastToParticipants: vi.fn(),
}));

vi.mock('../notificationService', () => ({
  // Must return a Promise — callers use .catch()
  sendMessageNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const mockDriver = {
  id: 'driver-1',
  name: 'Test Driver',
  email: 'driver@test.com',
};

const mockAdminUser = {
  id: 'admin-1',
  first_name: 'Admin',
  last_name: 'User',
  is_admin: true,
};

const mockRegularUser = {
  id: 'user-1',
  first_name: 'John',
  last_name: 'Doe',
  is_admin: false,
};

const mockConversation = {
  id: 'conv-1',
  subject: 'Driver Support Request',
  type: 'direct',
  status: 'open',
  created_at: new Date().toISOString(),
};

const mockMessage = {
  id: 'msg-1',
  conversation_id: 'conv-1',
  sender_id: 'driver-1',
  sender_type: 'driver',
  body: 'Hello there!',
  created_at: new Date().toISOString(),
};

// Participant list for a driver ↔ user conversation
const mockParticipants = [
  { participant_id: 'driver-1', participant_type: 'driver', participant_name: 'Test Driver' },
  { participant_id: 'user-1',   participant_type: 'user',   participant_name: 'John Doe' },
];

// ---------------------------------------------------------------------------
// App factories
// ---------------------------------------------------------------------------
function createApp() {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  registerCommunicationRoutes(app);
  return app;
}

function createAuthApp(userId = 'user-1') {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use((req: any, _res: any, next: any) => { req.session.userId = userId; next(); });
  registerCommunicationRoutes(app);
  return app;
}

function createAdminApp(userId = 'admin-1') {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use((req: any, _res: any, next: any) => { req.session.userId = userId; next(); });
  registerCommunicationRoutes(app);
  return app;
}

function createDriverAuthApp(driverId = 'driver-1') {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use((req: any, _res: any, next: any) => { req.session.driverId = driverId; next(); });
  registerCommunicationRoutes(app);
  return app;
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  // Admin check: requireAdmin calls getUserById
  vi.mocked(storage.getUserById).mockResolvedValue(mockAdminUser as any);
  vi.mocked(storage.getDriverById).mockResolvedValue(mockDriver as any);
  vi.mocked(storage.getDrivers).mockResolvedValue([mockDriver] as any);
  vi.mocked(storage.createDriver).mockResolvedValue(mockDriver as any);
  vi.mocked(storage.getAllConversations).mockResolvedValue({ conversations: [], total: 0 } as any);
  vi.mocked(storage.getConversationById).mockResolvedValue(mockConversation as any);
  vi.mocked(storage.getConversationParticipants).mockResolvedValue(mockParticipants as any);
  vi.mocked(storage.getConversationsForCustomer).mockResolvedValue([] as any);
  vi.mocked(storage.getConversationsForDriver).mockResolvedValue([mockConversation] as any);
  vi.mocked(storage.getMessages).mockResolvedValue([mockMessage] as any);
  vi.mocked(storage.createMessage).mockResolvedValue(mockMessage as any);
  vi.mocked(storage.createConversation).mockResolvedValue(mockConversation as any);
  vi.mocked(storage.markConversationRead).mockResolvedValue(undefined as any);
  vi.mocked(storage.isParticipant).mockResolvedValue(true as any);
  vi.mocked(storage.getUnreadCount).mockResolvedValue(3 as any);
  vi.mocked(storage.updateConversationStatus).mockResolvedValue(undefined as any);
  // query used for finding admin in /new routes
  vi.mocked(storage.query).mockResolvedValue({ rows: [{ id: 'admin-1' }] } as any);
});

// ===========================================================================
// DRIVER ROUTES — the main focus
// ===========================================================================

describe('POST /api/team/conversations/new  (driver starts a conversation)', () => {
  it('returns 401 without driver auth', async () => {
    const res = await supertest(createApp())
      .post('/api/team/conversations/new')
      .send({ body: 'Hello, I need help' });
    expect(res.status).toBe(401);
  });

  it('returns 400 if message body is missing', async () => {
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/conversations/new')
      .send({ subject: 'Question' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 400 if body is whitespace only', async () => {
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/conversations/new')
      .send({ body: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 500 when no admin exists', async () => {
    vi.mocked(storage.query).mockResolvedValueOnce({ rows: [] } as any);
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/conversations/new')
      .send({ body: 'Need help' });
    expect(res.status).toBe(500);
  });

  it('returns 200 with conversation and message on success', async () => {
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/conversations/new')
      .send({ body: 'Hey, I have a question about my route.' });
    expect(res.status).toBe(200);
    expect(res.body.conversation).toMatchObject({ id: 'conv-1' });
    expect(res.body.message).toMatchObject({ id: 'msg-1' });
  });

  it('uses custom subject when provided', async () => {
    await supertest(createDriverAuthApp())
      .post('/api/team/conversations/new')
      .send({ subject: 'Route Issue', body: 'My route has a problem.' });
    expect(storage.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Route Issue' })
    );
  });

  it('defaults to "Driver Support Request" when no subject', async () => {
    await supertest(createDriverAuthApp())
      .post('/api/team/conversations/new')
      .send({ body: 'Need help' });
    expect(storage.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Driver Support Request' })
    );
  });

  it('broadcasts conversation:new event to admin via WebSocket', async () => {
    await supertest(createDriverAuthApp())
      .post('/api/team/conversations/new')
      .send({ body: 'Need help' });
    expect(broadcastToParticipants).toHaveBeenCalledWith(
      ['admin:admin-1'],
      'conversation:new',
      expect.objectContaining({ conversationId: 'conv-1', driverName: 'Test Driver' })
    );
  });

  it('creates the initial message with driver sender type', async () => {
    await supertest(createDriverAuthApp())
      .post('/api/team/conversations/new')
      .send({ body: 'Need help with my schedule.' });
    expect(storage.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        senderId: 'driver-1',
        senderType: 'driver',
        body: 'Need help with my schedule.',
      })
    );
  });
});

describe('POST /api/team/conversations/:id/messages  (driver sends a message)', () => {
  it('returns 401 without driver auth', async () => {
    const res = await supertest(createApp())
      .post('/api/team/conversations/conv-1/messages')
      .send({ body: 'Hello' });
    expect(res.status).toBe(401);
  });

  it('returns 403 if driver is not a participant', async () => {
    vi.mocked(storage.isParticipant).mockResolvedValueOnce(false as any);
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/conversations/conv-1/messages')
      .send({ body: 'Hello' });
    expect(res.status).toBe(403);
  });

  it('returns 400 if message body is empty', async () => {
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/conversations/conv-1/messages')
      .send({ body: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 400 if message body is whitespace only', async () => {
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/conversations/conv-1/messages')
      .send({ body: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with message and sender_name on success', async () => {
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/conversations/conv-1/messages')
      .send({ body: 'I am on my way.' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'msg-1',
      body: 'Hello there!',
      sender_name: 'Test Driver',
    });
  });

  it('stores message with senderType "driver"', async () => {
    await supertest(createDriverAuthApp())
      .post('/api/team/conversations/conv-1/messages')
      .send({ body: 'On my way!' });
    expect(storage.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        senderId: 'driver-1',
        senderType: 'driver',
        body: 'On my way!',
      })
    );
  });

  it('marks the conversation as read for the driver', async () => {
    await supertest(createDriverAuthApp())
      .post('/api/team/conversations/conv-1/messages')
      .send({ body: 'Hello' });
    expect(storage.markConversationRead).toHaveBeenCalledWith('conv-1', 'driver-1', 'driver');
  });

  it('broadcasts message:new event to all participants via WebSocket', async () => {
    await supertest(createDriverAuthApp())
      .post('/api/team/conversations/conv-1/messages')
      .send({ body: 'Hello' });
    expect(broadcastToParticipants).toHaveBeenCalledWith(
      expect.arrayContaining(['driver:driver-1', 'user:user-1']),
      'message:new',
      expect.objectContaining({ conversationId: 'conv-1' })
    );
  });

  it('sends email notification to user participants', async () => {
    await supertest(createDriverAuthApp())
      .post('/api/team/conversations/conv-1/messages')
      .send({ body: 'Hello' });
    expect(sendMessageNotificationEmail).toHaveBeenCalledWith(
      'user-1',
      'user',
      'Test Driver',
      'Hello',
      mockConversation.subject
    );
  });

  it('does NOT send email notification to the driver themselves', async () => {
    await supertest(createDriverAuthApp())
      .post('/api/team/conversations/conv-1/messages')
      .send({ body: 'Hello' });
    // Email should only be sent to 'user' type participants, not 'driver'
    const calls = vi.mocked(sendMessageNotificationEmail).mock.calls;
    const driverNotified = calls.some(([, type]) => type === 'driver');
    expect(driverNotified).toBe(false);
  });

  it('falls back to "Driver" for sender_name when driver not found', async () => {
    vi.mocked(storage.getDriverById).mockResolvedValueOnce(null as any);
    const res = await supertest(createDriverAuthApp())
      .post('/api/team/conversations/conv-1/messages')
      .send({ body: 'Hello' });
    expect(res.status).toBe(200);
    expect(res.body.sender_name).toBe('Driver');
  });
});

describe('GET /api/team/conversations', () => {
  it('returns 401 without driver auth', async () => {
    const res = await supertest(createApp()).get('/api/team/conversations');
    expect(res.status).toBe(401);
  });

  it('returns 200 with conversations list', async () => {
    const res = await supertest(createDriverAuthApp()).get('/api/team/conversations');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/team/conversations/unread-count', () => {
  it('returns 401 without driver auth', async () => {
    const res = await supertest(createApp()).get('/api/team/conversations/unread-count');
    expect(res.status).toBe(401);
  });

  it('returns 200 with unread count', async () => {
    const res = await supertest(createDriverAuthApp()).get('/api/team/conversations/unread-count');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
  });
});

describe('GET /api/team/conversations/:id/messages', () => {
  it('returns 401 without driver auth', async () => {
    const res = await supertest(createApp()).get('/api/team/conversations/conv-1/messages');
    expect(res.status).toBe(401);
  });

  it('returns 403 if driver is not a participant', async () => {
    vi.mocked(storage.isParticipant).mockResolvedValueOnce(false as any);
    const res = await supertest(createDriverAuthApp()).get('/api/team/conversations/conv-1/messages');
    expect(res.status).toBe(403);
  });

  it('returns 200 with messages array', async () => {
    const res = await supertest(createDriverAuthApp()).get('/api/team/conversations/conv-1/messages');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({ id: 'msg-1' });
  });
});

describe('PUT /api/team/conversations/:id/read', () => {
  it('returns 401 without driver auth', async () => {
    const res = await supertest(createApp()).put('/api/team/conversations/conv-1/read');
    expect(res.status).toBe(401);
  });

  it('returns 200 and marks conversation read', async () => {
    const res = await supertest(createDriverAuthApp()).put('/api/team/conversations/conv-1/read');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(storage.markConversationRead).toHaveBeenCalledWith('conv-1', 'driver-1', 'driver');
  });
});

// ===========================================================================
// CUSTOMER ROUTES
// ===========================================================================

describe('POST /api/conversations/new  (customer starts a conversation)', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp())
      .post('/api/conversations/new')
      .send({ body: 'Hi' });
    expect(res.status).toBe(401);
  });

  it('returns 400 if body is missing', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(mockRegularUser as any);
    const res = await supertest(createAuthApp())
      .post('/api/conversations/new')
      .send({ subject: 'Test' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with conversation and message on success', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(mockRegularUser as any);
    const res = await supertest(createAuthApp())
      .post('/api/conversations/new')
      .send({ body: 'I need help with my account.' });
    expect(res.status).toBe(200);
    expect(res.body.conversation).toMatchObject({ id: 'conv-1' });
    expect(res.body.message).toMatchObject({ id: 'msg-1' });
  });

  it('broadcasts conversation:new to admin', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(mockRegularUser as any);
    await supertest(createAuthApp())
      .post('/api/conversations/new')
      .send({ body: 'Help!' });
    expect(broadcastToParticipants).toHaveBeenCalledWith(
      ['admin:admin-1'],
      'conversation:new',
      expect.objectContaining({ customerName: 'John Doe' })
    );
  });
});

describe('POST /api/conversations/:id/messages  (customer sends a message)', () => {
  beforeEach(() => {
    vi.mocked(storage.getUserById).mockResolvedValue(mockRegularUser as any);
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(createApp())
      .post('/api/conversations/conv-1/messages')
      .send({ body: 'Hello' });
    expect(res.status).toBe(401);
  });

  it('returns 403 if not a participant', async () => {
    vi.mocked(storage.isParticipant).mockResolvedValueOnce(false as any);
    const res = await supertest(createAuthApp())
      .post('/api/conversations/conv-1/messages')
      .send({ body: 'Hello' });
    expect(res.status).toBe(403);
  });

  it('returns 400 if body is empty', async () => {
    const res = await supertest(createAuthApp())
      .post('/api/conversations/conv-1/messages')
      .send({ body: '' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with message and sender_name', async () => {
    const res = await supertest(createAuthApp())
      .post('/api/conversations/conv-1/messages')
      .send({ body: 'Still waiting.' });
    expect(res.status).toBe(200);
    expect(res.body.sender_name).toBe('John Doe');
  });

  it('stores message with senderType "user"', async () => {
    await supertest(createAuthApp())
      .post('/api/conversations/conv-1/messages')
      .send({ body: 'Update please.' });
    expect(storage.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ senderType: 'user' })
    );
  });

  it('sends email notification to driver participants', async () => {
    // Participants include a driver — they should receive an email
    await supertest(createAuthApp())
      .post('/api/conversations/conv-1/messages')
      .send({ body: 'Hello driver' });
    expect(sendMessageNotificationEmail).toHaveBeenCalledWith(
      'driver-1',
      'driver',
      'John Doe',
      'Hello driver',
      mockConversation.subject
    );
  });
});

describe('GET /api/conversations', () => {
  it('returns 401 without auth', async () => {
    expect((await supertest(createApp()).get('/api/conversations')).status).toBe(401);
  });

  it('returns 200 with conversations', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(mockRegularUser as any);
    const res = await supertest(createAuthApp()).get('/api/conversations');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/conversations/unread-count', () => {
  it('returns 401 without auth', async () => {
    expect((await supertest(createApp()).get('/api/conversations/unread-count')).status).toBe(401);
  });

  it('returns 200 with count', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(mockRegularUser as any);
    const res = await supertest(createAuthApp()).get('/api/conversations/unread-count');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
  });
});

// ===========================================================================
// ADMIN ROUTES
// ===========================================================================

describe('POST /api/admin/conversations/:id/messages  (admin sends a message)', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp())
      .post('/api/admin/conversations/conv-1/messages')
      .send({ body: 'Hi' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    vi.mocked(storage.getUserById).mockResolvedValueOnce(mockRegularUser as any);
    const res = await supertest(createAuthApp())
      .post('/api/admin/conversations/conv-1/messages')
      .send({ body: 'Hi' });
    expect(res.status).toBe(403);
  });

  it('returns 400 if body is empty', async () => {
    const res = await supertest(createAdminApp())
      .post('/api/admin/conversations/conv-1/messages')
      .send({ body: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 404 if conversation not found', async () => {
    vi.mocked(storage.getConversationById).mockResolvedValueOnce(null as any);
    const res = await supertest(createAdminApp())
      .post('/api/admin/conversations/conv-1/messages')
      .send({ body: 'Hello' });
    expect(res.status).toBe(404);
  });

  it('returns 200 with message and sender_name on success', async () => {
    const res = await supertest(createAdminApp())
      .post('/api/admin/conversations/conv-1/messages')
      .send({ body: 'Your issue has been resolved.' });
    expect(res.status).toBe(200);
    expect(res.body.sender_name).toBe('Admin User');
  });

  it('sends email notifications to driver and user participants', async () => {
    await supertest(createAdminApp())
      .post('/api/admin/conversations/conv-1/messages')
      .send({ body: 'Update from admin.' });
    const calls = vi.mocked(sendMessageNotificationEmail).mock.calls;
    const notifiedTypes = calls.map(([, type]) => type);
    expect(notifiedTypes).toContain('user');
    expect(notifiedTypes).toContain('driver');
  });
});

describe('GET /api/admin/drivers', () => {
  it('returns 401 without auth', async () => {
    expect((await supertest(createApp()).get('/api/admin/drivers')).status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    vi.mocked(storage.getUserById).mockResolvedValueOnce(mockRegularUser as any);
    expect((await supertest(createAuthApp()).get('/api/admin/drivers')).status).toBe(403);
  });

  it('returns 200 with drivers list', async () => {
    const res = await supertest(createAdminApp()).get('/api/admin/drivers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/admin/drivers', () => {
  it('returns 400 if name is missing', async () => {
    const res = await supertest(createAdminApp())
      .post('/api/admin/drivers')
      .send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with created driver', async () => {
    const res = await supertest(createAdminApp())
      .post('/api/admin/drivers')
      .send({ name: 'New Driver', email: 'new@driver.com' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'driver-1' });
  });
});

describe('GET /api/admin/conversations', () => {
  it('returns 401 without auth', async () => {
    expect((await supertest(createApp()).get('/api/admin/conversations')).status).toBe(401);
  });

  it('returns 200 with conversations and total', async () => {
    const res = await supertest(createAdminApp()).get('/api/admin/conversations');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('conversations');
    expect(res.body).toHaveProperty('total');
  });
});

describe('PUT /api/admin/conversations/:id/status', () => {
  it('returns 400 for invalid status', async () => {
    const res = await supertest(createAdminApp())
      .put('/api/admin/conversations/conv-1/status')
      .send({ status: 'deleted' });
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid status', async () => {
    const res = await supertest(createAdminApp())
      .put('/api/admin/conversations/conv-1/status')
      .send({ status: 'closed' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
