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
import { notifyNewError } from './errorFixService';
import { isAllowedApiOrigin } from './corsConfig';

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

app.use('/api', (req, res, next) => {
  cors({
    origin: isProduction
      ? (origin, cb) => {
          if (isAllowedApiOrigin(req, origin || undefined, allowedOrigins, isProduction)) {
            cb(null, true);
          } else {
            cb(new Error('Not allowed by CORS'));
          }
        }
      : true,
    credentials: true,
  })(req, res, next);
});

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

// Stripe Connect V2 thin-event webhook — must use raw body for signature verification
// Registered BEFORE express.json() so the body remains a raw Buffer.
app.post(
  '/api/connect/webhooks',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const Stripe = (await import('stripe')).default;
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

    if (!secretKey) {
      console.error('[Stripe Connect] STRIPE_SECRET_KEY is not set.');
      return res.status(500).json({ error: 'Stripe not configured' });
    }
    if (!webhookSecret) {
      console.error('[Stripe Connect] STRIPE_CONNECT_WEBHOOK_SECRET is not set.');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    const sig = req.headers['stripe-signature'] as string;
    if (!sig) return res.status(400).json({ error: 'Missing Stripe-Signature header' });

    try {
      const stripeClient = new Stripe(secretKey);

      // Parse the thin event — verifies signature authenticity
      const thinEvent = stripeClient.parseThinEvent(req.body, sig, webhookSecret);

      // Fetch the full event data from Stripe (thin events only contain the ID + type)
      const event = await stripeClient.v2.core.events.retrieve(thinEvent.id);

      // Handle each event type
      switch (event.type) {
        case 'v2.core.account.requirements.updated': {
          const accountId = (event as any).related_object?.id;
          console.log(`[Stripe Connect Webhook] Requirements updated for ${accountId}`);
          if (accountId) {
            const account = await stripeClient.v2.core.accounts.retrieve(accountId, {
              include: ['requirements'],
            });
            console.log(`  → Status: ${account.requirements?.summary?.minimum_deadline?.status || 'none'}`);
          }
          break;
        }
        case 'v2.core.account.capability_status_updated': {
          const accountId = (event as any).related_object?.id;
          console.log(`[Stripe Connect Webhook] Capability status updated for ${accountId}`);
          break;
        }
        default:
          console.log(`[Stripe Connect Webhook] Unhandled event: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err: any) {
      console.error('[Stripe Connect] Webhook error:', err.message);
      res.status(400).json({ error: 'Webhook verification failed' });
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

// Contract expiry scheduler — checks every 6 hours, expires past-due contracts + warns expiring-soon
{
  const CONTRACT_CHECK_INTERVAL = 6 * 60 * 60 * 1000;
  let contractExpiryRunning = false;

  async function checkAndExpireContracts() {
    if (process.env.AUTO_EXPIRE_CONTRACTS !== 'true' || contractExpiryRunning) return;
    contractExpiryRunning = true;
    try {
      const { pool: dbPool } = await import('./db');
      const { sendDriverNotification } = await import('./notificationService');

      // 1. Expire past-due contracts
      const expired = await dbPool.query(
        `UPDATE route_contracts SET status = 'expired', updated_at = NOW()
         WHERE status = 'active' AND end_date < CURRENT_DATE
         RETURNING id, driver_id, day_of_week,
           (SELECT name FROM service_zones WHERE id = route_contracts.zone_id) AS zone_name,
           end_date`
      );
      for (const c of expired.rows) {
        console.log(`[ContractExpiry] Expired contract ${c.id} (${c.zone_name} ${c.day_of_week})`);

        // Unassign future routes from expired contracts (US-4)
        const unassigned = await dbPool.query(
          `UPDATE routes SET assigned_driver_id = NULL, status = 'open', updated_at = NOW()
           WHERE contract_id = $1 AND scheduled_date >= CURRENT_DATE AND status IN ('assigned', 'draft', 'open')
           RETURNING id`,
          [c.id]
        );
        if ((unassigned.rowCount || 0) > 0) {
          console.log(`[ContractExpiry] Unassigned ${unassigned.rowCount} future routes for expired contract ${c.id}`);
        }

        sendDriverNotification(c.driver_id,
          'Contract Expired',
          `<p>Your contract for <strong>${c.zone_name} - ${c.day_of_week}</strong> has expired as of ${c.end_date}.</p><p>Please contact your administrator about renewal.</p>`
        ).catch(err => console.error('[ContractExpiry] Notification error:', err));
      }
      if (expired.rows.length > 0) {
        console.log(`[ContractExpiry] Expired ${expired.rows.length} contract(s)`);
      }

      // 1b. Auto-create a new contract opportunity when a contract expires (if none already open)
      if (process.env.AUTO_REOPEN_EXPIRED_CONTRACTS === 'true' && expired.rows.length > 0) {
        for (const c of expired.rows) {
          const existing = await dbPool.query(
            `SELECT id FROM contract_opportunities WHERE zone_id = (SELECT zone_id FROM route_contracts WHERE id = $1) AND day_of_week = $2 AND status = 'open'`,
            [c.id, c.day_of_week]
          );
          if (existing.rows.length === 0) {
            const zoneId = (await dbPool.query('SELECT zone_id FROM route_contracts WHERE id = $1', [c.id])).rows[0]?.zone_id;
            if (zoneId) {
              await dbPool.query(
                `INSERT INTO contract_opportunities (zone_id, day_of_week, start_date, duration_months, status)
                 VALUES ($1, $2, CURRENT_DATE + INTERVAL '7 days', 3, 'open')`,
                [zoneId, c.day_of_week]
              );
              console.log(`[ContractExpiry] Auto-created opportunity for ${c.zone_name} ${c.day_of_week}`);
              // Give the expiring driver priority notification
              sendDriverNotification(c.driver_id,
                'Renewal Opportunity Available',
                `<p>Your contract for <strong>${c.zone_name} - ${c.day_of_week}</strong> has expired, but a new opportunity for the same zone has been posted.</p>
                 <p>Log in to the team portal to apply.</p>`
              ).catch(() => {});
            }
          }
        }
      }

      // 1c. Auto-renew contracts within 7 days of expiry when auto_renew=true (and no pending renewal request)
      const autoRenewCandidates = await dbPool.query(
        `SELECT rc.id, rc.driver_id, rc.zone_id, rc.custom_zone_id, rc.day_of_week, rc.per_stop_rate,
                rc.start_date, rc.end_date,
                (SELECT name FROM service_zones WHERE id = rc.zone_id) AS zone_name
         FROM route_contracts rc
         WHERE rc.status = 'active'
           AND rc.auto_renew = TRUE
           AND rc.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
           AND NOT EXISTS (
             SELECT 1 FROM contract_renewal_requests crr
             WHERE crr.contract_id = rc.id AND crr.status IN ('pending', 'countered')
           )`
      );
      for (const c of autoRenewCandidates.rows) {
        const durationMs = new Date(c.end_date).getTime() - new Date(c.start_date).getTime();
        const newEnd = new Date(new Date(c.end_date).getTime() + durationMs).toISOString().split('T')[0];
        await dbPool.query(
          `UPDATE route_contracts SET end_date = $1, expiry_warned_at = NULL, updated_at = NOW()
           WHERE id = $2`,
          [newEnd, c.id]
        );
        console.log(`[ContractExpiry] Auto-renewed contract ${c.id} (${c.zone_name} ${c.day_of_week}) → ${newEnd}`);
        sendDriverNotification(c.driver_id,
          'Contract Auto-Renewed',
          `<p>Your contract for <strong>${c.zone_name || 'Zone'} - ${c.day_of_week}</strong> has been automatically renewed to <strong>${newEnd}</strong> at the same rate.</p>`
        ).catch(() => {});
      }
      if (autoRenewCandidates.rows.length > 0) {
        console.log(`[ContractExpiry] Auto-renewed ${autoRenewCandidates.rows.length} contract(s)`);
      }

      // 2. Warn about contracts expiring within 30 days (notify once)
      const expiringSoon = await dbPool.query(
        `SELECT id, driver_id, day_of_week, end_date,
                (SELECT name FROM service_zones WHERE id = route_contracts.zone_id) AS zone_name
         FROM route_contracts
         WHERE status = 'active'
           AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
           AND expiry_warned_at IS NULL`
      );
      for (const c of expiringSoon.rows) {
        await dbPool.query('UPDATE route_contracts SET expiry_warned_at = NOW() WHERE id = $1', [c.id]);
        sendDriverNotification(c.driver_id,
          'Contract Expiring Soon',
          `<p>Your contract for <strong>${c.zone_name} - ${c.day_of_week}</strong> expires on <strong>${c.end_date}</strong>.</p><p>Please contact your administrator if you would like to renew.</p>`
        ).catch(err => console.error('[ContractExpiry] Warning notification error:', err));
      }
      if (expiringSoon.rows.length > 0) {
        console.log(`[ContractExpiry] Sent ${expiringSoon.rows.length} expiry warning(s)`);
      }
    } catch (error: any) {
      console.error('[ContractExpiry] Scheduler error:', error.message);
    } finally {
      contractExpiryRunning = false;
    }
  }

  setInterval(checkAndExpireContracts, CONTRACT_CHECK_INTERVAL);
}

// Automated Swap Engine — checks periodically for and executes high-confidence swaps
{
  const SWAP_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // every 6 hours
  let swapEngineRunning = false;

  async function runSwapEngine() {
    if (process.env.AUTO_SWAP_ENABLED !== 'true' || swapEngineRunning) return;
    swapEngineRunning = true;
    try {
      const { executeAutomaticSwaps } = await import('./swapRecommendationService');
      console.log('[SwapEngine] Running automated swap analysis...');
      await executeAutomaticSwaps();
    } catch (error: any) {
      console.error('[SwapEngine] Scheduler error:', error.message);
    } finally {
      swapEngineRunning = false;
    }
  }

  setInterval(runSwapEngine, SWAP_CHECK_INTERVAL);
}

// Auto-route generation scheduler — nightly job ensures routes exist 8 weeks ahead for every active contract
{
  const ROUTE_GEN_INTERVAL = 24 * 60 * 60 * 1000; // every 24 hours
  let routeGenRunning = false;

  async function generateContractRoutes() {
    if (process.env.AUTO_GENERATE_CONTRACT_ROUTES !== 'true' || routeGenRunning) return;
    routeGenRunning = true;
    try {
      const { pool: dbPool } = await import('./db');
      const { storage: storageModule } = await import('./storage');
      const { recalculateRouteValue } = await import('./compensationEngine');

      const { rows: contracts } = await dbPool.query(
        `SELECT rc.id, rc.driver_id, rc.zone_id, rc.day_of_week, rc.per_stop_rate,
                sz.name AS zone_name
         FROM route_contracts rc
         JOIN service_zones sz ON rc.zone_id = sz.id
         WHERE rc.status = 'active' AND rc.end_date >= CURRENT_DATE`
      );

      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const WEEKS_AHEAD = 8;
      let totalCreated = 0;

      for (const contract of contracts) {
        const targetDayIndex = dayNames.indexOf(contract.day_of_week.toLowerCase());
        if (targetDayIndex === -1) continue;

        // Collect matching weekdays for the next 8 weeks
        const dates: string[] = [];
        const cursor = new Date();
        cursor.setHours(12, 0, 0, 0);
        const limit = new Date();
        limit.setDate(limit.getDate() + WEEKS_AHEAD * 7);
        while (cursor <= limit) {
          if (cursor.getDay() === targetDayIndex) {
            dates.push(cursor.toISOString().split('T')[0]);
          }
          cursor.setDate(cursor.getDate() + 1);
        }

        if (dates.length === 0) continue;

        // Skip dates that already have a route for this contract
        const { rows: existing } = await dbPool.query(
          `SELECT scheduled_date FROM routes WHERE contract_id = $1 AND scheduled_date = ANY($2)`,
          [contract.id, dates]
        );
        const existingSet = new Set(existing.map((r: any) => {
          const d = r.scheduled_date;
          return typeof d === 'string' ? d.split('T')[0] : new Date(d).toISOString().split('T')[0];
        }));
        const newDates = dates.filter(d => !existingSet.has(d));
        if (newDates.length === 0) continue;

        // Fetch approved locations for this zone+day
        const { rows: locationRows } = await dbPool.query(
          `SELECT id FROM locations WHERE zone_id = $1 AND collection_day = $2 AND service_status = 'approved' ORDER BY address`,
          [contract.zone_id, contract.day_of_week]
        );
        const locationIds = locationRows.map((l: any) => l.id);

        for (const date of newDates) {
          const title = `${contract.zone_name} - ${contract.day_of_week.charAt(0).toUpperCase() + contract.day_of_week.slice(1)}`;
          const route = await storageModule.createRoute({
            title,
            scheduled_date: date,
            assigned_driver_id: contract.driver_id,
            route_type: 'daily_route',
            zone_id: contract.zone_id,
            source: 'contract',
            status: 'assigned',
          });
          await dbPool.query(
            `UPDATE routes SET contract_id = $1, pay_mode = 'dynamic' WHERE id = $2`,
            [contract.id, route.id]
          );
          let orderNum = 1;
          for (const locId of locationIds) {
            await dbPool.query(
              `INSERT INTO route_orders (route_id, location_id, order_type, order_number, status) VALUES ($1, $2, 'recurring', $3, 'pending')`,
              [route.id, locId, orderNum++]
            );
          }
          if (locationIds.length > 0) await recalculateRouteValue(route.id);
          totalCreated++;
        }
      }

      if (totalCreated > 0) {
        console.log(`[RouteGen] Auto-generated ${totalCreated} route(s) across ${contracts.length} contract(s)`);
      }
    } catch (error: any) {
      console.error('[RouteGen] Scheduler error:', error.message);
    } finally {
      routeGenRunning = false;
    }
  }

  // Run once at startup (after a short delay to let routes register), then daily
  setTimeout(generateContractRoutes, 30_000);
  setInterval(generateContractRoutes, ROUTE_GEN_INTERVAL);
}

// Lifecycle cleanup scheduler — expires stale on-demand requests, opportunities, coverage requests; escalates missed collections
{
  const LIFECYCLE_CHECK_INTERVAL = 60 * 60 * 1000; // every hour
  let lifecycleRunning = false;

  async function runLifecycleCleanup() {
    if (lifecycleRunning) return;
    lifecycleRunning = true;
    try {
      const { pool: dbPool } = await import('./db');

      // US-5: Auto-expire on-demand requests past requested_date
      const expiredOD = await dbPool.query(
        `UPDATE on_demand_requests SET status = 'cancelled', updated_at = NOW()
         WHERE status = 'pending' AND requested_date < CURRENT_DATE
         RETURNING id`
      );
      if ((expiredOD.rowCount || 0) > 0) {
        console.log(`[Lifecycle] Auto-expired ${expiredOD.rowCount} stale on-demand request(s)`);
      }

      // Auto-resolve missed collections: create on-demand pickup for next available date
      const pendingMissed = await dbPool.query(
        `SELECT mcr.id, mcr.location_id, mcr.user_id, p.address
         FROM missed_collection_reports mcr
         JOIN locations p ON p.id = mcr.location_id
         WHERE mcr.status = 'pending' AND mcr.created_at < NOW() - INTERVAL '2 hours'
           AND mcr.created_at > NOW() - INTERVAL '48 hours'`
      );
      for (const mc of pendingMissed.rows) {
        try {
          // Schedule a makeup pickup for the next business day
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1); // skip Sunday
          const makeupDate = tomorrow.toISOString().split('T')[0];

          await dbPool.query(
            `INSERT INTO on_demand_requests (user_id, location_id, service_name, service_price, requested_date, notes, status)
             VALUES ($1, $2, 'Missed Collection Makeup', 0, $3, $4, 'scheduled')`,
            [mc.user_id, mc.location_id, makeupDate, `Auto-scheduled makeup for missed collection report ${mc.id}`]
          );
          await dbPool.query(
            `UPDATE missed_collection_reports SET status = 'resolved', resolution_notes = 'Auto-rescheduled makeup pickup', updated_at = NOW()
             WHERE id = $1`,
            [mc.id]
          );

          // Notify customer
          try {
            const { sendCustomNotification } = await import('./notificationService');
            sendCustomNotification(mc.user_id, `Your missed collection at ${mc.address} has been rescheduled for ${makeupDate}.`).catch(() => {});
          } catch {}

          console.log(`[Lifecycle] Auto-resolved missed collection ${mc.id} — makeup scheduled for ${makeupDate}`);
        } catch (err: any) {
          console.error(`[Lifecycle] Failed to auto-resolve missed collection ${mc.id}:`, err.message);
        }
      }

      // US-6: Escalate remaining unresolved missed collections (> 48 hours)
      const escalated = await dbPool.query(
        `UPDATE missed_collection_reports SET status = 'escalated', updated_at = NOW()
         WHERE status = 'pending' AND created_at < NOW() - INTERVAL '48 hours'
         RETURNING id`
      );
      if ((escalated.rowCount || 0) > 0) {
        console.log(`[Lifecycle] Escalated ${escalated.rowCount} aging missed collection report(s)`);
      }

      // US-7: Auto-expire coverage requests past deadline or coverage_date
      const expiredCR = await dbPool.query(
        `UPDATE coverage_requests SET status = 'denied'
         WHERE status = 'pending'
           AND (coverage_date < CURRENT_DATE OR (deadline IS NOT NULL AND deadline < CURRENT_DATE))
         RETURNING id`
      );
      if ((expiredCR.rowCount || 0) > 0) {
        console.log(`[Lifecycle] Auto-expired ${expiredCR.rowCount} stale coverage request(s)`);
      }

      // Auto-expire zone assignment requests past deadline
      const expiredZAR = await dbPool.query(
        `UPDATE zone_assignment_requests SET status = 'expired'
         WHERE status = 'pending' AND deadline < NOW()
         RETURNING id`
      );
      if ((expiredZAR.rowCount || 0) > 0) {
        console.log(`[Lifecycle] Auto-expired ${expiredZAR.rowCount} stale zone assignment request(s)`);
      }

      // US-8: Auto-expire opportunities past start_date
      const expiredOpp = await dbPool.query(
        `UPDATE contract_opportunities SET status = 'cancelled'
         WHERE status = 'open' AND start_date < CURRENT_DATE
         RETURNING id`
      );
      if ((expiredOpp.rowCount || 0) > 0) {
        console.log(`[Lifecycle] Auto-expired ${expiredOpp.rowCount} stale opportunity/opportunities`);
      }
    } catch (error: any) {
      console.error('[Lifecycle] Scheduler error:', error.message);
    } finally {
      lifecycleRunning = false;
    }
  }

  setInterval(runLifecycleCleanup, LIFECYCLE_CHECK_INTERVAL);
}

// Bid auto-accept scheduler — checks every 5 minutes for bids past their window
{
  const BID_CHECK_INTERVAL = 5 * 60 * 1000;
  let bidAutoAcceptRunning = false;

  async function checkAndAutoAcceptBids() {
    if (bidAutoAcceptRunning) return;
    bidAutoAcceptRunning = true;
    try {
      const { runBidAutoAccept } = await import('./bidAutoAcceptEngine');
      const result = await runBidAutoAccept();
      if (result.accepted > 0 || result.expired > 0) {
        console.log(`[BidAutoAccept] Accepted: ${result.accepted}, Expired: ${result.expired}`);
      }
    } catch (error: any) {
      console.error('[BidAutoAccept] Scheduler error:', error.message);
    } finally {
      bidAutoAcceptRunning = false;
    }
  }

  setInterval(checkAndAutoAcceptBids, BID_CHECK_INTERVAL);
}

// GPS location cleanup — prune location data older than 30 days (runs daily)
{
  async function pruneOldLocations() {
    try {
      const result = await pool.query(`DELETE FROM driver_locations WHERE recorded_at < NOW() - INTERVAL '30 days'`);
      if ((result.rowCount || 0) > 0) {
        console.log(`[LocationCleanup] Pruned ${result.rowCount} old location records`);
      }
    } catch (error: any) {
      console.error('[LocationCleanup] Error:', error.message);
    }
  }
  setInterval(pruneOldLocations, 24 * 60 * 60 * 1000);
}

// Surge pricing recalculation — runs every 15 minutes
{
  const SURGE_INTERVAL = 15 * 60 * 1000;
  async function recalcSurge() {
    if (process.env.SURGE_PRICING_ENABLED === 'false') return;
    try {
      const { applySurgePricing } = await import('./surgePricingEngine');
      const result = await applySurgePricing();
      if (result.updated > 0) {
        console.log(`[SurgePricing] Updated ${result.updated} route(s) with surge premiums`);
        const { broadcastToAdmins } = await import('./websocket');
        broadcastToAdmins('surge:updated', { updated: result.updated });
      }
    } catch (error: any) {
      console.error('[SurgePricing] Error:', error.message);
    }
  }
  setInterval(recalcSurge, SURGE_INTERVAL);
}

// Geographic expansion — analyze waitlisted demand clusters daily
{
  const EXPANSION_INTERVAL = 24 * 60 * 60 * 1000;
  const DEMAND_THRESHOLD = 5; // min waitlisted locations to trigger cluster

  async function analyzeExpansionDemand() {
    try {
      // Find waitlisted/pending locations without a zone that cluster geographically
      const waitlisted = await pool.query(
        `SELECT id, latitude, longitude, address
         FROM locations
         WHERE status IN ('waitlisted', 'pending_review')
           AND zone_id IS NULL
           AND latitude IS NOT NULL AND longitude IS NOT NULL`
      );

      if (waitlisted.rows.length < DEMAND_THRESHOLD) return;

      // Simple clustering: group by 5-mile radius around each point
      const clusters: Array<{ centerLat: number; centerLng: number; locations: any[] }> = [];
      const used = new Set<string>();

      for (const loc of waitlisted.rows) {
        if (used.has(loc.id)) continue;
        const cluster = { centerLat: parseFloat(loc.latitude), centerLng: parseFloat(loc.longitude), locations: [loc] };
        for (const other of waitlisted.rows) {
          if (other.id === loc.id || used.has(other.id)) continue;
          const dist = haversine(cluster.centerLat, cluster.centerLng, parseFloat(other.latitude), parseFloat(other.longitude));
          if (dist <= 5) {
            cluster.locations.push(other);
            used.add(other.id);
          }
        }
        used.add(loc.id);
        if (cluster.locations.length >= DEMAND_THRESHOLD) {
          // Recalculate center
          cluster.centerLat = cluster.locations.reduce((s: number, l: any) => s + parseFloat(l.latitude), 0) / cluster.locations.length;
          cluster.centerLng = cluster.locations.reduce((s: number, l: any) => s + parseFloat(l.longitude), 0) / cluster.locations.length;
          clusters.push(cluster);
        }
      }

      for (const cluster of clusters) {
        // Check if cluster already exists nearby
        const existing = await pool.query(
          `SELECT id FROM demand_clusters
           WHERE status IN ('identified', 'opportunity_created')
             AND ABS(center_lat - $1) < 0.05 AND ABS(center_lng - $2) < 0.05`,
          [cluster.centerLat, cluster.centerLng]
        );
        if (existing.rows.length > 0) continue;

        await pool.query(
          `INSERT INTO demand_clusters (center_lat, center_lng, location_count, status)
           VALUES ($1, $2, $3, 'identified')`,
          [cluster.centerLat, cluster.centerLng, cluster.locations.length]
        );

        console.log(`[Expansion] New demand cluster: ${cluster.locations.length} locations near (${cluster.centerLat.toFixed(4)}, ${cluster.centerLng.toFixed(4)})`);

        // Notify admins
        const { broadcastToAdmins } = await import('./websocket');
        broadcastToAdmins('expansion:cluster_found', {
          locationCount: cluster.locations.length,
          centerLat: cluster.centerLat,
          centerLng: cluster.centerLng,
        });
      }
    } catch (error: any) {
      console.error('[Expansion] Error:', error.message);
    }
  }

  function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3959;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  setInterval(analyzeExpansionDemand, EXPANSION_INTERVAL);
}

app.use('/api/team/auth/login', authRateLimit);
app.use('/api/team/auth/register', authRateLimit);
const { registerTeamRoutes } = await import('./teamRoutes');
registerTeamRoutes(app);

const { registerAdminOptimoRoutes } = await import('./adminOptimoRoutes');
registerAdminOptimoRoutes(app);

const { registerWeatherRoutes } = await import('./weatherRoutes');
registerWeatherRoutes(app);

const { registerInvitationRoutes } = await import('./invitationRoutes');
registerInvitationRoutes(app);

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
    const sendSpa = (file: string) => {
      res.sendFile(file, (err) => {
        if (err && !res.headersSent) {
          res.status(404).send('App not built yet. Run: npm run build');
        }
      });
    };
    if (req.path.startsWith('/admin')) {
      sendSpa(path.join(distPath, 'admin', 'index.html'));
    } else if (
      req.path.startsWith('/provider') ||
      req.path.startsWith('/driver') ||
      req.path.startsWith('/join')
    ) {
      sendSpa(path.join(distPath, 'team', 'index.html'));
    } else {
      sendSpa(path.join(distPath, 'index.html'));
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
  notifyNewError();
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

const { ensureAdmin } = await import('./ensureAdmin');
await ensureAdmin();

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

// ============================================================
// Provider compliance scheduler — runs daily
// ============================================================
{
  const COMPLIANCE_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // every 24 hours
  let complianceRunning = false;

  async function runProviderComplianceCheck() {
    if (complianceRunning) return;
    complianceRunning = true;
    try {
      const { storage: st } = await import('./storage');
      const { notifyProviderInsuranceExpiring } = await import('./slackNotifier');

      // Auto-expire provider contracts whose end_date has passed
      const expired = await st.expireProviderContracts();
      if (expired.length > 0) {
        console.log(`[Compliance] Auto-expired ${expired.length} provider contract(s)`);
      }

      // Insurance expiry warnings at 30, 14, 7 days
      for (const days of [30, 14, 7]) {
        const providers = await st.getProvidersWithExpiringInsurance(days);
        for (const provider of providers) {
          // Only notify at the specific threshold (avoid re-notifying every day)
          const daysLeft = Math.ceil(
            (new Date(provider.insurance_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          if (daysLeft === days) {
            notifyProviderInsuranceExpiring(provider.name, provider.owner_email, daysLeft).catch(() => {});
            console.log(`[Compliance] Insurance expiry warning sent: ${provider.name} (${daysLeft}d)`);
          }
        }
      }

      // Log expired insurance
      const expired_insurance = await st.getProvidersWithExpiredInsurance();
      if (expired_insurance.length > 0) {
        console.log(`[Compliance] ${expired_insurance.length} provider(s) have expired insurance — admin action required`);
      }
    } catch (err) {
      console.error('[Compliance] Provider compliance check error:', err);
    } finally {
      complianceRunning = false;
    }
  }

  // Run once at startup (after a short delay), then every 24h
  setTimeout(runProviderComplianceCheck, 5 * 60 * 1000);
  setInterval(runProviderComplianceCheck, COMPLIANCE_CHECK_INTERVAL);
}
