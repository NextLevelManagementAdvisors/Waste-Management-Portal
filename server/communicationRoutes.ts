import type { Express, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { storage } from './storage';
import { pool } from './db';
import { requireAuth } from './middleware';
import { broadcastToParticipants } from './websocket';
import { sendMessageNotificationEmail, logCommunication, renderTemplate, sendAndLogNotification } from './notificationService';
import { requireAdmin } from './adminRoutes';

async function requireDriverAuth(req: Request, res: Response, next: NextFunction) {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const roleCheck = await pool.query(
      'SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2',
      [userId, 'driver']
    );
    if (roleCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Driver access required' });
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
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format' });
      if (phone && !/^[\d\s()+\-]{7,20}$/.test(phone)) return res.status(400).json({ error: 'Invalid phone number format' });

      // Check if user with email already exists
      let userId: string;
      if (email) {
        const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
        if (existing.rows.length > 0) {
          userId = existing.rows[0].id;
        } else {
          const nameParts = name.trim().split(/\s+/);
          const result = await pool.query(
            `INSERT INTO users (first_name, last_name, email, phone, password_hash)
             VALUES ($1, $2, $3, $4, NULL) RETURNING id`,
            [nameParts[0], nameParts.slice(1).join(' ') || '', email.toLowerCase(), phone || '']
          );
          userId = result.rows[0].id;
        }
      } else {
        const nameParts = name.trim().split(/\s+/);
        // Generate a unique placeholder email since users.email has a UNIQUE constraint
        const placeholderEmail = `driver-${crypto.randomUUID()}@placeholder.local`;
        const result = await pool.query(
          `INSERT INTO users (first_name, last_name, email, phone, password_hash)
           VALUES ($1, $2, $3, $4, NULL) RETURNING id`,
          [nameParts[0], nameParts.slice(1).join(' ') || '', placeholderEmail, phone || '']
        );
        userId = result.rows[0].id;
      }

      // Create driver profile
      const driverProfile = await storage.createDriverProfile({ userId, name, optimorouteDriverId });

      // Add driver role
      await pool.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'driver') ON CONFLICT DO NOTHING`,
        [userId]
      );

      res.json({ ...driverProfile, user_id: userId });
    } catch (e) {
      console.error('Failed to create driver:', e);
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
          sendMessageNotificationEmail(p.participant_id, 'user', senderName, body.trim(), conv.subject).catch(e => console.error('Message notification email failed:', e));
        } else if (p.participant_type === 'driver') {
          sendMessageNotificationEmail(p.participant_id, 'driver', senderName, body.trim(), conv.subject).catch(e => console.error('Message notification email failed:', e));
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

      const admins = await storage.query(
        `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id WHERE ur.role = 'admin' LIMIT 1`
      );
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
          sendMessageNotificationEmail(p.participant_id, 'driver', senderDisplayName, body.trim(), conv2?.subject).catch(e => console.error('Message notification email failed:', e));
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

  // Edit a message (sender only)
  app.put('/api/conversations/:convId/messages/:msgId', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { body } = req.body;
      if (!body?.trim()) return res.status(400).json({ error: 'Message body is required' });
      const result = await storage.query(
        `UPDATE messages SET body = $1, updated_at = NOW() WHERE id = $2 AND sender_id = $3 AND sender_type = 'user' RETURNING *`,
        [body.trim(), req.params.msgId, userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Message not found or not yours' });
      res.json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: 'Failed to edit message' });
    }
  });

  // Delete a message (sender only)
  app.delete('/api/conversations/:convId/messages/:msgId', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const result = await storage.query(
        `DELETE FROM messages WHERE id = $1 AND sender_id = $2 AND sender_type = 'user' RETURNING id`,
        [req.params.msgId, userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Message not found or not yours' });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete message' });
    }
  });

  // Admin edit/delete messages
  app.put('/api/admin/conversations/:convId/messages/:msgId', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { body } = req.body;
      if (!body?.trim()) return res.status(400).json({ error: 'Message body is required' });
      const result = await storage.query(
        `UPDATE messages SET body = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [body.trim(), req.params.msgId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Message not found' });
      res.json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: 'Failed to edit message' });
    }
  });

  app.delete('/api/admin/conversations/:convId/messages/:msgId', requireAdmin, async (req: Request, res: Response) => {
    try {
      const result = await storage.query(
        `DELETE FROM messages WHERE id = $1 RETURNING id`,
        [req.params.msgId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Message not found' });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete message' });
    }
  });

  // --- Driver (Team Portal) Conversation Routes ---
  // After migration, participant_id values are users.id, participant_type stays 'driver'

  app.get('/api/team/conversations', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      // After migration, driver conversation participants use users.id with type 'driver'
      const conversations = await storage.getConversations(userId, 'driver');
      res.json(conversations);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  app.get('/api/team/conversations/unread-count', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const count = await storage.getUnreadCount(userId, 'driver');
      res.json({ count });
    } catch (e) {
      res.status(500).json({ error: 'Failed to get unread count' });
    }
  });

  app.get('/api/team/conversations/:id/messages', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const isParticipant = await storage.isParticipant(req.params.id, userId, 'driver');
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
      const userId = (req.session as any).userId;
      const { subject, body } = req.body;
      if (!body?.trim()) return res.status(400).json({ error: 'Message is required' });

      const admins = await storage.query(
        `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id WHERE ur.role = 'admin' LIMIT 1`
      );
      if (admins.rows.length === 0) return res.status(500).json({ error: 'No admin available' });

      const participants = [
        { id: userId, type: 'driver', role: 'driver' },
        { id: admins.rows[0].id, type: 'admin', role: 'admin' },
      ];

      const conversation = await storage.createConversation({
        subject: subject?.trim() || 'Driver Support Request',
        type: 'direct',
        createdById: userId,
        createdByType: 'driver',
        participants,
      });

      const message = await storage.createMessage({
        conversationId: conversation.id,
        senderId: userId,
        senderType: 'driver',
        body: body.trim(),
      });

      await storage.markConversationRead(conversation.id, userId, 'driver');

      const user = await storage.getUserById(userId);
      broadcastToParticipants(
        [`admin:${admins.rows[0].id}`],
        'conversation:new',
        { conversationId: conversation.id, driverName: user ? `${user.first_name} ${user.last_name}` : 'Driver' }
      );

      res.json({ conversation, message });
    } catch (e) {
      console.error('Error creating driver conversation:', e);
      res.status(500).json({ error: 'Failed to create conversation' });
    }
  });

  app.post('/api/team/conversations/:id/messages', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const isParticipant = await storage.isParticipant(req.params.id, userId, 'driver');
      if (!isParticipant) return res.status(403).json({ error: 'Not a participant' });

      const { body } = req.body;
      if (!body?.trim()) return res.status(400).json({ error: 'Message body is required' });

      const message = await storage.createMessage({
        conversationId: req.params.id,
        senderId: userId,
        senderType: 'driver',
        body: body.trim(),
      });

      const user = await storage.getUserById(userId);
      const messageWithSender = {
        ...message,
        sender_name: user ? `${user.first_name} ${user.last_name}` : 'Driver',
      };

      await storage.markConversationRead(req.params.id, userId, 'driver');

      const participants = await storage.getConversationParticipants(req.params.id);
      const participantKeys = participants.map((p: any) => `${p.participant_type}:${p.participant_id}`);
      broadcastToParticipants(participantKeys, 'message:new', {
        conversationId: req.params.id,
        message: messageWithSender,
      });

      // Email opt-in notifications for user participants
      const driverConv = await storage.getConversationById(req.params.id);
      const senderName = user ? `${user.first_name} ${user.last_name}` : 'Driver';
      for (const p of participants) {
        if (p.participant_type === 'user') {
          sendMessageNotificationEmail(p.participant_id, 'user', senderName, body.trim(), driverConv?.subject).catch(e => console.error('Message notification email failed:', e));
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
      const userId = (req.session as any).userId;
      await storage.markConversationRead(req.params.id, userId, 'driver');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to mark as read' });
    }
  });

  // ========== TEMPLATES API ==========

  app.get('/api/admin/templates', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await pool.query('SELECT * FROM communication_templates ORDER BY created_at DESC');
      res.json(result.rows);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch templates' });
    }
  });

  app.post('/api/admin/templates', requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { name, channel, subject, body, variables } = req.body;
      if (!name?.trim() || !body?.trim()) return res.status(400).json({ error: 'Name and body are required' });
      const result = await pool.query(
        `INSERT INTO communication_templates (name, channel, subject, body, variables, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [name.trim(), channel || 'email', subject?.trim() || null, body.trim(), variables || [], userId]
      );
      res.json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: 'Failed to create template' });
    }
  });

  app.put('/api/admin/templates/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { name, channel, subject, body, variables } = req.body;
      if (!name?.trim() || !body?.trim()) return res.status(400).json({ error: 'Name and body are required' });
      const result = await pool.query(
        `UPDATE communication_templates SET name=$1, channel=$2, subject=$3, body=$4, variables=$5, updated_at=NOW()
         WHERE id=$6 RETURNING *`,
        [name.trim(), channel || 'email', subject?.trim() || null, body.trim(), variables || [], req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Template not found' });
      res.json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: 'Failed to update template' });
    }
  });

  app.delete('/api/admin/templates/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const result = await pool.query('DELETE FROM communication_templates WHERE id=$1 RETURNING id', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Template not found' });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete template' });
    }
  });

  // ========== COMPOSE (unified send) ==========

  app.post('/api/admin/compose', requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { recipientIds, channel, subject, body, templateId, scheduledFor } = req.body;

      if (!recipientIds?.length) return res.status(400).json({ error: 'At least one recipient is required' });
      if (!body?.trim()) return res.status(400).json({ error: 'Message body is required' });
      if (!['email', 'sms', 'both'].includes(channel)) return res.status(400).json({ error: 'Invalid channel' });

      // If scheduled, create log entries with status 'scheduled'
      if (scheduledFor) {
        const scheduledDate = new Date(scheduledFor);
        if (scheduledDate <= new Date()) return res.status(400).json({ error: 'Scheduled time must be in the future' });

        let created = 0;
        for (const r of recipientIds) {
          const user = await storage.getUserById(r.id);
          if (!user) continue;
          const name = `${user.first_name} ${user.last_name}`.trim();
          const channels = channel === 'both' ? ['email', 'sms'] : [channel];
          for (const ch of channels) {
            const contact = ch === 'email' ? user.email : user.phone;
            if (!contact) continue;
            await logCommunication({
              recipientId: r.id, recipientType: r.type || 'user', recipientName: name,
              recipientContact: contact, channel: ch, subject: subject || undefined,
              body: body.trim(), templateId, status: 'scheduled',
              scheduledFor: scheduledDate.toISOString(), sentBy: userId,
            });
            created++;
          }
        }
        return res.json({ success: true, scheduled: created });
      }

      // Send immediately
      let sent = 0, failed = 0;
      for (const r of recipientIds) {
        const result = await sendAndLogNotification({
          userId: r.id, channel, subject, body: body.trim(), templateId, sentBy: userId,
        });
        if (result.email || result.sms) sent++;
        if (result.email === false && result.sms === false) failed++;
      }

      res.json({ success: true, sent, failed });
    } catch (e) {
      console.error('Compose send error:', e);
      res.status(500).json({ error: 'Failed to send messages' });
    }
  });

  // ========== ACTIVITY LOG ==========

  app.get('/api/admin/activity-log', requireAdmin, async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = (page - 1) * limit;
      const channel = req.query.channel as string;
      const status = req.query.status as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const search = req.query.search as string;

      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (channel && channel !== 'all') { conditions.push(`channel = $${idx++}`); params.push(channel); }
      if (status && status !== 'all') { conditions.push(`status = $${idx++}`); params.push(status); }
      if (startDate) { conditions.push(`created_at >= $${idx++}`); params.push(startDate); }
      if (endDate) { conditions.push(`created_at <= $${idx++}`); params.push(new Date(new Date(endDate).getTime() + 86400000).toISOString()); }
      if (search) { conditions.push(`(recipient_name ILIKE $${idx} OR recipient_contact ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const countResult = await pool.query(`SELECT COUNT(*) FROM communication_log ${where}`, params);
      const total = parseInt(countResult.rows[0].count);

      params.push(limit, offset);
      const result = await pool.query(
        `SELECT cl.*, u.first_name AS sent_by_first, u.last_name AS sent_by_last
         FROM communication_log cl LEFT JOIN users u ON cl.sent_by = u.id
         ${where} ORDER BY cl.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        params
      );

      res.json({ entries: result.rows, total, page, limit });
    } catch (e) {
      console.error('Activity log error:', e);
      res.status(500).json({ error: 'Failed to fetch activity log' });
    }
  });

  app.get('/api/admin/activity-log/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT cl.*, u.first_name AS sent_by_first, u.last_name AS sent_by_last
         FROM communication_log cl LEFT JOIN users u ON cl.sent_by = u.id WHERE cl.id = $1`,
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
      res.json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch entry' });
    }
  });

  // ========== SCHEDULED MESSAGES ==========

  app.get('/api/admin/scheduled', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT * FROM communication_log WHERE status = 'scheduled' ORDER BY scheduled_for ASC`
      );
      res.json(result.rows);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch scheduled messages' });
    }
  });

  app.delete('/api/admin/scheduled/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `UPDATE communication_log SET status = 'cancelled' WHERE id = $1 AND status = 'scheduled' RETURNING id`,
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Scheduled message not found or already sent' });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to cancel scheduled message' });
    }
  });

}
