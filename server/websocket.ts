import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';

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
  const wss = new WebSocketServer({ server, path: '/ws' });

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
    sessionMiddleware(req, mockRes, () => {
      const session = (req as any).session;
      if (!session?.userId) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      ws.userId = session.userId;
      ws.userType = session.isAdmin ? 'admin' : 'user';

      const key = getClientKey(ws.userId!, ws.userType!);
      if (!clients.has(key)) {
        clients.set(key, new Set());
      }
      clients.get(key)!.add(ws);

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
        const clientKey = getClientKey(ws.userId!, ws.userType!);
        const set = clients.get(clientKey);
        if (set) {
          set.delete(ws);
          if (set.size === 0) clients.delete(clientKey);
        }
      });
    });
  });

  return wss;
}
