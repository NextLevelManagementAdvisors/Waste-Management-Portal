import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import { pool } from './db';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  userType?: string;
  isAlive?: boolean;
}

const clients = new Map<string, Set<AuthenticatedSocket>>();

function getClientKey(userId: string, userType: string) {
  return `${userType}:${userId}`;
}

class WebSocketManager {
  private clients = new Map<string, Set<AuthenticatedSocket>>();
  private adminUserIds = new Set<string>();

  constructor() {
    this.loadAdminIds();
  }

  async loadAdminIds() {
    try {
      const res = await pool.query(`SELECT id FROM users WHERE is_admin = true`);
      this.adminUserIds = new Set(res.rows.map(r => r.id));
    } catch (error) {
      console.error('Failed to load admin user IDs for WebSocketManager:', error);
    }
  }

  addClient(ws: AuthenticatedSocket, userId: string, userRoles: string[]) {
    (ws as any)._registeredKeys = [] as string[];
    const participantTypes: string[] = [];
    if (userRoles.includes('admin')) participantTypes.push('admin');
    if (userRoles.includes('driver')) participantTypes.push('driver');
    if (userRoles.includes('customer') || participantTypes.length === 0) participantTypes.push('user');

    ws.userType = participantTypes[0];

    for (const pType of participantTypes) {
        const key = this.getClientKey(userId, pType);
        if (!this.clients.has(key)) this.clients.set(key, new Set());
        this.clients.get(key)!.add(ws);
        (ws as any)._registeredKeys.push(key);
    }
  }

  removeClient(ws: AuthenticatedSocket) {
    for (const key of ((ws as any)._registeredKeys || [])) {
      const set = this.clients.get(key);
      if (set) {
        set.delete(ws);
        if (set.size === 0) this.clients.delete(key);
      }
    }
  }

  getClientKey(userId: string, userType: string) {
    return `${userType}:${userId}`;
  }

  broadcastTo(participantKeys: string[], payload: any) {
    const payloadString = JSON.stringify(payload);
    for (const key of participantKeys) {
      const sockets = this.clients.get(key);
      if (sockets) {
        sockets.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(payloadString);
          }
        });
      }
    }
  }

  async broadcastToConversation(conversationId: string, payload: any, excludeSenderId?: string) {
    try {
      const res = await pool.query(
        'SELECT participant_id, participant_type FROM conversation_participants WHERE conversation_id = $1',
        [conversationId]
      );
      const participantKeys = res.rows
        .filter(p => p.participant_id !== excludeSenderId)
        .map(p => this.getClientKey(p.participant_id, p.participant_type));
      this.broadcastTo(participantKeys, payload);
    } catch (error) {
      console.error(`Failed to broadcast to conversation ${conversationId}:`, error);
    }
  }
  
  broadcastToAdmins(payload: any) {
    const adminKeys = Array.from(this.adminUserIds).map(id => this.getClientKey(id, 'admin'));
    this.broadcastTo(adminKeys, payload);
  }
}

export const webSocketManager = new WebSocketManager();

export function broadcastToParticipants(participantKeys: string[], event: string, data: any) {
  webSocketManager.broadcastTo(participantKeys, { event, data });
}


export function setupWebSocket(server: Server, sessionMiddleware: any) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedSocket) => {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', (ws: AuthenticatedSocket, req: IncomingMessage) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    const mockRes = { end: () => {}, setHeader: () => {}, getHeader: () => '' } as any;
    sessionMiddleware(req, mockRes, async () => {
      const session = (req as any).session;

      if (!session?.userId) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      ws.userId = session.userId;

      const rolesResult = await pool.query(
        'SELECT role FROM user_roles WHERE user_id = $1',
        [session.userId]
      );
      const userRoles = rolesResult.rows.map((r: any) => r.role);
      
      webSocketManager.addClient(ws, ws.userId!, userRoles);

      ws.send(JSON.stringify({ event: 'connected', data: { userId: ws.userId, userRoles } }));

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.event === 'ping') {
            ws.send(JSON.stringify({ event: 'pong' }));
          }
        } catch {}
      });

      ws.on('close', () => {
        webSocketManager.removeClient(ws);
      });
    });
  });

  return wss;
}
