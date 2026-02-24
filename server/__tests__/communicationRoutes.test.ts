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
import { sendMessageNotificationEmail, logCommunication, sendAndLogNotification } from '../notificationService';
import { pool } from '../db';

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
    getConversations: vi.fn(),
    getMessages: vi.fn(),
    createMessage: vi.fn(),
    createConversation: vi.fn(),
    markConversationRead: vi.fn(),
    isParticipant: vi.fn(),
    getUnreadCount: vi.fn(),
    updateConversationStatus: vi.fn(),
    query: vi.fn(),
    createDriverProfile: vi.fn(),
    getPropertiesForUser: vi.fn(),
  },
  pool: {},
}));

vi.mock('../db', () => {
  const mockPool = { query: vi.fn() };
  return {
    pool: mockPool,
    BaseRepository: class {
      async query(text: string, params?: any[]) {
        return mockPool.query(text, params);
      }
    },
  };
});

vi.mock('../websocket', () => ({
  broadcastToParticipants: vi.fn(),
}));

vi.mock('../notificationService', () => ({
  sendMessageNotificationEmail: vi.fn().mockResolvedValue(undefined),
  logCommunication: vi.fn().mockResolvedValue('log-1'),
  renderTemplate: vi.fn((body: string) => body),
  sendAndLogNotification: vi.fn().mockResolvedValue({ email: true }),
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
  // requireDriverAuth checks req.session.userId then queries user_roles for driver role
  app.use((req: any, _res: any, next: any) => { req.session.userId = driverId; next(); });
  registerCommunicationRoutes(app);
  return app;
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------
// Template fixtures
const mockTemplate = {
  id: 'tmpl-1',
  name: 'Late Payment Notice',
  channel: 'email',
  subject: 'Payment Overdue',
  body: 'Hi {{customer_name}}, your payment is overdue.',
  variables: ['customer_name'],
  created_by: 'admin-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockLogEntry = {
  id: 'log-1',
  recipient_id: 'user-1',
  recipient_type: 'user',
  recipient_name: 'John Doe',
  recipient_contact: 'john@test.com',
  channel: 'email',
  direction: 'outbound',
  subject: 'Test',
  body: 'Hello',
  status: 'sent',
  sent_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  sent_by_first: 'Admin',
  sent_by_last: 'User',
};

beforeEach(() => {
  vi.clearAllMocks();

  // Context-aware: return the right user based on ID
  vi.mocked(storage.getUserById).mockImplementation(async (id: string) => {
    if (id === 'admin-1') return mockAdminUser as any;
    if (id === 'driver-1') return { id: 'driver-1', first_name: 'Test', last_name: 'Driver', email: 'driver@test.com' } as any;
    if (id === 'user-1') return mockRegularUser as any;
    return null;
  });
  vi.mocked(storage.getDriverById).mockResolvedValue(mockDriver as any);
  vi.mocked(storage.getDrivers).mockResolvedValue([mockDriver] as any);
  vi.mocked(storage.createDriver).mockResolvedValue(mockDriver as any);
  vi.mocked(storage.getAllConversations).mockResolvedValue({ conversations: [], total: 0 } as any);
  vi.mocked(storage.getConversationById).mockResolvedValue(mockConversation as any);
  vi.mocked(storage.getConversationParticipants).mockResolvedValue(mockParticipants as any);
  vi.mocked(storage.getConversationsForCustomer).mockResolvedValue([] as any);
  vi.mocked(storage.getConversationsForDriver).mockResolvedValue([mockConversation] as any);
  vi.mocked(storage.getConversations).mockResolvedValue([mockConversation] as any);
  vi.mocked(storage.getMessages).mockResolvedValue([mockMessage] as any);
  vi.mocked(storage.createMessage).mockResolvedValue(mockMessage as any);
  vi.mocked(storage.createConversation).mockResolvedValue(mockConversation as any);
  vi.mocked(storage.markConversationRead).mockResolvedValue(undefined as any);
  vi.mocked(storage.isParticipant).mockResolvedValue(true as any);
  vi.mocked(storage.getUnreadCount).mockResolvedValue(3 as any);
  vi.mocked(storage.updateConversationStatus).mockResolvedValue(undefined as any);
  vi.mocked(storage.createDriverProfile).mockResolvedValue(mockDriver as any);
  // query used for finding admin in /new routes
  vi.mocked(storage.query).mockResolvedValue({ rows: [{ id: 'admin-1' }] } as any);

  // pool.query from ../db — used by requireAdmin (RoleRepository), templates, activity log, driver creation
  vi.mocked(pool.query).mockImplementation(async (sql: string, params?: any[]) => {
    // requireAdmin calls getAdminRole which queries user_roles for admin role
    if (typeof sql === 'string' && sql.includes('admin_role') && sql.includes('user_roles')) {
      // Only return admin role for admin-1, not for regular users
      const userId = params?.[0];
      if (userId === 'admin-1') {
        return { rows: [{ admin_role: 'full_admin' }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    }
    // requireDriverAuth checks user_roles for driver role
    if (typeof sql === 'string' && sql.includes('user_roles') && sql.includes("role = $2")) {
      return { rows: [{ role: 'driver' }], rowCount: 1 } as any;
    }
    // Driver creation: INSERT INTO users
    if (typeof sql === 'string' && sql.includes('INSERT INTO users')) {
      return { rows: [{ id: 'new-user-id' }], rowCount: 1 } as any;
    }
    // Driver creation: SELECT existing user by email
    if (typeof sql === 'string' && sql.includes('SELECT id FROM users WHERE LOWER(email)')) {
      return { rows: [], rowCount: 0 } as any;
    }
    // Driver creation: INSERT INTO user_roles
    if (typeof sql === 'string' && sql.includes('INSERT INTO user_roles')) {
      return { rows: [], rowCount: 0 } as any;
    }
    // Default: empty result
    return { rows: [], rowCount: 0 } as any;
  });
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

  it('falls back to "Driver" for sender_name when user not found', async () => {
    vi.mocked(storage.getUserById).mockResolvedValueOnce(null as any);
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

// ===========================================================================
// TEMPLATES CRUD
// ===========================================================================

describe('GET /api/admin/templates', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).get('/api/admin/templates');
    expect(res.status).toBe(401);
  });

  it('returns 200 with templates list', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('communication_templates')) {
        return { rows: [mockTemplate], rowCount: 1 } as any;
      }
      if (typeof sql === 'string' && sql.includes('admin_role')) {
        return { rows: [{ admin_role: 'full_admin' }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const res = await supertest(createAdminApp()).get('/api/admin/templates');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({ id: 'tmpl-1', name: 'Late Payment Notice' });
  });
});

describe('POST /api/admin/templates', () => {
  it('returns 400 if name is missing', async () => {
    const res = await supertest(createAdminApp())
      .post('/api/admin/templates')
      .send({ body: 'Hello' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name.*body|required/i);
  });

  it('returns 400 if body is missing', async () => {
    const res = await supertest(createAdminApp())
      .post('/api/admin/templates')
      .send({ name: 'Test' });
    expect(res.status).toBe(400);
  });

  it('creates a template and returns it', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('INSERT INTO communication_templates')) {
        return { rows: [mockTemplate], rowCount: 1 } as any;
      }
      if (typeof sql === 'string' && sql.includes('admin_role')) {
        return { rows: [{ admin_role: 'full_admin' }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const res = await supertest(createAdminApp())
      .post('/api/admin/templates')
      .send({ name: 'Late Payment Notice', channel: 'email', subject: 'Payment Overdue', body: 'Hi {{customer_name}}', variables: ['customer_name'] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'tmpl-1', name: 'Late Payment Notice' });
  });

  it('persists the template via INSERT query with correct params', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ rows: [mockTemplate], rowCount: 1 });
    vi.mocked(pool.query).mockImplementation(async (sql: string, params?: any[]) => {
      if (typeof sql === 'string' && sql.includes('INSERT INTO communication_templates')) {
        return insertSpy(sql, params);
      }
      if (typeof sql === 'string' && sql.includes('admin_role')) {
        return { rows: [{ admin_role: 'full_admin' }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    await supertest(createAdminApp())
      .post('/api/admin/templates')
      .send({ name: 'Pickup Reminder', channel: 'sms', body: 'Your pickup is on {{pickup_date}}', variables: ['pickup_date'] });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const [, params] = insertSpy.mock.calls[0];
    expect(params[0]).toBe('Pickup Reminder');    // name
    expect(params[1]).toBe('sms');                 // channel
    expect(params[3]).toBe('Your pickup is on {{pickup_date}}'); // body
    expect(params[4]).toEqual(['pickup_date']);     // variables
    expect(params[5]).toBe('admin-1');              // created_by (session userId)
  });
});

describe('PUT /api/admin/templates/:id', () => {
  it('returns 404 if template does not exist', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('UPDATE communication_templates')) {
        return { rows: [], rowCount: 0 } as any;
      }
      if (typeof sql === 'string' && sql.includes('admin_role')) {
        return { rows: [{ admin_role: 'full_admin' }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const res = await supertest(createAdminApp())
      .put('/api/admin/templates/nonexistent')
      .send({ name: 'Updated', body: 'New body' });
    expect(res.status).toBe(404);
  });

  it('updates a template and returns it', async () => {
    const updatedTemplate = { ...mockTemplate, name: 'Updated Notice', body: 'New body text' };
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('UPDATE communication_templates')) {
        return { rows: [updatedTemplate], rowCount: 1 } as any;
      }
      if (typeof sql === 'string' && sql.includes('admin_role')) {
        return { rows: [{ admin_role: 'full_admin' }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const res = await supertest(createAdminApp())
      .put('/api/admin/templates/tmpl-1')
      .send({ name: 'Updated Notice', body: 'New body text' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Notice');
  });
});

describe('DELETE /api/admin/templates/:id', () => {
  it('returns 404 if template does not exist', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('DELETE FROM communication_templates')) {
        return { rows: [], rowCount: 0 } as any;
      }
      if (typeof sql === 'string' && sql.includes('admin_role')) {
        return { rows: [{ admin_role: 'full_admin' }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const res = await supertest(createAdminApp()).delete('/api/admin/templates/nonexistent');
    expect(res.status).toBe(404);
  });

  it('deletes a template and returns success', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('DELETE FROM communication_templates')) {
        return { rows: [{ id: 'tmpl-1' }], rowCount: 1 } as any;
      }
      if (typeof sql === 'string' && sql.includes('admin_role')) {
        return { rows: [{ admin_role: 'full_admin' }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const res = await supertest(createAdminApp()).delete('/api/admin/templates/tmpl-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ===========================================================================
// TEMPLATE PERSISTENCE — round-trip test
// ===========================================================================

describe('Template persistence (create → read → update → verify → delete)', () => {
  it('persists templates through full CRUD lifecycle', async () => {
    const created = { ...mockTemplate };
    const updated = { ...mockTemplate, name: 'Updated Name', body: 'Updated body {{amount}}', variables: ['amount'] };
    const queries: string[] = [];

    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      queries.push(typeof sql === 'string' ? sql.slice(0, 40) : 'unknown');

      if (typeof sql === 'string' && sql.includes('admin_role')) {
        return { rows: [{ admin_role: 'full_admin' }], rowCount: 1 } as any;
      }
      if (typeof sql === 'string' && sql.includes('INSERT INTO communication_templates')) {
        return { rows: [created], rowCount: 1 } as any;
      }
      if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('communication_templates')) {
        return { rows: [created], rowCount: 1 } as any;
      }
      if (typeof sql === 'string' && sql.includes('UPDATE communication_templates')) {
        return { rows: [updated], rowCount: 1 } as any;
      }
      if (typeof sql === 'string' && sql.includes('DELETE FROM communication_templates')) {
        return { rows: [{ id: 'tmpl-1' }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const app = createAdminApp();

    // 1. Create
    const createRes = await supertest(app)
      .post('/api/admin/templates')
      .send({ name: 'Late Payment Notice', channel: 'email', subject: 'Payment Overdue', body: 'Hi {{customer_name}}', variables: ['customer_name'] });
    expect(createRes.status).toBe(200);
    expect(createRes.body.id).toBe('tmpl-1');

    // 2. Read
    const listRes = await supertest(app).get('/api/admin/templates');
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].name).toBe('Late Payment Notice');

    // 3. Update
    const updateRes = await supertest(app)
      .put('/api/admin/templates/tmpl-1')
      .send({ name: 'Updated Name', body: 'Updated body {{amount}}', variables: ['amount'] });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe('Updated Name');

    // 4. Delete
    const deleteRes = await supertest(app).delete('/api/admin/templates/tmpl-1');
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // Verify all DB operations were executed
    const insertCalled = queries.some(q => q.includes('INSERT INTO communication_temp'));
    const selectCalled = queries.some(q => q.includes('SELECT') && q.includes('communication'));
    const updateCalled = queries.some(q => q.includes('UPDATE communication_temp'));
    const deleteCalled = queries.some(q => q.includes('DELETE FROM communication_temp'));
    expect(insertCalled).toBe(true);
    expect(selectCalled).toBe(true);
    expect(updateCalled).toBe(true);
    expect(deleteCalled).toBe(true);
  });
});

// ===========================================================================
// COMPOSE (unified send)
// ===========================================================================

describe('POST /api/admin/compose', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp())
      .post('/api/admin/compose')
      .send({ recipientIds: [{ id: 'user-1', type: 'user' }], channel: 'email', body: 'Hello' });
    expect(res.status).toBe(401);
  });

  it('returns 400 if no recipients', async () => {
    const res = await supertest(createAdminApp())
      .post('/api/admin/compose')
      .send({ recipientIds: [], channel: 'email', body: 'Hello' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/recipient/i);
  });

  it('returns 400 if body is empty', async () => {
    const res = await supertest(createAdminApp())
      .post('/api/admin/compose')
      .send({ recipientIds: [{ id: 'user-1' }], channel: 'email', body: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid channel', async () => {
    const res = await supertest(createAdminApp())
      .post('/api/admin/compose')
      .send({ recipientIds: [{ id: 'user-1' }], channel: 'pigeon', body: 'Hello' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/channel/i);
  });

  it('sends immediately and returns sent count', async () => {
    vi.mocked(sendAndLogNotification).mockResolvedValue({ email: true });

    const res = await supertest(createAdminApp())
      .post('/api/admin/compose')
      .send({ recipientIds: [{ id: 'user-1', type: 'user' }], channel: 'email', subject: 'Hello', body: 'Hi there' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sent).toBe(1);
    expect(sendAndLogNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', channel: 'email', body: 'Hi there' })
    );
  });

  it('creates scheduled entries when scheduledFor is provided', async () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString();
    // getUserById is called for: 1) requireAdmin check, 2) recipient lookup
    // First call returns admin (for auth), second returns user with email (for recipient)
    vi.mocked(storage.getUserById)
      .mockResolvedValueOnce(mockAdminUser as any)
      .mockResolvedValueOnce({ ...mockRegularUser, email: 'john@test.com', phone: '5551234567' } as any);

    const res = await supertest(createAdminApp())
      .post('/api/admin/compose')
      .send({
        recipientIds: [{ id: 'user-1', type: 'user' }],
        channel: 'email',
        body: 'Scheduled message',
        scheduledFor: futureDate,
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.scheduled).toBeGreaterThan(0);
    expect(logCommunication).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'scheduled', scheduledFor: expect.any(String) })
    );
  });

  it('returns 400 if scheduled time is in the past', async () => {
    const pastDate = new Date(Date.now() - 3600000).toISOString();
    const res = await supertest(createAdminApp())
      .post('/api/admin/compose')
      .send({
        recipientIds: [{ id: 'user-1', type: 'user' }],
        channel: 'email',
        body: 'Past message',
        scheduledFor: pastDate,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/future/i);
  });
});

// ===========================================================================
// ACTIVITY LOG
// ===========================================================================

describe('GET /api/admin/activity-log', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).get('/api/admin/activity-log');
    expect(res.status).toBe(401);
  });

  it('returns paginated activity log entries', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('admin_role')) {
        return { rows: [{ admin_role: 'full_admin' }], rowCount: 1 } as any;
      }
      if (typeof sql === 'string' && sql.includes('COUNT(*)')) {
        return { rows: [{ count: '1' }], rowCount: 1 } as any;
      }
      if (typeof sql === 'string' && sql.includes('communication_log')) {
        return { rows: [mockLogEntry], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const res = await supertest(createAdminApp()).get('/api/admin/activity-log');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('entries');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].recipient_name).toBe('John Doe');
  });

  it('supports channel filter', async () => {
    const querySpy = vi.fn().mockResolvedValue({ rows: [{ count: '0' }], rowCount: 1 });
    vi.mocked(pool.query).mockImplementation(async (sql: string, params?: any[]) => {
      if (typeof sql === 'string' && sql.includes('admin_role')) {
        return { rows: [{ admin_role: 'full_admin' }], rowCount: 1 } as any;
      }
      if (typeof sql === 'string' && sql.includes('COUNT(*)')) {
        return querySpy(sql, params);
      }
      return { rows: [], rowCount: 0 } as any;
    });

    await supertest(createAdminApp()).get('/api/admin/activity-log?channel=sms');
    // The COUNT query should include a channel filter
    expect(querySpy).toHaveBeenCalled();
    const [sql, params] = querySpy.mock.calls[0];
    expect(sql).toContain('channel = $');
    expect(params).toContain('sms');
  });
});

describe('GET /api/admin/activity-log/:id', () => {
  it('returns 404 for non-existent entry', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('admin_role')) {
        return { rows: [{ admin_role: 'full_admin' }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const res = await supertest(createAdminApp()).get('/api/admin/activity-log/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns 200 with entry detail', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('admin_role')) {
        return { rows: [{ admin_role: 'full_admin' }], rowCount: 1 } as any;
      }
      if (typeof sql === 'string' && sql.includes('communication_log')) {
        return { rows: [mockLogEntry], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const res = await supertest(createAdminApp()).get('/api/admin/activity-log/log-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('log-1');
    expect(res.body.channel).toBe('email');
  });
});

// ===========================================================================
// SCHEDULED MESSAGES
// ===========================================================================

describe('GET /api/admin/scheduled', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(createApp()).get('/api/admin/scheduled');
    expect(res.status).toBe(401);
  });

  it('returns list of scheduled messages', async () => {
    const scheduledEntry = { ...mockLogEntry, status: 'scheduled', scheduled_for: new Date(Date.now() + 3600000).toISOString() };
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('admin_role')) {
        return { rows: [{ admin_role: 'full_admin' }], rowCount: 1 } as any;
      }
      if (typeof sql === 'string' && sql.includes('scheduled')) {
        return { rows: [scheduledEntry], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const res = await supertest(createAdminApp()).get('/api/admin/scheduled');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].status).toBe('scheduled');
  });
});

describe('DELETE /api/admin/scheduled/:id', () => {
  it('returns 404 if scheduled message does not exist', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('admin_role')) {
        return { rows: [{ admin_role: 'full_admin' }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const res = await supertest(createAdminApp()).delete('/api/admin/scheduled/nonexistent');
    expect(res.status).toBe(404);
  });

  it('cancels a scheduled message', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('admin_role')) {
        return { rows: [{ admin_role: 'full_admin' }], rowCount: 1 } as any;
      }
      if (typeof sql === 'string' && sql.includes('UPDATE communication_log') && sql.includes('cancelled')) {
        return { rows: [{ id: 'log-1' }], rowCount: 1 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    const res = await supertest(createAdminApp()).delete('/api/admin/scheduled/log-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
