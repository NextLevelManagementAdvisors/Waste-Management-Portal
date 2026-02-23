import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import { pool } from './storage';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  userType?: string;
  isAlive?: boolean;
}

const clients = new Map<string, Set<AuthenticatedSocket>>();

function getClientKey(userId: string, userType: string) {
  return `${userType}:${userId}`;
}

export function broadcastToParticipants(participantKeys: string[], event: string, data: any) {
  for (const key of participantKeys) {
    const sockets = clients.get(key);
    if (sockets) {
      const payload = JSON.stringify({ event, data });
      sockets.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      });
    }
  }
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

      // Determine participant types from roles and register under all of them
      const rolesResult = await pool.query(
        'SELECT role FROM user_roles WHERE user_id = $1',
        [session.userId]
      );
      const userRoles = rolesResult.rows.map((r: any) => r.role);

      const participantTypes: string[] = [];
      if (userRoles.includes('admin')) participantTypes.push('admin');
      if (userRoles.includes('driver')) participantTypes.push('driver');
      if (userRoles.includes('customer') || participantTypes.length === 0) participantTypes.push('user');

      ws.userType = participantTypes[0];
      (ws as any)._registeredKeys = [] as string[];

      for (const pType of participantTypes) {
        const key = getClientKey(ws.userId!, pType);
        if (!clients.has(key)) clients.set(key, new Set());
        clients.get(key)!.add(ws);
        (ws as any)._registeredKeys.push(key);
      }

      ws.send(JSON.stringify({ event: 'connected', data: { userId: ws.userId, userType: ws.userType } }));

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.event === 'ping') {
            ws.send(JSON.stringify({ event: 'pong' }));
          }
        } catch {}
      });

      ws.on('close', () => {
        for (const key of ((ws as any)._registeredKeys || [])) {
          const set = clients.get(key);
          if (set) {
            set.delete(ws);
            if (set.size === 0) clients.delete(key);
          }
        }
      });
    });
  });

  return wss;
}
