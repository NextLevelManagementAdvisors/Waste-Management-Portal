import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerAuthRoutes } from './authRoutes';
import { pool } from './storage';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const PORT = isProduction ? 5000 : 3001;

app.use(cors({
  origin: true,
  credentials: true,
}));

const PgSession = connectPgSimple(session);

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (isProduction && !process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET not set in production. Sessions will not persist across restarts.');
}

app.set('trust proxy', 1);

app.use(session({
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
    secure: isProduction,
    sameSite: 'lax',
  },
}));

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

registerAuthRoutes(app);

const { registerRoutes } = await import('./routes');
registerRoutes(app);

const { registerAdminRoutes } = await import('./adminRoutes');
registerAdminRoutes(app);

if (isProduction) {
  const distPath = path.resolve(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.use((_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const host = isProduction ? '0.0.0.0' : '127.0.0.1';
app.listen(PORT, host, () => {
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
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
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
