import type { Express, Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import { broadcastToParticipants } from './websocket';
import { sendMessageNotificationEmail } from './notificationService';

function requireAuth(req: Request, res: Response, next: Function) {
  if (!(req.session as any)?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!(req.session as any)?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const user = await storage.getUserById((req.session as any).userId);
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
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

      // Email opt-in notifications for non-admin participants
      const adminUser = await storage.getUserById(userId);
      const senderName = adminUser ? `${adminUser.first_name} ${adminUser.last_name}` : 'Admin';
      for (const p of participants) {
        if (p.participant_type === 'user') {
          sendMessageNotificationEmail(p.participant_id, 'user', senderName, body.trim(), conv.subject).catch(() => {});
        } else if (p.participant_type === 'driver') {
          sendMessageNotificationEmail(p.participant_id, 'driver', senderName, body.trim(), conv.subject).catch(() => {});
        }
      }

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

      // Email opt-in notifications for other participants (drivers only; admins don't opt-in here)
      const conv2 = await storage.getConversationById(req.params.id);
      const senderDisplayName = user ? `${user.first_name} ${user.last_name}` : 'Customer';
      for (const p of participants) {
        if (p.participant_type === 'driver') {
          sendMessageNotificationEmail(p.participant_id, 'driver', senderDisplayName, body.trim(), conv2?.subject).catch(() => {});
        }
      }

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

  // --- Driver (Team Portal) Conversation Routes ---

  function requireDriverAuth(req: Request, res: Response, next: NextFunction) {
    if (!(req.session as any)?.driverId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    next();
  }

  app.get('/api/team/conversations', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = (req.session as any).driverId;
      const conversations = await storage.getConversationsForDriver(driverId);
      res.json(conversations);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  app.get('/api/team/conversations/unread-count', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = (req.session as any).driverId;
      const count = await storage.getUnreadCount(driverId, 'driver');
      res.json({ count });
    } catch (e) {
      res.status(500).json({ error: 'Failed to get unread count' });
    }
  });

  app.get('/api/team/conversations/:id/messages', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = (req.session as any).driverId;
      const isParticipant = await storage.isParticipant(req.params.id, driverId, 'driver');
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

  app.post('/api/team/conversations/new', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = (req.session as any).driverId;
      const { subject, body } = req.body;
      if (!body?.trim()) return res.status(400).json({ error: 'Message is required' });

      const admins = await storage.query(`SELECT id FROM users WHERE is_admin = true LIMIT 1`);
      if (admins.rows.length === 0) return res.status(500).json({ error: 'No admin available' });

      const participants = [
        { id: driverId, type: 'driver', role: 'driver' },
        { id: admins.rows[0].id, type: 'admin', role: 'admin' },
      ];

      const conversation = await storage.createConversation({
        subject: subject?.trim() || 'Driver Support Request',
        type: 'direct',
        createdById: driverId,
        createdByType: 'driver',
        participants,
      });

      const message = await storage.createMessage({
        conversationId: conversation.id,
        senderId: driverId,
        senderType: 'driver',
        body: body.trim(),
      });

      await storage.markConversationRead(conversation.id, driverId, 'driver');

      const driver = await storage.getDriverById(driverId);
      broadcastToParticipants(
        [`admin:${admins.rows[0].id}`],
        'conversation:new',
        { conversationId: conversation.id, driverName: driver ? driver.name : 'Driver' }
      );

      res.json({ conversation, message });
    } catch (e) {
      console.error('Error creating driver conversation:', e);
      res.status(500).json({ error: 'Failed to create conversation' });
    }
  });

  app.post('/api/team/conversations/:id/messages', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = (req.session as any).driverId;
      const isParticipant = await storage.isParticipant(req.params.id, driverId, 'driver');
      if (!isParticipant) return res.status(403).json({ error: 'Not a participant' });

      const { body } = req.body;
      if (!body?.trim()) return res.status(400).json({ error: 'Message body is required' });

      const message = await storage.createMessage({
        conversationId: req.params.id,
        senderId: driverId,
        senderType: 'driver',
        body: body.trim(),
      });

      const driver = await storage.getDriverById(driverId);
      const messageWithSender = {
        ...message,
        sender_name: driver ? driver.name : 'Driver',
      };

      await storage.markConversationRead(req.params.id, driverId, 'driver');

      const participants = await storage.getConversationParticipants(req.params.id);
      const participantKeys = participants.map((p: any) => `${p.participant_type}:${p.participant_id}`);
      broadcastToParticipants(participantKeys, 'message:new', {
        conversationId: req.params.id,
        message: messageWithSender,
      });

      // Email opt-in notifications for user participants
      const driverConv = await storage.getConversationById(req.params.id);
      const driverSenderName = driver ? driver.name : 'Driver';
      for (const p of participants) {
        if (p.participant_type === 'user') {
          sendMessageNotificationEmail(p.participant_id, 'user', driverSenderName, body.trim(), driverConv?.subject).catch(() => {});
        }
      }

      res.json(messageWithSender);
    } catch (e) {
      console.error('Error sending driver message:', e);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  app.put('/api/team/conversations/:id/read', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = (req.session as any).driverId;
      await storage.markConversationRead(req.params.id, driverId, 'driver');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to mark as read' });
    }
  });

}
