import type { Express, Request, Response } from 'express';
import { storage } from './storage';
import { broadcastToParticipants } from './websocket';

function requireAuth(req: Request, res: Response, next: Function) {
  if (!(req.session as any)?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: Function) {
  if (!(req.session as any)?.userId || !(req.session as any)?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function registerCommunicationRoutes(app: Express) {

  app.get('/api/admin/drivers', requireAdmin, async (req: Request, res: Response) => {
    try {
      const drivers = await storage.getDrivers();
      res.json(drivers);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch drivers' });
    }
  });

  app.post('/api/admin/drivers', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { name, email, phone, optimorouteDriverId } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const driver = await storage.createDriver({ name, email, phone, optimorouteDriverId });
      res.json(driver);
    } catch (e) {
      res.status(500).json({ error: 'Failed to create driver' });
    }
  });

  app.get('/api/admin/conversations', requireAdmin, async (req: Request, res: Response) => {
    try {
      const options = {
        limit: parseInt(req.query.limit as string) || 50,
        offset: parseInt(req.query.offset as string) || 0,
        status: (req.query.status as string) || 'all',
      };
      const result = await storage.getAllConversations(options);
      const convos = await Promise.all(result.conversations.map(async (c: any) => {
        const participants = await storage.getConversationParticipants(c.id);
        return { ...c, participants };
      }));
      res.json({ conversations: convos, total: result.total });
    } catch (e) {
      console.error('Error loading conversations:', e);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  app.post('/api/admin/conversations', requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { subject, type, participantIds } = req.body;
      if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
        return res.status(400).json({ error: 'At least one participant is required' });
      }

      const participants = [
        { id: userId, type: 'admin', role: 'admin' },
        ...participantIds.map((p: { id: string; type: string }) => ({
          id: p.id,
          type: p.type,
          role: p.type === 'driver' ? 'driver' : 'customer',
        })),
      ];

      const conversation = await storage.createConversation({
        subject: subject || undefined,
        type: type || (participants.length > 2 ? 'group' : 'direct'),
        createdById: userId,
        createdByType: 'admin',
        participants,
      });

      const full = await storage.getConversationParticipants(conversation.id);
      res.json({ ...conversation, participants: full });
    } catch (e) {
      console.error('Error creating conversation:', e);
      res.status(500).json({ error: 'Failed to create conversation' });
    }
  });

  app.get('/api/admin/conversations/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const conv = await storage.getConversationById(req.params.id);
      if (!conv) return res.status(404).json({ error: 'Conversation not found' });
      const participants = await storage.getConversationParticipants(conv.id);
      res.json({ ...conv, participants });
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch conversation' });
    }
  });

  app.get('/api/admin/conversations/:id/messages', requireAdmin, async (req: Request, res: Response) => {
    try {
      const messages = await storage.getMessages(req.params.id, {
        limit: parseInt(req.query.limit as string) || 50,
        before: req.query.before as string,
      });
      res.json(messages);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.post('/api/admin/conversations/:id/messages', requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { body } = req.body;
      if (!body?.trim()) return res.status(400).json({ error: 'Message body is required' });

      const conv = await storage.getConversationById(req.params.id);
      if (!conv) return res.status(404).json({ error: 'Conversation not found' });

      const message = await storage.createMessage({
        conversationId: req.params.id,
        senderId: userId,
        senderType: 'admin',
        body: body.trim(),
      });

      const user = await storage.getUserById(userId);
      const messageWithSender = {
        ...message,
        sender_name: user ? `${user.first_name} ${user.last_name}` : 'Admin',
      };

      await storage.markConversationRead(req.params.id, userId, 'admin');

      const participants = await storage.getConversationParticipants(req.params.id);
      const participantKeys = participants.map((p: any) => `${p.participant_type}:${p.participant_id}`);
      broadcastToParticipants(participantKeys, 'message:new', {
        conversationId: req.params.id,
        message: messageWithSender,
      });

      res.json(messageWithSender);
    } catch (e) {
      console.error('Error sending message:', e);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  app.put('/api/admin/conversations/:id/read', requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      await storage.markConversationRead(req.params.id, userId, 'admin');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to mark as read' });
    }
  });

  app.put('/api/admin/conversations/:id/status', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      if (!['open', 'closed', 'archived'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      await storage.updateConversationStatus(req.params.id, status);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to update status' });
    }
  });

  app.get('/api/conversations', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const conversations = await storage.getConversationsForCustomer(userId);
      res.json(conversations);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  app.get('/api/conversations/unread-count', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const count = await storage.getUnreadCount(userId, 'user');
      res.json({ count });
    } catch (e) {
      res.status(500).json({ error: 'Failed to get unread count' });
    }
  });

  app.get('/api/conversations/:id/messages', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const isParticipant = await storage.isParticipant(req.params.id, userId, 'user');
      if (!isParticipant) return res.status(403).json({ error: 'Not a participant' });

      const messages = await storage.getMessages(req.params.id, {
        limit: parseInt(req.query.limit as string) || 50,
        before: req.query.before as string,
      });
      res.json(messages);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.post('/api/conversations/:id/messages', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const isParticipant = await storage.isParticipant(req.params.id, userId, 'user');
      if (!isParticipant) return res.status(403).json({ error: 'Not a participant' });

      const { body } = req.body;
      if (!body?.trim()) return res.status(400).json({ error: 'Message body is required' });

      const message = await storage.createMessage({
        conversationId: req.params.id,
        senderId: userId,
        senderType: 'user',
        body: body.trim(),
      });

      const user = await storage.getUserById(userId);
      const messageWithSender = {
        ...message,
        sender_name: user ? `${user.first_name} ${user.last_name}` : 'Customer',
      };

      await storage.markConversationRead(req.params.id, userId, 'user');

      const participants = await storage.getConversationParticipants(req.params.id);
      const participantKeys = participants.map((p: any) => `${p.participant_type}:${p.participant_id}`);
      broadcastToParticipants(participantKeys, 'message:new', {
        conversationId: req.params.id,
        message: messageWithSender,
      });

      res.json(messageWithSender);
    } catch (e) {
      console.error('Error sending message:', e);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  app.put('/api/conversations/:id/read', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      await storage.markConversationRead(req.params.id, userId, 'user');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to mark as read' });
    }
  });

  app.post('/api/conversations/new', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { subject, body } = req.body;
      if (!body?.trim()) return res.status(400).json({ error: 'Message is required' });

      const admins = await storage.query(`SELECT id FROM users WHERE is_admin = true LIMIT 1`);
      if (admins.rows.length === 0) return res.status(500).json({ error: 'No admin available' });

      const participants = [
        { id: userId, type: 'user', role: 'customer' },
        { id: admins.rows[0].id, type: 'admin', role: 'admin' },
      ];

      const conversation = await storage.createConversation({
        subject: subject || 'Support Request',
        type: 'direct',
        createdById: userId,
        createdByType: 'user',
        participants,
      });

      const message = await storage.createMessage({
        conversationId: conversation.id,
        senderId: userId,
        senderType: 'user',
        body: body.trim(),
      });

      await storage.markConversationRead(conversation.id, userId, 'user');

      const user = await storage.getUserById(userId);
      broadcastToParticipants(
        [`admin:${admins.rows[0].id}`],
        'conversation:new',
        { conversationId: conversation.id, customerName: user ? `${user.first_name} ${user.last_name}` : 'Customer' }
      );

      res.json({ conversation, message });
    } catch (e) {
      console.error('Error creating conversation:', e);
      res.status(500).json({ error: 'Failed to create conversation' });
    }
  });
}
