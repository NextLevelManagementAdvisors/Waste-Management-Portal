import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import { registerAuthRoutes } from './authRoutes';
import { pool } from './db';
import crypto from 'crypto';
import { loadSettingsIntoEnv } from './settings';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const PORT = isProduction ? 5000 : 3001;

// Startup env checks — warn early instead of cryptic 500s later
const requiredEnv = ['DATABASE_URL', 'SESSION_SECRET'];
const recommendedEnv = ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'GOOGLE_MAPS_API_KEY', 'ENCRYPTION_KEY'];
for (const key of requiredEnv) {
  if (!process.env[key]) console.error(`[STARTUP] MISSING REQUIRED: ${key} — server will not function correctly`);
}
for (const key of recommendedEnv) {
  if (!process.env[key]) console.warn(`[STARTUP] Missing optional: ${key} — related features will be unavailable`);
}
if (isProduction && !process.env.ALLOWED_ORIGINS) {
  console.warn(`[STARTUP] Missing ALLOWED_ORIGINS — CORS will block all cross-origin API requests`);
}

app.use(helmet({
  contentSecurityPolicy: false, // disabled to allow inline scripts from React build; tighten in future
  crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

app.use('/api', cors({
  origin: isProduction
    ? (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) {
          cb(null, true);
        } else {
          cb(new Error('Not allowed by CORS'));
        }
      }
    : true,
  credentials: true,
}));

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

const PgSession = connectPgSimple(session);

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (isProduction && !process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET not set in production. Sessions will not persist across restarts.');
}

app.set('trust proxy', 1);

const sessionMiddleware = session({
  store: new PgSession({
    pool: pool as any,
    tableName: 'session',
    createTableIfMissing: false,
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: 'auto',
    sameSite: 'lax',
  },
});

app.use(sessionMiddleware);

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer.');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      const { WebhookHandlers } = await import('./webhookHandlers');
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logging middleware
import { logger, cleanOldLogs } from './logger';
cleanOldLogs();

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration,
    });
  });
  next();
});

app.use('/api/auth/login', authRateLimit);
app.use('/api/auth/register', authRateLimit);
app.use('/api/auth/forgot-password', authRateLimit);
app.use('/api/auth/reset-password', authRateLimit);
registerAuthRoutes(app);

const { registerRoutes } = await import('./routes');
registerRoutes(app);

const { registerAdminRoutes, requireAdmin } = await import('./adminRoutes');
registerAdminRoutes(app);

const { registerAccountingRoutes } = await import('./accountingRoutes');
registerAccountingRoutes(app);

const { registerLogRoutes } = await import('./logRoutes');
registerLogRoutes(app, requireAdmin);

const { registerCommunicationRoutes } = await import('./communicationRoutes');
registerCommunicationRoutes(app);

// Process scheduled messages every 60 seconds
const { processScheduledMessages } = await import('./notificationService');
setInterval(processScheduledMessages, 60_000);

// OptimoRoute automated daily sync — checks every 5 min, runs once per day after SYNC_HOUR
// Reads settings from process.env on each tick so admin changes via UI take effect immediately
{
  const { runAutomatedSync } = await import('./optimoSyncService');
  const { storage: syncStorage } = await import('./storage');
  const SYNC_CHECK_INTERVAL = 5 * 60 * 1000;
  let syncRunning = false;

  async function checkAndRunSync() {
    const syncEnabled = (process.env.OPTIMO_SYNC_ENABLED || 'true') !== 'false';
    if (!syncEnabled || syncRunning) return;
    try {
      const syncHour = parseInt(process.env.OPTIMO_SYNC_HOUR || '6', 10);
      const now = new Date();
      if (now.getHours() < syncHour) return;
      const alreadyRan = await syncStorage.hasSyncRunToday();
      if (alreadyRan) return;

      syncRunning = true;
      console.log(`[OptimoSync] Starting daily automated sync at ${now.toISOString()}`);
      const result = await runAutomatedSync('scheduled');
      console.log(`[OptimoSync] Completed: ${result.ordersCreated} created, ${result.ordersSkipped} skipped, ${result.ordersErrored} errors, ${result.ordersDeleted} deleted`);
    } catch (error: any) {
      console.error('[OptimoSync] Automated sync failed:', error.message);
    } finally {
      syncRunning = false;
    }
  }

  setInterval(checkAndRunSync, SYNC_CHECK_INTERVAL);
}

app.use('/api/team/auth/login', authRateLimit);
app.use('/api/team/auth/register', authRateLimit);
const { registerTeamRoutes } = await import('./teamRoutes');
registerTeamRoutes(app);

const { registerAdminOptimoRoutes } = await import('./adminOptimoRoutes');
registerAdminOptimoRoutes(app);

const { registerInvitationRoutes } = await import('./invitationRoutes');
registerInvitationRoutes(app);

const { ensureAdmin } = await import('./ensureAdmin');
await ensureAdmin();

// Serve uploaded files (photos etc.) in all environments
app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));

if (isProduction) {
  const distPath = path.resolve(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.use((req, res) => {
    // API routes should never serve HTML — return JSON 404
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (req.path.startsWith('/admin')) {
      res.sendFile(path.join(distPath, 'admin', 'index.html'));
    } else if (req.path.startsWith('/team')) {
      res.sendFile(path.join(distPath, 'team', 'index.html'));
    } else {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

// Global error handler — catches unhandled route errors
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`Unhandled server error: ${err.message}`, {
    method: req.method,
    url: req.originalUrl,
    stack: err.stack,
  });
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Run schema.sql on startup (all statements are idempotent with IF NOT EXISTS)
async function initSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  try {
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    await pool.query(sql);
    console.log('Database schema initialized');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
  }
}

await initSchema();
await loadSettingsIntoEnv();

const httpServer = http.createServer(app);

const { setupWebSocket } = await import('./websocket');
setupWebSocket(httpServer, sessionMiddleware);

const host = isProduction ? '0.0.0.0' : '127.0.0.1';
httpServer.listen(PORT, host, () => {
  console.log(`Backend server running on http://${host}:${PORT}`);
});

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required for Stripe integration.');
    return;
  }

  try {
    console.log('Initializing Stripe schema...');
    const { runMigrations } = await import('stripe-replit-sync');
    await runMigrations({ databaseUrl } as any);
    console.log('Stripe schema ready');

    const { getStripeSync } = await import('./stripeClient');
    const stripeSync = await getStripeSync();

    console.log('Setting up managed webhook...');
    const webhookBaseUrl = process.env.APP_DOMAIN || `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    try {
      const result = await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`
      );
      const webhookUrl = result?.webhook?.url || result?.url || webhookBaseUrl + '/api/stripe/webhook';
      console.log(`Webhook configured: ${webhookUrl}`);
    } catch (webhookError: any) {
      console.warn('Webhook setup warning (non-fatal):', webhookError.message);
    }

    console.log('Syncing Stripe data...');
    stripeSync.syncBackfill()
      .then(() => console.log('Stripe data synced'))
      .catch((err: Error) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

initStripe();
