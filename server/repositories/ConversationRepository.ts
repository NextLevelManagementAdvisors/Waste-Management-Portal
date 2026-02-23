import { BaseRepository } from '../db';

export class ConversationRepository extends BaseRepository {
  async createConversation(data: { subject?: string; type: string; createdById: string; createdByType: string; participants: { id: string; type: string; role: string }[] }) {
    const conv = await this.query(
      `INSERT INTO conversations (subject, type, created_by_id, created_by_type) VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.subject || null, data.type, data.createdById, data.createdByType]
    );
    const conversation = conv.rows[0];
    for (const p of data.participants) {
      await this.query(
        `INSERT INTO conversation_participants (conversation_id, participant_id, participant_type, role) VALUES ($1, $2, $3, $4)`,
        [conversation.id, p.id, p.type, p.role]
      );
    }
    return conversation;
  }

  async getConversations(participantId: string, participantType: string, options: { limit?: number; offset?: number; status?: string } = {}) {
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const listParams: any[] = [participantId, participantType, limit, offset];
    const countParams: any[] = [participantId, participantType];
    let statusFilter = '';
    if (options.status && options.status !== 'all') {
      statusFilter = `AND c.status = $5`;
      listParams.push(options.status);
      countParams.push(options.status);
    }
    const countStatusFilter = options.status && options.status !== 'all' ? `AND c.status = $3` : '';
    const result = await this.query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
        (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
        (SELECT sender_type FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_sender_type,
        (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')) as unread_count
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.participant_id = $1 AND cp.participant_type = $2
       ${statusFilter}
       ORDER BY COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.conversation_id = c.id), c.created_at) DESC
       LIMIT $3 OFFSET $4`,
      listParams
    );
    const countResult = await this.query(
      `SELECT COUNT(*) FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.participant_id = $1 AND cp.participant_type = $2
       ${countStatusFilter}`,
      countParams
    );
    return { conversations: result.rows, total: parseInt(countResult.rows[0].count) };
  }

  async getAllConversations(options: { limit?: number; offset?: number; status?: string } = {}) {
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (options.status && options.status !== 'all') {
      conditions.push(`c.status = $${idx++}`);
      params.push(options.status);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
        (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
        (SELECT sender_type FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_sender_type,
        (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at
       FROM conversations c ${where}
       ORDER BY COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.conversation_id = c.id), c.created_at) DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );
    const countResult = await this.query(`SELECT COUNT(*) FROM conversations c ${where}`, params);
    return { conversations: result.rows, total: parseInt(countResult.rows[0].count) };
  }

  async getConversationById(conversationId: string) {
    const result = await this.query(`SELECT * FROM conversations WHERE id = $1`, [conversationId]);
    return result.rows[0] || null;
  }

  async getConversationParticipants(conversationId: string) {
    const result = await this.query(
      `SELECT cp.*,
        CASE
          WHEN cp.participant_type = 'user' THEN (SELECT first_name || ' ' || last_name FROM users WHERE id = cp.participant_id)
          WHEN cp.participant_type = 'admin' THEN (SELECT first_name || ' ' || last_name FROM users WHERE id = cp.participant_id)
          WHEN cp.participant_type = 'driver' THEN (SELECT name FROM driver_profiles WHERE id = cp.participant_id)
        END as participant_name,
        CASE
          WHEN cp.participant_type IN ('user', 'admin') THEN (SELECT email FROM users WHERE id = cp.participant_id)
          WHEN cp.participant_type = 'driver' THEN (SELECT email FROM users WHERE id = cp.participant_id)
        END as participant_email
       FROM conversation_participants cp
       WHERE cp.conversation_id = $1
       ORDER BY cp.joined_at`,
      [conversationId]
    );
    return result.rows;
  }

  async isParticipant(conversationId: string, participantId: string, participantType: string) {
    const result = await this.query(
      `SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND participant_id = $2 AND participant_type = $3`,
      [conversationId, participantId, participantType]
    );
    return result.rows.length > 0;
  }

  async getMessages(conversationId: string, options: { limit?: number; before?: string } = {}) {
    const limit = options.limit || 50;
    const params: any[] = [conversationId, limit];
    let beforeClause = '';
    if (options.before) {
      beforeClause = `AND m.created_at < $3`;
      params.push(options.before);
    }
    const result = await this.query(
      `SELECT m.*,
        CASE
          WHEN m.sender_type = 'user' THEN (SELECT first_name || ' ' || last_name FROM users WHERE id = m.sender_id)
          WHEN m.sender_type = 'admin' THEN (SELECT first_name || ' ' || last_name FROM users WHERE id = m.sender_id)
          WHEN m.sender_type = 'driver' THEN (SELECT name FROM driver_profiles WHERE id = m.sender_id)
        END as sender_name
       FROM messages m
       WHERE m.conversation_id = $1 ${beforeClause}
       ORDER BY m.created_at ASC
       LIMIT $2`,
      params
    );
    return result.rows;
  }

  async createMessage(data: { conversationId: string; senderId: string; senderType: string; body: string; messageType?: string }) {
    const result = await this.query(
      `INSERT INTO messages (conversation_id, sender_id, sender_type, body, message_type) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.conversationId, data.senderId, data.senderType, data.body, data.messageType || 'text']
    );
    await this.query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [data.conversationId]);
    return result.rows[0];
  }

  async markConversationRead(conversationId: string, participantId: string, participantType: string) {
    await this.query(
      `UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND participant_id = $2 AND participant_type = $3`,
      [conversationId, participantId, participantType]
    );
  }

  async updateConversationStatus(conversationId: string, status: string) {
    await this.query(`UPDATE conversations SET status = $1, updated_at = NOW() WHERE id = $2`, [status, conversationId]);
  }

  async getConversationsForCustomer(userId: string) {
    const result = await this.query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
        (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')) as unread_count
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.participant_id = $1 AND cp.participant_type = 'user'
       WHERE c.status != 'archived'
       ORDER BY COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.conversation_id = c.id), c.created_at) DESC`,
      [userId]
    );
    return result.rows;
  }

  async getUnreadCount(participantId: string, participantType: string) {
    const result = await this.query(
      `SELECT COUNT(DISTINCT c.id) as count FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.participant_id = $1 AND cp.participant_type = $2
       WHERE c.status = 'open'
       AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01'))`,
      [participantId, participantType]
    );
    return parseInt(result.rows[0].count);
  }
}
