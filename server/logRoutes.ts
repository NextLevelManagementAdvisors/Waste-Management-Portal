import { type Express, type Request, type Response, type NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { logger, LOGS_DIR_PATH } from './logger';

const clientErrorRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many error reports' },
});

export function registerLogRoutes(
  app: Express,
  requireAdmin: (req: Request, res: Response, next: NextFunction) => void,
) {
  // Client error reporting — no auth required
  app.post('/api/log/error', clientErrorRateLimit, (req: Request, res: Response) => {
    const { message, stack, context, url, userAgent, spa } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }
    logger.clientError({
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 5000),
      context: context?.slice(0, 500),
      url: url?.slice(0, 2000),
      userAgent: userAgent?.slice(0, 500),
      spa: spa?.slice(0, 20),
    });
    res.json({ received: true });
  });

  // Admin: read recent error log entries
  app.get('/api/admin/logs/errors', requireAdmin, (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const source = req.query.source as string;
      const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];

      const logFile = path.join(LOGS_DIR_PATH, `error-${dateStr}.log`);
      if (!fs.existsSync(logFile)) {
        return res.json({ entries: [], total: 0 });
      }

      const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
      let entries = lines
        .map(line => {
          try { return JSON.parse(line); } catch { return null; }
        })
        .filter(Boolean);

      if (source) {
        entries = entries.filter((e: any) => e.source === source);
      }

      entries.reverse();
      const total = entries.length;
      entries = entries.slice(0, limit);

      res.json({ entries, total });
    } catch (error) {
      logger.error('Failed to read error logs', error);
      res.status(500).json({ error: 'Failed to read logs' });
    }
  });

  // Admin: list available log dates
  app.get('/api/admin/logs/dates', requireAdmin, (_req: Request, res: Response) => {
    try {
      if (!fs.existsSync(LOGS_DIR_PATH)) {
        return res.json({ dates: [] });
      }
      const files = fs.readdirSync(LOGS_DIR_PATH)
        .filter(f => f.startsWith('error-') && f.endsWith('.log'))
        .map(f => f.replace('error-', '').replace('.log', ''))
        .sort()
        .reverse();
      res.json({ dates: files });
    } catch {
      res.status(500).json({ error: 'Failed to list log dates' });
    }
  });
}
