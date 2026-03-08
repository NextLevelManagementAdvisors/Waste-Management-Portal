import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTeamRoutes } from '../teamRoutes';
import { pool } from '../db';
import { storage } from '../storage';

vi.mock('../db', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('../storage', () => ({
    storage: {
        getDriverProfileByUserId: vi.fn(),
    }
}));

vi.mock('../websocket', () => ({
  webSocketManager: {
    broadcastToConversation: vi.fn(),
    broadcastToAdmins: vi.fn(),
  }
}));

const app = express();
app.use(express.json());
app.use(session({
  secret: 'test-secret',
  resave: false,
  saveUninitialized: true,
}));

// Mock middleware
app.use((req: any, res, next) => {
    req.session.userId = 'user-123';
    next();
});

registerTeamRoutes(app);

describe('Team Messaging Routes', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    (storage.getDriverProfileByUserId as vi.Mock).mockResolvedValue({
        id: 'driver-123',
        user_id: 'user-123',
        name: 'Test Driver',
        onboarding_status: 'completed',
        status: 'active',
    });
    (pool.query as vi.Mock).mockImplementation((query, values) => {
        if (typeof query === 'string' && query.includes('user_roles')) {
            if (query.includes("ur.role = 'admin'")) {
                return Promise.resolve({ rows: [{ id: 'admin-user-id' }], rowCount: 1 });
            }
            return Promise.resolve({ rows: [{ role: 'driver' }], rowCount: 1 });
        }
        if (typeof query === 'string' && query.includes('SELECT 1 FROM conversation_participants')) {
            return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 });
        }
        if (typeof query === 'string' && query.includes('UPDATE conversation_participants')) {
            return Promise.resolve({ rows: [], rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  describe('GET /api/team/conversations', () => {
    it('should return a list of conversations for an authenticated and onboarded driver', async () => {
      const conversations = [{ id: 'conv-1', subject: 'Test' }];
      (pool.query as vi.Mock).mockResolvedValue({ rows: conversations });
      
      const res = await request(app).get('/api/team/conversations');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(conversations);
    });
  });

  describe('GET /api/team/conversations/unread-count', () => {
    it('should return the unread count', async () => {
        (pool.query as vi.Mock).mockResolvedValue({ rows: [{ count: '2' }] });
        const res = await request(app).get('/api/team/conversations/unread-count');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ count: 2 });
    });
  });

  describe('GET /api/team/conversations/:id/messages', () => {
    it('should return messages for a conversation', async () => {
        const messages = [{ id: 'msg-1', body: 'Test message' }];
        (pool.query as vi.Mock).mockResolvedValue({ rows: messages });
        
        const res = await request(app).get('/api/team/conversations/conv-1/messages');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(messages);
    });
  });

  describe('POST /api/team/conversations/:id/messages', () => {
    it('should create a new message', async () => {
      const newMessage = { id: 'msg-2', body: 'New message' };
      (pool.query as vi.Mock).mockResolvedValue({ rows: [newMessage] });
      
      const res = await request(app)
        .post('/api/team/conversations/conv-1/messages')
        .send({ body: 'New message' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(newMessage);
    });
  });

  describe('PUT /api/team/conversations/:id/read', () => {
    it('should mark a conversation as read', async () => {
      const res = await request(app).put('/api/team/conversations/conv-1/read');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });
  });

  describe('POST /api/team/conversations/new', () => {
    it('should create a new conversation', async () => {
        const conversation = { id: 'new-conv-1' };
        const client = {
            query: vi.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [conversation] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] }),
            release: vi.fn(),
        };
        (pool.connect as vi.Mock).mockResolvedValue(client);

        const res = await request(app)
            .post('/api/team/conversations/new')
            .send({ subject: 'New Support Request', body: 'I need help with...' });

        expect(res.status).toBe(201);
        expect(res.body.conversation).toEqual(conversation);
        expect(client.query).toHaveBeenCalledWith('BEGIN');
        expect(client.query).toHaveBeenCalledWith('COMMIT');
    });
  });
});
