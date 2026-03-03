import { type Express, type Request, type Response, type NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger, LOGS_DIR_PATH } from './logger';
import { startFix, isFixRunning, getFixProgress, startAutoFix, stopAutoFix, isAutoFixEnabled, parseUserStories, notifyNewError, normalizeErrorKey, readFixedLedger } from './errorFixService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

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
    notifyNewError();
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

      // Build fixed-error lookup: normalized key → commit hash
      const fixedLedger = readFixedLedger(dateStr);
      const fixedMap = new Map<string, string>();
      for (const fe of fixedLedger) {
        fixedMap.set(fe.key, fe.commitHash);
      }

      // Annotate entries with fixedBy commit hash
      const annotated = entries.map((e: any) => {
        const key = normalizeErrorKey(e);
        const commitHash = fixedMap.get(key);
        return commitHash ? { ...e, fixedBy: commitHash } : e;
      });

      annotated.reverse();
      const total = annotated.length;
      const page = annotated.slice(0, limit);

      res.json({ entries: page, total });
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

  // Admin: list user stories for fix context modal
  app.get('/api/admin/user-stories', requireAdmin, (_req: Request, res: Response) => {
    res.json({ stories: parseUserStories() });
  });

  // Admin: trigger error auto-fix via Claude (starts async, poll /fix-progress)
  app.post('/api/admin/fix-errors', requireAdmin, (req: Request, res: Response) => {
    try {
      if (isFixRunning()) {
        return res.status(409).json({ error: 'A fix is already in progress' });
      }

      const { date, source, adminNotes, flaggedStories } = req.body;
      const result = startFix({
        date,
        source,
        includeUserStories: true,
        autoCommit: true,
        adminNotes: typeof adminNotes === 'string' ? adminNotes.slice(0, 5000) : undefined,
        flaggedStories: Array.isArray(flaggedStories) ? flaggedStories.slice(0, 50) : undefined,
      });

      if (!result.started) {
        return res.status(400).json({ error: result.message });
      }

      res.json({ started: true, message: result.message });
    } catch (error) {
      logger.error('Fix errors endpoint failed', error);
      res.status(500).json({ error: 'Fix failed' });
    }
  });

  // Admin: poll fix progress
  app.get('/api/admin/fix-progress', requireAdmin, (_req: Request, res: Response) => {
    res.json(getFixProgress());
  });

  // Admin: auto-fix commit history from git (with full details)
  app.get('/api/admin/fix-history', requireAdmin, (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const detailed = req.query.detailed === 'true';

      const raw = execSync(
        `git log --all --grep="Auto-fix:" --format="%h||%ai||%s||%b||END_ENTRY" -${limit}`,
        { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 5000 },
      ).trim();
      if (!raw) return res.json({ commits: [] });

      const commits = raw.split('||END_ENTRY').filter(Boolean).map(entry => {
        const parts = entry.trim().split('||');
        const hash = parts[0]?.trim();
        const date = parts[1]?.trim();
        const subject = parts[2]?.trim();
        const body = parts.slice(3).join('||').trim();

        // Extract error summaries from commit body
        const errorLines = body
          .split('\n')
          .filter(line => line.startsWith('- '))
          .map(line => line.replace(/^- /, ''));

        const commit: any = { hash, date, message: subject, errors: errorLines };

        if (detailed && hash) {
          try {
            const filesRaw = execSync(
              `git diff-tree --no-commit-id --name-status -r ${hash}`,
              { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 3000 },
            ).trim();
            commit.files = filesRaw.split('\n').filter(Boolean).map(line => {
              const [status, ...fileParts] = line.split('\t');
              return { status: status === 'M' ? 'modified' : status === 'A' ? 'added' : status === 'D' ? 'deleted' : status, path: fileParts.join('\t') };
            });
          } catch {
            commit.files = [];
          }
        }

        return commit;
      }).filter(c => c.hash);

      res.json({ commits });
    } catch {
      res.json({ commits: [] });
    }
  });

  // Admin: get/set auto-fix mode
  app.get('/api/admin/auto-fix/status', requireAdmin, (_req: Request, res: Response) => {
    res.json({ enabled: isAutoFixEnabled(), running: isFixRunning() });
  });

  app.post('/api/admin/auto-fix/toggle', requireAdmin, (req: Request, res: Response) => {
    const { enabled } = req.body;
    if (enabled) {
      startAutoFix();
    } else {
      stopAutoFix();
    }
    res.json({ enabled: isAutoFixEnabled() });
  });
}
