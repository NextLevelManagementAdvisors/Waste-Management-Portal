import { type Express, type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import { auth } from '@googleapis/gmail';
import { storage, DbPendingSelection } from './storage';
import { pool } from './db';
import { roleRepo } from './repositories/RoleRepository';
import { getUncachableStripeClient } from './stripeClient';
import { sendCollectionReminder, sendBillingAlert, sendServiceUpdate, sendCustomNotification, sendDriverNotification, sendRouteCancelNotification, sendServiceStatusNotification, sendMissedCollectionResolution, sendOnDemandApproval } from './notificationService';
import * as optimo from './optimoRouteClient';
import { getAllSettings, saveSetting } from './settings';
import { testAllIntegrations, testSingleIntegration } from './integrationTests';
import { expenseRepo } from './repositories/ExpenseRepository';
import { billingRepo } from './repositories/BillingRepository';
import { optimizeRouteJob, checkRouteOptimizationStatus } from './optimoSyncService';
import { suggestRoute } from './routeSuggestionService';
import { findOptimalCollectionDay } from './collectionDayOptimizer';
import { activatePendingSelections } from './activateSelections';
import { checkRouteFeasibility } from './feasibilityCheck';
import { approvalMessage, denialMessage, waitlistMessage } from './addressReviewMessages';
import { notifyZoneDecision, notifyWaitlistFlagged } from './slackNotifier';
import { formatRouteForClient } from './formatRoute';
import { calculateRouteValuation, recalculateRouteValue, previewLocationCompensation, getActiveRules, calculateStopCompensation } from './compensationEngine';
import { broadcastToDriver, broadcastToZoneDrivers, broadcastToAdmins, broadcastToUser } from './websocket';
import {
  buildRouteStopIdentifierBackfill,
  fetchCompletionPayloadsByIdentifier,
  getOptimoApiStopIdentifier,
  getRouteDate,
  getStoredOptimoIdentifier,
  normalizeOptimoStatus,
} from './optimoStopHelpers';

declare module 'express-session' {
  interface SessionData {
    gmailOAuthState?: string;
  }
}

export type AdminRole = 'full_admin' | 'support' | 'viewer';

export const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  full_admin: ['*'],
  support: ['customers', 'communications', 'operations', 'billing.read', 'audit.read'],
  viewer: ['dashboard.read', 'customers.read', 'audit.read'],
};

export function hasPermission(role: AdminRole | null, permission: string): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (perms.includes('*')) return true;
  if (perms.includes(permission)) return true;
  const basePermission = permission.split('.')[0];
  if (perms.includes(basePermission)) return true;
  return false;
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const adminCheckId = req.session.originalAdminUserId || req.session.userId;
    const user = await storage.getUserById(adminCheckId);
    if (!user) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const adminRole = await roleRepo.getAdminRole(adminCheckId);
    if (!adminRole) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    (req as any).adminUser = user;
    (req as any).adminRole = adminRole as AdminRole;
    next();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req as any).adminRole as AdminRole;
    if (!hasPermission(role, permission)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

export function registerAdminRoutes(app: Express) {
  app.get('/api/admin/stats', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getAdminStats();

      let stripeStats = { revenue: 0, activeSubscriptions: 0, openInvoices: 0 };
      try {
        const now = new Date();
        const d30 = new Date(now);
        d30.setDate(d30.getDate() - 30);

        const [revenue, subStats, openInvoiceCount] = await Promise.all([
          billingRepo.getRevenueForPeriod(d30.toISOString(), now.toISOString()),
          billingRepo.getActiveSubscriptionStats(),
          billingRepo.countAllInvoices({ status: 'open' }),
        ]);

        stripeStats.revenue = revenue;
        stripeStats.activeSubscriptions = subStats.count;
        stripeStats.openInvoices = openInvoiceCount;
      } catch (e) {
        console.error('Error fetching billing stats:', e);
      }

      res.json({ ...stats, ...stripeStats });
    } catch (error) {
      console.error('Admin stats error:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // Lightweight badge counts for sidebar notifications (no Stripe calls)
  app.get('/api/admin/badge-counts', requireAdmin, async (req: Request, res: Response) => {
    try {
      const adminUserId = req.session.originalAdminUserId || req.session.userId!;
      const [pendingReviews, pendingMissedCollections, unreadMessages, oldestMissedCollection, oldestReview, noCollectionDay, pendingZonesResult, flaggedWaitlistResult, contractAlerts] = await Promise.all([
        storage.query(`SELECT COUNT(*) as count FROM locations WHERE service_status = 'pending_review'`),
        storage.query(`SELECT COUNT(*) as count FROM missed_collection_reports WHERE status = 'pending'`),
        storage.getUnreadCount(adminUserId, 'admin').catch(() => 0),
        storage.query(`SELECT MIN(created_at) as oldest FROM missed_collection_reports WHERE status = 'pending'`),
        storage.query(`SELECT MIN(created_at) as oldest FROM locations WHERE service_status = 'pending_review'`),
        storage.query(`SELECT COUNT(*) as count FROM locations WHERE service_status = 'approved' AND collection_day IS NULL`),
        storage.query(`SELECT COUNT(*) as count FROM driver_custom_zones WHERE status = 'pending_approval'`),
        storage.query(`SELECT COUNT(*) as count FROM locations WHERE service_status = 'waitlist' AND coverage_flagged_at IS NOT NULL`),
        storage.query(`SELECT
          COALESCE((SELECT COUNT(*) FROM route_contracts WHERE status = 'active' AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'), 0) AS expiring,
          COALESCE((SELECT COUNT(*) FROM coverage_requests WHERE status = 'pending'), 0) AS pending_coverage`),
      ]);
      const missedCollections = parseInt(pendingMissedCollections.rows[0]?.count || '0');
      const addressReviews = parseInt(pendingReviews.rows[0]?.count || '0');
      const locationsNeedingCollectionDay = parseInt(noCollectionDay.rows[0]?.count || '0');
      const pendingZones = parseInt(pendingZonesResult.rows[0]?.count || '0');
      const flaggedWaitlist = parseInt(flaggedWaitlistResult.rows[0]?.count || '0');
      const contractsExpiring = parseInt(contractAlerts.rows[0]?.expiring || '0');
      const pendingCoverage = parseInt(contractAlerts.rows[0]?.pending_coverage || '0');
      const oldestMcDate = oldestMissedCollection.rows[0]?.oldest;
      const oldestArDate = oldestReview.rows[0]?.oldest;
      const hoursAgo = (d: string | null) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 3600000) : 0;
      res.json({
        operations: missedCollections + pendingZones,
        dashboard: addressReviews + flaggedWaitlist,
        communications: typeof unreadMessages === 'number' ? unreadMessages : parseInt((unreadMessages as any)?.count || '0'),
        missedCollections,
        addressReviews,
        locationsNeedingCollectionDay,
        pendingZones,
        flaggedWaitlist,
        oldestMissedCollectionHours: hoursAgo(oldestMcDate),
        oldestAddressReviewHours: hoursAgo(oldestArDate),
        contractsExpiring,
        pendingCoverage,
      });
    } catch (error) {
      console.error('Badge counts error:', error);
      res.json({ operations: 0, dashboard: 0, communications: 0, missedCollections: 0, addressReviews: 0 });
    }
  });

  const getAdminId = (req: Request) => req.session.originalAdminUserId || req.session.userId!;

  const audit = async (req: Request, action: string, entityType?: string, entityId?: string, details?: any) => {
    try { await storage.createAuditLog(getAdminId(req), action, entityType, entityId, details); } catch (e) { console.error('Audit log error:', e); }
  };

  const applyOptimoIdentifierBackfill = async (route: any, stops: any[], optimoRoutes?: any[]) => {
    if (!stops.some(stop => !getStoredOptimoIdentifier(stop))) return 0;

    const routeDate = String(route?.scheduled_date ?? route?.scheduledDate ?? '').split('T')[0];
    if (!routeDate) return 0;

    const routesForDate = optimoRoutes || (await optimo.getRoutes(routeDate)).routes || [];
    const updates = buildRouteStopIdentifierBackfill(route, stops, routesForDate);

    for (const update of updates) {
      const stop = stops.find((candidate: any) => candidate.id === update.stopId);
      if (!stop) continue;

      const updateFields: any = { optimo_order_no: update.identifier };
      if ((stop.stop_number ?? stop.stopNumber) == null && update.stopNumber != null) {
        updateFields.stop_number = update.stopNumber;
      }
      if (!(stop.scheduled_at ?? stop.scheduledAt) && update.scheduledAt) {
        updateFields.scheduled_at = update.scheduledAt;
      }

      await storage.updateRouteStop(update.stopId, updateFields);
      stop.optimo_order_no = update.identifier;
      if (stop.optimoOrderNo == null) stop.optimoOrderNo = update.identifier;
      if ((stop.stop_number ?? stop.stopNumber) == null && update.stopNumber != null) {
        stop.stop_number = update.stopNumber;
        stop.stopNumber = update.stopNumber;
      }
      if (!(stop.scheduled_at ?? stop.scheduledAt) && update.scheduledAt) {
        stop.scheduled_at = update.scheduledAt;
        stop.scheduledAt = update.scheduledAt;
      }
    }

    return updates.length;
  };

  app.get('/api/admin/customers', requireAdmin, async (req: Request, res: Response) => {
    try {
      const options = {
        search: (req.query.search as string) || '',
        sortBy: (req.query.sortBy as string) || 'created_at',
        sortDir: (req.query.sortDir as string) || 'desc',
        serviceType: (req.query.serviceType as string) || '',
        hasStripe: (req.query.hasStripe as string) || '',
        limit: Math.min(parseInt(req.query.limit as string) || 50, 500),
        offset: Math.max(parseInt(req.query.offset as string) || 0, 0),
      };

      const { users, total } = await storage.getAllUsersPaginated(options);

      const customers = users.map((u: any) => ({
        id: u.id,
        name: `${u.first_name} ${u.last_name}`,
        email: u.email,
        phone: u.phone,
        memberSince: u.member_since,
        stripeCustomerId: u.stripe_customer_id,
        isAdmin: u.is_admin,
        createdAt: u.created_at,
        locationCount: parseInt(u.property_count || '0'),
      }));

      res.json({ customers, total, limit: options.limit, offset: options.offset });
    } catch (error) {
      console.error('Admin customers error:', error);
      res.status(500).json({ error: 'Failed to fetch customers' });
    }
  });

  app.get('/api/admin/customers/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserById(req.params.id as string);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const locations = await storage.getLocationsForUser(user.id);

      let stripeData = null;
      if (user.stripe_customer_id) {
        try {
          const stripe = await getUncachableStripeClient();
          const [customer, subscriptions, invoices, paymentMethods] = await Promise.all([
            stripe.customers.retrieve(user.stripe_customer_id),
            stripe.subscriptions.list({ customer: user.stripe_customer_id }),
            stripe.invoices.list({ customer: user.stripe_customer_id, limit: 10 }),
            stripe.paymentMethods.list({ customer: user.stripe_customer_id, type: 'card' }),
          ]);

          const safeDate = (ts: any) => {
            try {
              if (!ts || typeof ts !== 'number') return null;
              return new Date(ts * 1000).toISOString();
            } catch { return null; }
          };

          stripeData = {
            balance: typeof (customer as any).balance === 'number' ? (customer as any).balance / 100 : 0,
            subscriptions: subscriptions.data.map((s: any) => ({
              id: s.id,
              status: s.status,
              currentPeriodEnd: safeDate(s.current_period_end),
              items: (s.items?.data || []).map((i: any) => ({
                priceId: i.price?.id,
                productName: i.price?.nickname || i.price?.id,
                amount: (i.price?.unit_amount || 0) / 100,
                interval: i.price?.recurring?.interval,
              })),
            })),
            invoices: invoices.data.map((inv: any) => ({
              id: inv.id,
              number: inv.number,
              amount: (inv.amount_due || inv.total || 0) / 100,
              status: inv.status,
              created: safeDate(inv.created),
            })),
            paymentMethods: paymentMethods.data.map((pm: any) => ({
              id: pm.id,
              brand: pm.card?.brand,
              last4: pm.card?.last4,
              expMonth: pm.card?.exp_month,
              expYear: pm.card?.exp_year,
            })),
          };
        } catch (e) {
          console.error('Error fetching Stripe data for customer:', e);
        }
      }

      res.json({
        id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        memberSince: user.member_since,
        stripeCustomerId: user.stripe_customer_id,
        isAdmin: user.is_admin,
        createdAt: user.created_at,
        locations: locations.map(p => ({
          id: p.id,
          address: p.address,
          serviceType: p.service_type,
          transferStatus: p.transfer_status,
        })),
        stripe: stripeData,
      });
    } catch (error) {
      console.error('Admin customer detail error:', error);
      res.status(500).json({ error: 'Failed to fetch customer details' });
    }
  });

  app.get('/api/admin/locations', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { search, status, collectionDay, page, limit } = req.query;
      const { rows: locations, total } = await storage.getLocationsPaginated({
        search: search as string | undefined,
        status: status as string | undefined,
        pickupDay: collectionDay as string | undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 50,
      });
      res.json({
        locations: locations.map(p => ({
          id: p.id,
          address: p.address,
          serviceType: p.service_type,
          serviceStatus: p.service_status,
          ownerName: p.user_name,
          ownerEmail: p.user_email,
          collectionDay: p.collection_day,
          collectionFrequency: p.collection_frequency,
          latitude: p.latitude,
          longitude: p.longitude,
          collectionDaySource: p.collection_day_source || null,
          coverageZoneId: p.coverage_flagged_by_zone || null,
          createdAt: p.created_at,
        })),
        total,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 50,
      });
    } catch (error) {
      console.error('Admin locations error:', error);
      res.status(500).json({ error: 'Failed to fetch locations' });
    }
  });

  // ── Location Admin Overrides ──

  app.put('/api/admin/locations/:locationId/assign-zone', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { locationId } = req.params;
      const { zoneId } = req.body;
      if (!zoneId) return res.status(400).json({ error: 'zoneId is required' });

      const locResult = await storage.query('SELECT id FROM locations WHERE id = $1', [locationId]);
      if (locResult.rows.length === 0) return res.status(404).json({ error: 'Location not found' });

      const zone = await storage.getZoneById(zoneId);
      if (!zone) return res.status(404).json({ error: 'Zone not found' });

      await storage.query(
        `UPDATE locations SET coverage_flagged_by_zone = $1, coverage_flagged_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [zoneId, locationId]
      );

      await audit(req, 'admin_assign_zone', 'location', locationId, { zoneId, zoneName: zone.name, driverName: zone.driver_name });
      res.json({ success: true, zoneId, zoneName: zone.name, driverName: zone.driver_name });
    } catch (error) {
      console.error('Assign zone error:', error);
      res.status(500).json({ error: 'Failed to assign zone' });
    }
  });

  app.put('/api/admin/locations/:locationId/collection-day', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { locationId } = req.params;
      const { collectionDay } = req.body;
      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      if (!collectionDay || !validDays.includes(collectionDay)) {
        return res.status(400).json({ error: 'collectionDay must be a valid weekday' });
      }

      const locResult = await storage.query('SELECT id, collection_day FROM locations WHERE id = $1', [locationId]);
      if (locResult.rows.length === 0) return res.status(404).json({ error: 'Location not found' });

      const previousDay = locResult.rows[0].collection_day;
      await storage.query(
        `UPDATE locations SET collection_day = $1, collection_day_source = 'admin_override', collection_day_detected_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [collectionDay, locationId]
      );

      await audit(req, 'admin_override_collection_day', 'location', locationId, { previousDay, newDay: collectionDay });
      res.json({ success: true, collectionDay });
    } catch (error) {
      console.error('Collection day override error:', error);
      res.status(500).json({ error: 'Failed to update collection day' });
    }
  });

  app.get('/api/admin/activity', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [recentUsers, recentOnDemand, recentReferrals] = await Promise.all([
        storage.query(`SELECT id, first_name, last_name, email, created_at FROM users ORDER BY created_at DESC LIMIT 10`),
        storage.query(`SELECT odr.*, u.first_name || ' ' || u.last_name as user_name FROM on_demand_requests odr LEFT JOIN users u ON odr.user_id = u.id ORDER BY odr.created_at DESC LIMIT 10`),
        storage.query(`SELECT r.*, u.first_name || ' ' || u.last_name as referrer_name FROM referrals r LEFT JOIN users u ON r.referrer_user_id = u.id ORDER BY r.created_at DESC LIMIT 10`),
      ]);

      res.json({
        recentSignups: recentUsers.rows.map(u => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
          email: u.email,
          date: u.created_at,
        })),
        recentPickups: recentOnDemand.rows.map(p => ({
          id: p.id,
          userName: p.user_name,
          serviceName: p.service_name,
          pickupDate: p.requested_date,
          status: p.status,
          date: p.created_at,
        })),
        recentReferrals: recentReferrals.rows.map(r => ({
          id: r.id,
          referrerName: r.referrer_name,
          referredEmail: r.referred_email,
          status: r.status,
          date: r.created_at,
        })),
      });
    } catch (error) {
      console.error('Admin activity error:', error);
      res.status(500).json({ error: 'Failed to fetch activity' });
    }
  });

  // Edit customer details
  app.put('/api/admin/customers/:id', requireAdmin, requirePermission('customers'), async (req: Request, res: Response) => {
    try {
      const { firstName, lastName, phone, email, isAdmin } = req.body;
      const user = await storage.getUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const updateData: any = {};
      if (firstName !== undefined) updateData.first_name = firstName;
      if (lastName !== undefined) updateData.last_name = lastName;
      if (phone !== undefined) updateData.phone = phone;
      if (email !== undefined) {
        const existing = await storage.getUserByEmail(email);
        if (existing && existing.id !== req.params.id) {
          return res.status(409).json({ error: 'Email already in use by another account' });
        }
        updateData.email = email;
      }

      await storage.updateUserAdmin(req.params.id, updateData);
      if (isAdmin !== undefined) {
        await storage.setUserAdmin(req.params.id, isAdmin);
      }
      await audit(req, 'edit_customer', 'user', req.params.id, { ...updateData, isAdmin });
      res.json({ success: true });
    } catch (error) {
      console.error('Admin edit customer error:', error);
      res.status(500).json({ error: 'Failed to update customer' });
    }
  });

  // Customer notes
  app.get('/api/admin/customers/:id/notes', requireAdmin, async (req: Request, res: Response) => {
    try {
      const notes = await storage.getAdminNotes(req.params.id);
      res.json(notes.map((n: any) => ({
        id: n.id,
        note: n.note,
        tags: n.tags || [],
        adminName: `${n.admin_first_name} ${n.admin_last_name}`,
        createdAt: n.created_at,
      })));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch notes' });
    }
  });

  app.post('/api/admin/customers/:id/notes', requireAdmin, requirePermission('customers'), async (req: Request, res: Response) => {
    try {
      const { note, tags } = req.body;
      if (!note) return res.status(400).json({ error: 'Note is required' });
      await storage.createAdminNote(req.params.id, getAdminId(req), note, tags || []);
      await audit(req, 'add_note', 'user', req.params.id, { note: note.substring(0, 100) });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create note' });
    }
  });

  app.delete('/api/admin/notes/:noteId', requireAdmin, requirePermission('customers'), async (req: Request, res: Response) => {
    try {
      const noteId = parseInt(req.params.noteId, 10);
      if (isNaN(noteId)) return res.status(400).json({ error: 'Invalid note ID' });
      await storage.deleteAdminNote(noteId, getAdminId(req));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete note' });
    }
  });

  // Analytics
  app.get('/api/admin/analytics/signups', requireAdmin, async (req: Request, res: Response) => {
    try {
      const days = Math.min(parseInt(req.query.days as string) || 90, 365);
      const trends = await storage.getSignupTrends(days);
      res.json(trends);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch signup trends' });
    }
  });

  app.get('/api/admin/analytics/revenue', requireAdmin, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const months = Math.min(parseInt(req.query.months as string) || 6, 24);
      const now = new Date();
      const revenueData: { month: string; revenue: number }[] = [];

      for (let i = months - 1; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const transactions = await stripe.balanceTransactions.list({
          created: { gte: Math.floor(start.getTime() / 1000), lt: Math.floor(end.getTime() / 1000) },
          type: 'charge',
          limit: 100,
        });
        const total = transactions.data.reduce((sum: number, t: any) => sum + t.net, 0) / 100;
        revenueData.push({
          month: start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          revenue: total,
        });
      }
      res.json(revenueData);
    } catch (error) {
      console.error('Revenue analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch revenue data' });
    }
  });

  app.get('/api/admin/analytics/services', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getLocationStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch service stats' });
    }
  });

  // CSV Export
  app.get('/api/admin/export/customers', requireAdmin, async (req: Request, res: Response) => {
    try {
      const options = {
        search: (req.query.search as string) || '',
        serviceType: (req.query.serviceType as string) || '',
        hasStripe: (req.query.hasStripe as string) || '',
      };
      const users = await storage.getUsersForExport(options);
      const header = 'ID,First Name,Last Name,Email,Phone,Member Since,Stripe ID,Admin,Properties,Addresses,Created At\n';
      const rows = users.map((u: any) =>
        [u.id, u.first_name, u.last_name, u.email, u.phone || '', u.member_since || '', u.stripe_customer_id || '', u.is_admin, u.property_count, `"${(u.addresses || '').replace(/"/g, '""')}"`, u.created_at].join(',')
      ).join('\n');
      await audit(req, 'export_customers', 'system', undefined, { count: users.length });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=customers.csv');
      res.send(header + rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to export' });
    }
  });

  // Global Search
  app.get('/api/admin/search', requireAdmin, async (req: Request, res: Response) => {
    try {
      const query = (req.query.q as string) || '';
      if (!query || query.length < 2) return res.json({ users: [], locations: [] });
      const results = await storage.globalSearch(query);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: 'Failed to search' });
    }
  });

  // Audit Log
  app.get('/api/admin/audit-log', requireAdmin, async (req: Request, res: Response) => {
    try {
      const options = {
        limit: Math.min(parseInt(req.query.limit as string) || 50, 500),
        offset: Math.max(parseInt(req.query.offset as string) || 0, 0),
        adminId: (req.query.adminId as string) || undefined,
        action: (req.query.action as string) || undefined,
        entityType: (req.query.entityType as string) || undefined,
        entityId: (req.query.entityId as string) || undefined,
      };
      const result = await storage.getAuditLogs(options);
      res.json({
        logs: result.logs.map((l: any) => ({
          id: l.id,
          action: l.action,
          entityType: l.entity_type,
          entityId: l.entity_id,
          details: l.details,
          adminName: `${l.first_name} ${l.last_name}`,
          adminEmail: l.admin_email,
          createdAt: l.created_at,
        })),
        total: result.total,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch audit log' });
    }
  });

  // Missed Collection Reports
  app.get('/api/admin/missed-collections', requireAdmin, async (req: Request, res: Response) => {
    try {
      const statusParam = req.query.status as string | undefined;
      const options = {
        status: statusParam && statusParam !== 'all' ? statusParam : undefined,
        limit: Math.min(parseInt(req.query.limit as string) || 50, 500),
        offset: Math.max(parseInt(req.query.offset as string) || 0, 0),
      };
      const result = await storage.getMissedCollectionReportsAdmin(options);
      res.json({
        reports: result.reports.map((r: any) => ({
          id: r.id,
          locationId: r.location_id,
          customerName: `${r.first_name} ${r.last_name}`,
          customerEmail: r.email,
          address: r.address,
          collectionDate: r.collection_date,
          notes: r.notes,
          status: r.status,
          resolutionNotes: r.resolution_notes,
          createdAt: r.created_at,
        })),
        total: result.total,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch missed collections' });
    }
  });

  app.put('/api/admin/missed-collections/:id', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { status, resolutionNotes, scheduleRedo } = req.body;
      await storage.updateMissedCollectionStatus(req.params.id, status, resolutionNotes);

      // Track who resolved it and when (US-16)
      if (status === 'resolved') {
        await pool.query(
          `UPDATE missed_collection_reports SET resolved_by = $1, resolved_at = NOW() WHERE id = $2`,
          [(req.session as any).userId, req.params.id]
        );
      }

      await audit(req, 'resolve_missed_collection', 'missed_collection', req.params.id, { status, resolutionNotes, scheduleRedo });

      const report = await storage.query(
        `SELECT mcr.location_id, mcr.address, mcr.collection_date, p.user_id FROM missed_collection_reports mcr LEFT JOIN locations p ON mcr.location_id = p.id WHERE mcr.id = $1`,
        [req.params.id]
      );
      const row = report.rows[0];

      // Schedule a redo stop on the next available route for this location
      let redoDate: string | undefined;
      if (status === 'resolved' && scheduleRedo && row?.location_id) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        // Try to find a route in the same zone first (US-10)
        const locZone = await storage.query(`SELECT zone_id FROM locations WHERE id = $1`, [row.location_id]);
        let nextRoute;
        if (locZone.rows[0]?.zone_id) {
          nextRoute = await storage.query(
            `SELECT r.id, r.scheduled_date FROM routes r
             JOIN route_contracts rc ON r.contract_id = rc.id
             WHERE r.scheduled_date >= $1 AND r.status IN ('draft', 'open', 'assigned')
               AND rc.zone_id = $2
             ORDER BY r.scheduled_date LIMIT 1`,
            [tomorrowStr, locZone.rows[0].zone_id]
          );
        }
        // Fallback to any available route
        if (!nextRoute || nextRoute.rows.length === 0) {
          nextRoute = await storage.query(
            `SELECT id, scheduled_date FROM routes WHERE scheduled_date >= $1 AND status IN ('draft', 'open', 'assigned') ORDER BY scheduled_date LIMIT 1`,
            [tomorrowStr]
          );
        }
        if (nextRoute.rows.length > 0) {
          const routeId = nextRoute.rows[0].id;
          redoDate = nextRoute.rows[0].scheduled_date?.split('T')[0];
          await storage.query(
            `INSERT INTO route_stops (route_id, location_id, order_type, status, notes, address)
             VALUES ($1, $2, 'missed_redo', 'pending', $3, $4)`,
            [routeId, row.location_id, `Redo for missed collection on ${row.collection_date}`, row.address]
          );
        }
      }

      // Notify customer when resolved
      if (status === 'resolved' && resolutionNotes && row?.user_id) {
        sendMissedCollectionResolution(row.user_id, row.address || 'your location', resolutionNotes, redoDate).catch(() => {});
      }

      res.json({ success: true, redoScheduled: !!redoDate, redoDate });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update missed collection' });
    }
  });

  // On-Demand Requests (Schedule Overview)
  app.get('/api/admin/on-demand', requireAdmin, async (req: Request, res: Response) => {
    try {
      const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : undefined;
      const options = {
        status: rawStatus && rawStatus !== 'all' ? rawStatus : undefined,
        limit: Math.min(parseInt(req.query.limit as string) || 50, 500),
        offset: Math.max(parseInt(req.query.offset as string) || 0, 0),
      };
      const result = await storage.getOnDemandRequestsAdmin(options);
      res.json({
        requests: result.requests.map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          customerName: `${r.first_name} ${r.last_name}`,
          customerEmail: r.email,
          address: r.address,
          serviceName: r.service_name,
          servicePrice: r.service_price,
          pickupDate: r.requested_date,
          status: r.status,
          notes: r.notes,
          photos: r.photos || [],
          aiEstimate: r.ai_estimate,
          aiReasoning: r.ai_reasoning,
          adminNotes: r.admin_notes,
          assignedDriverId: r.assigned_driver_id,
          cancellationReason: r.cancellation_reason,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
        total: result.total,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch on-demand requests' });
    }
  });

  // Get single on-demand request detail
  app.get('/api/admin/on-demand/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const record = await storage.getOnDemandRequestById(req.params.id);
      if (!record) return res.status(404).json({ error: 'On-demand request not found' });
      res.json({
        id: record.id,
        userId: record.user_id,
        customerName: `${record.first_name} ${record.last_name}`,
        customerEmail: record.email,
        customerPhone: record.phone,
        address: record.address,
        serviceName: record.service_name,
        servicePrice: record.service_price,
        pickupDate: record.requested_date,
        status: record.status,
        notes: record.notes,
        photos: record.photos || [],
        aiEstimate: record.ai_estimate,
        aiReasoning: record.ai_reasoning,
        adminNotes: record.admin_notes,
        assignedDriverId: record.assigned_driver_id,
        cancellationReason: record.cancellation_reason,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch on-demand request' });
    }
  });

  // Update On-Demand Request (status, notes, driver, price, date)
  app.put('/api/admin/on-demand/:id', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, adminNotes, assignedDriverId, pickupDate, servicePrice } = req.body;

      if (status) {
        const validStatuses = ['pending', 'scheduled', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
        }
      }

      // Fetch existing record for notifications
      const existing = await storage.getOnDemandRequestById(id);
      if (!existing) {
        return res.status(404).json({ error: 'On-demand request not found' });
      }

      // Validate status transitions (US-15)
      if (status && status !== existing.status) {
        const validTransitions: Record<string, string[]> = {
          pending: ['scheduled', 'cancelled'],
          scheduled: ['completed', 'cancelled'],
          completed: [],
          cancelled: [],
        };
        const allowed = validTransitions[existing.status] || [];
        if (!allowed.includes(status)) {
          return res.status(400).json({ error: `Cannot transition from '${existing.status}' to '${status}'` });
        }
      }

      const updates: any = {};
      if (status !== undefined) updates.status = status;
      if (adminNotes !== undefined) updates.adminNotes = adminNotes;
      if (assignedDriverId !== undefined) updates.assignedDriverId = assignedDriverId || null;
      if (pickupDate !== undefined) updates.pickupDate = pickupDate;
      if (servicePrice !== undefined) updates.servicePrice = servicePrice;

      const updated = await storage.updateOnDemandRequest(id, updates);

      // Keep linked route stops aligned when admin force-updates terminal status.
      if (status === 'completed' || status === 'cancelled') {
        const stopStatus = status;
        await pool.query(
          `UPDATE route_stops rs
           SET status = $1
           FROM routes r
           WHERE rs.on_demand_request_id = $2
             AND rs.route_id = r.id
             AND COALESCE(r.status, '') != 'cancelled'
             AND rs.status NOT IN ('completed', 'failed', 'skipped', 'cancelled')`,
          [stopStatus, id]
        );
      }

      // Send customer notification on status change
      if (status && status !== existing.status) {
        const messages: Record<string, string> = {
          scheduled: `Your ${existing.service_name} request at ${existing.address} has been confirmed and scheduled for ${pickupDate || existing.requested_date}.`,
          completed: `Your ${existing.service_name} request at ${existing.address} has been completed. Thank you!`,
          cancelled: `Your ${existing.service_name} request at ${existing.address} has been cancelled.`,
        };
        if (messages[status]) {
          sendServiceUpdate(existing.user_id, `Request ${status.charAt(0).toUpperCase() + status.slice(1)}`, messages[status]).catch(e => console.error('On-demand status notification failed:', e));
        }
      }

      // Flag for billing review when cancelling a paid/invoiced request (US-2)
      if (status === 'cancelled' && existing.status !== 'cancelled') {
        console.warn(`[Billing] On-demand request ${id} cancelled — review for invoice voiding (service: ${existing.service_name}, price: $${existing.service_price})`);
        await audit(req, 'billing_flag_cancellation', 'on_demand_request', id, { serviceName: existing.service_name, servicePrice: existing.service_price });
      }

      // Update OptimoRoute if date changed
      if (pickupDate && pickupDate !== existing.requested_date) {
        try {
          const orderNo = `OD-${id.substring(0, 8).toUpperCase()}`;
          await optimo.updateOrder(orderNo, { date: pickupDate });
        } catch (e: any) {
          console.error('OptimoRoute date update failed (non-blocking):', e.message);
        }
      }

      await audit(req, 'update_on_demand_request', 'on_demand_request', id, { status, adminNotes, assignedDriverId, pickupDate, servicePrice });

      // Real-time WebSocket broadcasts
      if (assignedDriverId) {
        broadcastToDriver(assignedDriverId, 'ondemand:assigned', { requestId: id, status: status || existing.status });
      }
      if (status && status !== existing.status) {
        broadcastToUser(existing.user_id, 'ondemand:updated', { requestId: id, status });
        broadcastToAdmins('ondemand:updated', { requestId: id, status });
      }

      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update on-demand request' });
    }
  });

  // Routes
  app.get('/api/admin/routes', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { route_type, status, date_from, date_to } = req.query;
      const routes = await storage.getAllRoutes({
        route_type: route_type as string | undefined,
        status: status as string | undefined,
        date_from: date_from as string | undefined,
        date_to: date_to as string | undefined,
      });
      res.json({ routes: routes.map(formatRouteForClient) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch routes' });
    }
  });

  app.get('/api/admin/routes/:id/bids', requireAdmin, async (req: Request, res: Response) => {
    try {
      const bids = await storage.getRouteBids(req.params.id as string);
      res.json({
        bids: bids.map((b: any) => ({
          id: b.id,
          driverId: b.driver_id,
          driverName: b.driver_name,
          driverRating: b.driver_rating ? Number(b.driver_rating) : null,
          bidAmount: Number(b.bid_amount),
          message: b.message,
          driverRatingAtBid: b.driver_rating_at_bid ? Number(b.driver_rating_at_bid) : null,
          createdAt: b.created_at,
        })),
      });
    } catch (error) {
      console.error('Failed to fetch route bids:', error);
      res.status(500).json({ error: 'Failed to fetch bids' });
    }
  });

  app.post('/api/admin/routes', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { title, scheduled_date, ...rest } = req.body;
      if (!title || !scheduled_date) {
        return res.status(400).json({ error: 'title and scheduled_date are required' });
      }
      const route = await storage.createRoute({ title, scheduled_date, ...rest });
      await audit(req, 'create_route', 'route', route.id, { title, scheduled_date });
      res.status(201).json({ route: formatRouteForClient(route) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create route' });
    }
  });

  app.put('/api/admin/routes/:id', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const routeId = req.params.id as string;
      const existing = await storage.getRouteById(routeId);
      if (!existing) {
        return res.status(404).json({ error: 'Route not found' });
      }
      const { title: reqTitle, description, scheduled_date: reqDate, start_time, end_time, estimated_stops, estimated_hours, base_pay, status, assigned_driver_id, notes, route_type, accepted_bid_id, actual_pay, payment_status } = req.body;
      const title = reqTitle || existing.title;
      const scheduled_date = reqDate || existing.scheduled_date;
      if (!title || !scheduled_date) {
        return res.status(400).json({ error: 'title and scheduled_date are required' });
      }

      // Enforce route lifecycle: prevent invalid status jumps (e.g. draft→completed)
      if (status && status !== existing.status) {
        const VALID_TRANSITIONS: Record<string, string[]> = {
          draft: ['open', 'cancelled'],
          open: ['assigned', 'cancelled'],
          bidding: ['assigned', 'cancelled'],
          assigned: ['in_progress', 'open', 'cancelled'],
          in_progress: ['completed', 'assigned', 'cancelled'],
          completed: ['assigned'],  // allow reopening
          cancelled: ['draft'],  // can reopen as draft
        };
        const allowed = VALID_TRANSITIONS[existing.status] || [];
        if (!allowed.includes(status)) {
          return res.status(400).json({
            error: `Cannot transition from "${existing.status}" to "${status}". Allowed: ${allowed.join(', ') || 'none'}`,
          });
        }
      }

      // Auto-detect out-of-sync: if route was synced to OptimoRoute and is now
      // being edited, flag it as out of sync so the admin knows to re-sync.
      const markOutOfSync = existing.optimo_synced && status !== 'cancelled';

      const updated = await storage.updateRoute(routeId, {
        title, description, scheduled_date, start_time, end_time,
        estimated_stops, estimated_hours, base_pay, status, assigned_driver_id, notes,
        route_type, accepted_bid_id, actual_pay, payment_status,
        ...(markOutOfSync ? { optimo_synced: false } : {}),
      });
      let linkedOnDemandSynced = 0;
      if (assigned_driver_id !== undefined) {
        const syncResult = await pool.query(
          `UPDATE on_demand_requests odr
           SET assigned_driver_id = $1,
               status = CASE WHEN $1 IS NOT NULL AND odr.status = 'pending' THEN 'scheduled' ELSE odr.status END,
               updated_at = NOW()
           WHERE odr.id IN (
             SELECT DISTINCT rs.on_demand_request_id
             FROM route_stops rs
             WHERE rs.route_id = $2 AND rs.on_demand_request_id IS NOT NULL
           )
             AND odr.status IN ('pending', 'scheduled')`,
          [assigned_driver_id || null, routeId]
        );
        linkedOnDemandSynced = syncResult.rowCount || 0;
      }
      await audit(req, 'update_route', 'route', routeId, { ...req.body, linkedOnDemandSynced });

      // When a route is cancelled, cancel all non-terminal stops and notify affected customers
      if (status === 'cancelled' && existing.status !== 'cancelled') {
        try {
          // Get affected stops before cancelling (to notify customers)
          const affectedStops = await storage.query(
            `SELECT rs.location_id, p.user_id, p.address, r.scheduled_date
             FROM route_stops rs
             JOIN locations p ON rs.location_id = p.id
             JOIN routes r ON rs.route_id = r.id
             WHERE rs.route_id = $1 AND rs.status NOT IN ('completed', 'failed', 'skipped', 'cancelled')`,
            [routeId]
          );
          await storage.query(
            `UPDATE route_stops SET status = 'cancelled' WHERE route_id = $1 AND status NOT IN ('completed', 'failed', 'skipped')`,
            [routeId]
          );
          // Notify unique customers
          const notified = new Set<string>();
          for (const stop of affectedStops.rows) {
            if (stop.user_id && !notified.has(stop.user_id)) {
              notified.add(stop.user_id);
              sendRouteCancelNotification(stop.user_id, stop.address, existing.scheduled_date?.split('T')[0] || '').catch(() => {});
            }
          }
        } catch (e) {
          console.error('Failed to cancel route stops:', e);
        }
      }

      // Auto-sync driver pay expense when route is marked completed
      if (status === 'completed' && existing.status !== 'completed' && base_pay && parseFloat(base_pay) > 0) {
        try {
          await expenseRepo.create({
            category: 'driver_pay',
            description: `Driver pay for: ${title}`,
            amount: parseFloat(base_pay),
            expenseDate: scheduled_date || new Date().toISOString().split('T')[0],
            referenceId: routeId,
            referenceType: 'route_job',
            createdBy: getAdminId(req),
          });
        } catch (e) {
          console.error('Failed to auto-sync driver pay expense:', e);
        }
      }

      res.json({ route: formatRouteForClient(updated) });
    } catch (error) {
      console.error('Failed to update route:', error);
      res.status(500).json({ error: 'Failed to update route' });
    }
  });

  // Route Stops
  app.get('/api/admin/routes/:id/stops', requireAdmin, async (req: Request, res: Response) => {
    try {
      const stops = await storage.getRouteStops(req.params.id as string);
      res.json({ stops });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch route stops' });
    }
  });

  app.post('/api/admin/routes/:id/stops', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const routeId = req.params.id as string;
      const { locationIds, onDemandIds, missedRedoLocationIds } = req.body;
      const stops: Array<{ location_id: string; order_type?: string; on_demand_request_id?: string }> = [];
      if (locationIds?.length) {
        for (const pid of locationIds) {
          stops.push({ location_id: pid, order_type: 'recurring' });
        }
      }
      if (onDemandIds?.length) {
        for (const spId of onDemandIds) {
          const sp = await storage.getOnDemandRequestById(spId);
          if (sp) {
            stops.push({ location_id: sp.location_id, order_type: 'on_demand', on_demand_request_id: spId });
          }
        }
      }
      if (missedRedoLocationIds?.length) {
        for (const pid of missedRedoLocationIds) {
          stops.push({ location_id: pid, order_type: 'missed_redo' });
        }
      }
      const added = await storage.addRouteStops(routeId, stops);
      await audit(req, 'add_route_stops', 'route', routeId, { count: added.length });
      res.json({ stops: added });
    } catch (error) {
      console.error('Failed to add route stops:', error);
      res.status(500).json({ error: 'Failed to add stops' });
    }
  });

  app.delete('/api/admin/routes/:id/stops/:stopId', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const routeId = req.params.id as string;
      const stopId = req.params.stopId as string;
      await storage.removeRouteStop(stopId);
      await audit(req, 'remove_route_stop', 'route', routeId, { stopId });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove stop' });
    }
  });

  // Split an over-capacity route into chunks of maxStops
  app.post('/api/admin/routes/:id/split', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const routeId = req.params.id as string;
      const maxStops = parseInt(req.body.maxStops || process.env.ROUTE_MAX_STOPS || '50', 10);

      const route = await storage.getRouteById(routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });
      if (route.status !== 'draft') return res.status(400).json({ error: 'Only draft routes can be split' });

      const stops = await storage.getRouteStops(routeId);
      if (stops.length <= maxStops) return res.status(400).json({ error: 'Route does not exceed capacity' });

      // Chunk stops beyond maxStops into new routes
      const chunks: typeof stops[] = [];
      for (let c = 0; c < stops.length; c += maxStops) {
        chunks.push(stops.slice(c, c + maxStops));
      }

      // Keep first chunk in original route, create new routes for the rest
      const newRoutes: any[] = [];
      for (let i = 1; i < chunks.length; i++) {
        const suffix = ` (${String.fromCharCode(65 + i)})`;
        const baseTitle = route.title.replace(/ \([A-Z]\)$/, '');
        const newRoute = await storage.createRoute({
          title: `${baseTitle}${suffix}`,
          scheduled_date: route.scheduled_date,
          start_time: route.start_time ?? undefined,
          end_time: route.end_time ?? undefined,
          estimated_stops: chunks[i].length,
          route_type: route.route_type ?? 'daily_route',
          source: 'split',
          status: 'draft',
        });

        await storage.addRouteStops(
          newRoute.id,
          chunks[i].map((s: any) => ({
            location_id: s.location_id,
            order_type: s.order_type,
            on_demand_request_id: s.on_demand_request_id,
          }))
        );

        // Remove these stops from original route
        for (const s of chunks[i]) {
          await storage.removeRouteStop(s.id);
        }

        newRoutes.push(newRoute);
      }

      // Rename original if multiple chunks
      if (chunks.length > 1) {
        const baseTitle = route.title.replace(/ \([A-Z]\)$/, '');
        await storage.updateRoute(routeId, { title: `${baseTitle} (A)`, estimated_stops: chunks[0].length });
      }

      await audit(req, 'split_route', 'route', routeId, { newRouteCount: newRoutes.length, maxStops });
      res.json({ originalRouteId: routeId, newRoutes: newRoutes.map(formatRouteForClient), totalRoutes: chunks.length });
    } catch (error) {
      console.error('Failed to split route:', error);
      res.status(500).json({ error: 'Failed to split route' });
    }
  });

  // Delete a route (only draft/open routes that haven't been synced)
  app.delete('/api/admin/routes/:id', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const routeId = req.params.id as string;
      const route = await storage.getRouteById(routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });
      if (!['draft', 'open'].includes(route.status)) {
        return res.status(400).json({ error: 'Only draft or open routes can be deleted' });
      }

      // Remove all stops first, then the route itself
      const stops = await storage.getRouteStops(routeId);
      for (const s of stops) {
        await storage.removeRouteStop(s.id);
      }
      await storage.deleteRoute(routeId);
      await audit(req, 'delete_route', 'route', routeId, { title: route.title });
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete route:', error);
      res.status(500).json({ error: 'Failed to delete route' });
    }
  });

  // Route Actions
  app.post('/api/admin/routes/:id/publish', requireAdmin, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.id as string;
      const route = await storage.getRouteById(routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });
      if (route.status !== 'draft') return res.status(400).json({ error: 'Only draft routes can be published' });
      const updated = await storage.updateRoute(routeId, { status: 'open' });
      await audit(req, 'publish_route', 'route', routeId, {});
      res.json({ route: formatRouteForClient(updated) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to publish route' });
    }
  });

  app.post('/api/admin/routes/:id/assign', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const routeId = req.params.id as string;
      const { driverId, bidId, actualPay } = req.body;
      if (!driverId) return res.status(400).json({ error: 'driverId is required' });
      const route = await storage.getRouteById(routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });
      if (!['open', 'bidding'].includes(route.status)) {
        return res.status(400).json({ error: `Cannot assign route with status '${route.status}'. Route must be open or bidding.` });
      }
      const updated = await storage.updateRoute(routeId, {
        status: 'assigned',
        assigned_driver_id: driverId,
        accepted_bid_id: bidId || undefined,
        actual_pay: actualPay || route.base_pay,
      });

      // Keep on-demand assignments in sync when route contains linked on-demand stops.
      const syncResult = await pool.query(
        `UPDATE on_demand_requests odr
         SET assigned_driver_id = $1,
             status = CASE WHEN odr.status = 'pending' THEN 'scheduled' ELSE odr.status END,
             updated_at = NOW()
         WHERE odr.id IN (
           SELECT DISTINCT rs.on_demand_request_id
           FROM route_stops rs
           WHERE rs.route_id = $2 AND rs.on_demand_request_id IS NOT NULL
         )
           AND odr.status IN ('pending', 'scheduled')`,
        [driverId, routeId]
      );
      const linkedOnDemandSynced = syncResult.rowCount || 0;
      await audit(req, 'assign_route', 'route', routeId, { driverId, bidId, actualPay, linkedOnDemandSynced });

      // Update bid statuses: accept winning bid, reject others
      if (bidId) {
        await pool.query(`UPDATE route_bids SET status = 'accepted' WHERE id = $1`, [bidId]);
      }
      await pool.query(
        `UPDATE route_bids SET status = 'rejected' WHERE route_id = $1 AND driver_id != $2 AND (status IS NULL OR status = 'pending')`,
        [routeId, driverId]
      );

      // Notify driver of assignment
      const pay = actualPay || route.base_pay;
      const stopCount = route.stop_count || route.estimated_stops || 0;
      sendDriverNotification(driverId, `Route Assigned: ${route.title}`, `
        <p style="color:#4b5563;line-height:1.6;">You have been assigned a new route:</p>
        <div style="background:#f0fdfa;border-left:4px solid #0d9488;padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0;">
          <p style="margin:0;color:#0d9488;font-weight:700;font-size:16px;">${route.title}</p>
          <p style="margin:4px 0 0;color:#6b7280;font-size:14px;">Date: ${route.scheduled_date?.split('T')[0] || 'TBD'}</p>
          ${stopCount ? `<p style="margin:4px 0 0;color:#6b7280;font-size:14px;">Stops: ${stopCount}</p>` : ''}
          ${pay ? `<p style="margin:4px 0 0;color:#6b7280;font-size:14px;">Pay: $${Number(pay).toFixed(2)}</p>` : ''}
        </div>
        <p style="color:#4b5563;line-height:1.6;">Log in to the team portal to view details and start your route.</p>
      `).catch(err => console.error('Failed to notify driver of assignment:', err));

      // Notify losing bidders
      storage.getRouteBids(routeId).then(bids => {
        for (const bid of bids) {
          if (bid.driver_id !== driverId) {
            sendDriverNotification(bid.driver_id, `Bid Update: ${route.title}`, `
              <p style="color:#4b5563;line-height:1.6;">Your bid on <strong>${route.title}</strong> was not selected. The route has been assigned to another driver.</p>
              <p style="color:#4b5563;line-height:1.6;">Check the team portal for other available routes.</p>
            `).catch(() => {});
          }
        }
      }).catch(() => {});

      // Real-time WebSocket broadcasts
      broadcastToDriver(driverId, 'route:assigned', { routeId, title: route.title, scheduledDate: route.scheduled_date });
      broadcastToAdmins('route:updated', { routeId, status: 'assigned', driverId });
      if (route.zone_id) {
        broadcastToZoneDrivers(route.zone_id, 'route:claimed', { routeId }, driverId);
      }

      res.json({ route: formatRouteForClient(updated) });
    } catch (error) {
      console.error('Failed to assign route:', error);
      res.status(500).json({ error: 'Failed to assign route' });
    }
  });

  // GPS tracking: get driver's latest location
  app.get('/api/admin/drivers/:driverId/location', requireAdmin, async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT latitude, longitude, heading, speed, accuracy, recorded_at, route_id
         FROM driver_locations WHERE driver_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
        [req.params.driverId]
      );
      res.json({ data: result.rows[0] || null });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get driver location' });
    }
  });

  // GPS tracking: get location trail for a route
  app.get('/api/admin/routes/:id/track', requireAdmin, async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT latitude, longitude, heading, speed, accuracy, recorded_at
         FROM driver_locations WHERE route_id = $1 ORDER BY recorded_at ASC`,
        [req.params.id]
      );
      res.json({ data: result.rows });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get route track' });
    }
  });

  // GPS tracking: get all active driver positions (for live map)
  app.get('/api/admin/drivers/live-positions', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT DISTINCT ON (dl.driver_id)
           dl.driver_id, dl.latitude, dl.longitude, dl.heading, dl.speed, dl.recorded_at, dl.route_id,
           dp.name AS driver_name, r.title AS route_title, r.status AS route_status
         FROM driver_locations dl
         JOIN driver_profiles dp ON dp.id = dl.driver_id
         LEFT JOIN routes r ON r.id = dl.route_id
         WHERE dl.recorded_at > NOW() - INTERVAL '10 minutes'
         ORDER BY dl.driver_id, dl.recorded_at DESC`
      );
      res.json({ data: result.rows });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get live positions' });
    }
  });

  // Service Zones (used by Contracts, Opportunities, Compensation panels)
  app.get('/api/admin/service-zones', requireAdmin, requirePermission('operations'), async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`SELECT id, name FROM service_zones WHERE active = true ORDER BY name`);
      res.json({ zones: rows });
    } catch (error) {
      console.error('Error fetching service zones:', error);
      res.status(500).json({ error: 'Failed to fetch service zones' });
    }
  });

  // Surge pricing: current zone surge status
  app.get('/api/admin/surge-status', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const { getCurrentSurges } = await import('./surgePricingEngine');
      const surges = await getCurrentSurges();
      res.json({ data: surges });
    } catch (error) {
      console.error('Surge status error:', error);
      res.status(500).json({ error: 'Failed to get surge status' });
    }
  });

  // Demand clusters: view identified expansion opportunities
  app.get('/api/admin/demand-clusters', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT id, center_lat, center_lng, radius_miles, location_count, status, opportunity_id, created_at
         FROM demand_clusters ORDER BY created_at DESC LIMIT 50`
      );
      res.json({ data: result.rows });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get demand clusters' });
    }
  });

  // Surge pricing: manually trigger recalculation
  app.post('/api/admin/surge-recalculate', requireAdmin, requirePermission('operations'), async (_req: Request, res: Response) => {
    try {
      const { applySurgePricing } = await import('./surgePricingEngine');
      const result = await applySurgePricing();
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Surge recalculate error:', error);
      res.status(500).json({ error: 'Failed to recalculate surge pricing' });
    }
  });

  // Driver Zones (read-only aggregate of all driver-created zones)
  app.get('/api/admin/driver-zones', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const zones = await storage.getAllDriverCustomZones();
      res.json({ zones });
    } catch (error) {
      console.error('Failed to fetch driver zones:', error);
      res.status(500).json({ error: 'Failed to fetch driver zones' });
    }
  });

  // ── Zone Approval ──

  app.get('/api/admin/pending-zones', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const zones = await storage.getPendingApprovalZones();
      res.json({ zones });
    } catch (error) {
      console.error('Failed to fetch pending zones:', error);
      res.status(500).json({ error: 'Failed to fetch pending zones' });
    }
  });

  app.put('/api/admin/zones/:id/decision', requireAdmin, requirePermission('*'), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { decision, notes, pickup_day } = req.body;
      if (!decision || !['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: 'decision must be "approved" or "rejected"' });
      }

      const zone = await storage.getZoneById(id);
      if (!zone) return res.status(404).json({ error: 'Zone not found' });
      if (zone.status !== 'pending_approval') {
        return res.status(400).json({ error: `Zone is already ${zone.status}` });
      }

      const newStatus = decision === 'approved' ? 'active' : 'rejected';
      await storage.updateZoneStatus(id, newStatus);

      // Set pickup_day on approval if provided
      if (decision === 'approved' && pickup_day) {
        const VALID_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        if (VALID_DAYS.includes(pickup_day)) {
          await storage.adminUpdateZone(id, { pickup_day });
        }
      }

      await audit(req, `zone_${decision}`, 'driver_custom_zones', id, { zone_name: zone.name, driver_name: zone.driver_name, notes, pickup_day });

      // Notify via Slack
      const adminUser = await storage.getUserById(getAdminId(req));
      const adminName = adminUser ? `${adminUser.first_name} ${adminUser.last_name}` : undefined;
      notifyZoneDecision(zone.name, zone.driver_name, decision, adminName).catch(() => {});

      // Auto-flag waitlisted locations on approval
      if (decision === 'approved' && process.env.WAITLIST_AUTO_FLAG_ENABLED !== 'false') {
        try {
          const matched = await storage.getWaitlistedLocationsInZone(zone);
          if (matched.length > 0) {
            const ids = matched.map((m: any) => m.id);
            await storage.flagWaitlistedLocations(ids, zone.id);
            // Also advance them into the review queue so they don't stay hidden in waitlist
            await pool.query(
              `UPDATE locations SET service_status = 'pending_review', zone_id = $1
               WHERE id = ANY($2::uuid[]) AND service_status = 'waitlist'`,
              [zone.id, ids]
            );
            notifyWaitlistFlagged(matched.length, zone.name, zone.driver_name).catch(() => {});
          }
          res.json({ success: true, decision, flaggedLocations: matched.length });
        } catch (flagErr) {
          console.error('[AutoFlag] Error during zone approval flagging:', flagErr);
          res.status(207).json({ success: true, decision, flaggedLocations: 0, warning: 'Zone approved but waitlist auto-flagging failed' });
        }
      } else {
        res.json({ success: true, decision });
      }
    } catch (error) {
      console.error('Zone decision error:', error);
      res.status(500).json({ error: 'Failed to process zone decision' });
    }
  });

  // Update zone properties (e.g., pickup_day)
  app.patch('/api/admin/zones/:id', requireAdmin, requirePermission('*'), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { pickup_day } = req.body;

      const zone = await storage.getZoneById(id);
      if (!zone) return res.status(404).json({ error: 'Zone not found' });

      const VALID_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      if (pickup_day !== null && pickup_day !== undefined && !VALID_DAYS.includes(pickup_day)) {
        return res.status(400).json({ error: 'pickup_day must be a weekday name (monday-saturday) or null' });
      }

      const updated = await storage.adminUpdateZone(id, {
        pickup_day: pickup_day === undefined ? undefined : pickup_day,
      });

      await audit(req, 'zone_updated', 'driver_custom_zones', id, {
        zone_name: zone.name, field: 'pickup_day',
        old_value: zone.pickup_day, new_value: pickup_day,
      });

      res.json({ success: true, zone: updated });
    } catch (error) {
      console.error('Zone update error:', error);
      res.status(500).json({ error: 'Failed to update zone' });
    }
  });

  // Bulk approve/reject zones
  app.post('/api/admin/zones/bulk-decision', requireAdmin, requirePermission('*'), async (req: Request, res: Response) => {
    try {
      const { zoneIds, decision, notes } = req.body;
      if (!Array.isArray(zoneIds) || zoneIds.length === 0) {
        return res.status(400).json({ error: 'zoneIds must be a non-empty array' });
      }
      if (!decision || !['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: 'decision must be "approved" or "rejected"' });
      }

      const adminUser = await storage.getUserById(getAdminId(req));
      const adminName = adminUser ? `${adminUser.first_name} ${adminUser.last_name}` : undefined;
      const results: { id: string; success: boolean; flaggedLocations?: number; error?: string }[] = [];

      for (const zoneId of zoneIds) {
        try {
          const zone = await storage.getZoneById(zoneId);
          if (!zone) { results.push({ id: zoneId, success: false, error: 'Not found' }); continue; }
          if (zone.status !== 'pending_approval') { results.push({ id: zoneId, success: false, error: `Already ${zone.status}` }); continue; }

          const newStatus = decision === 'approved' ? 'active' : 'rejected';
          await storage.updateZoneStatus(zoneId, newStatus);
          await audit(req, `zone_${decision}`, 'driver_custom_zones', zoneId, { zone_name: zone.name, driver_name: zone.driver_name, notes });
          notifyZoneDecision(zone.name, zone.driver_name, decision, adminName).catch(() => {});

          let flaggedLocations = 0;
          if (decision === 'approved' && process.env.WAITLIST_AUTO_FLAG_ENABLED !== 'false') {
            try {
              const matched = await storage.getWaitlistedLocationsInZone(zone);
              if (matched.length > 0) {
                const ids = matched.map((m: any) => m.id);
                await storage.flagWaitlistedLocations(ids, zone.id);
                await pool.query(
                  `UPDATE locations SET service_status = 'pending_review', zone_id = $1
                   WHERE id = ANY($2::uuid[]) AND service_status = 'waitlist'`,
                  [zone.id, ids]
                );
                notifyWaitlistFlagged(matched.length, zone.name, zone.driver_name).catch(() => {});
                flaggedLocations = matched.length;
              }
            } catch {}
          }
          results.push({ id: zoneId, success: true, flaggedLocations });
        } catch (e) {
          results.push({ id: zoneId, success: false, error: 'Processing failed' });
        }
      }
      res.json({ results });
    } catch (error) {
      console.error('Bulk zone decision error:', error);
      res.status(500).json({ error: 'Failed to process bulk zone decision' });
    }
  });

  // Admin delete a single zone
  app.delete('/api/admin/zones/:id', requireAdmin, requirePermission('*'), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const zone = await storage.getZoneById(id);
      if (!zone) return res.status(404).json({ error: 'Zone not found' });

      await storage.adminDeleteZone(id);
      await audit(req, 'zone_deleted', 'driver_custom_zones', id, { zone_name: zone.name, driver_name: zone.driver_name });
      res.json({ success: true });
    } catch (error) {
      console.error('Zone delete error:', error);
      res.status(500).json({ error: 'Failed to delete zone' });
    }
  });

  // ============================================================
  // Providers & Territories
  // ============================================================

  app.get('/api/admin/providers', requireAdmin, requirePermission('operations'), async (_req: Request, res: Response) => {
    try {
      const providers = await storage.getProviders();
      res.json({ providers });
    } catch (err: any) {
      console.error('Error fetching providers:', err);
      res.status(500).json({ error: 'Failed to fetch providers' });
    }
  });

  app.get('/api/admin/providers/:id', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
        const provider = await storage.getProviderById(req.params.id);
        if (!provider) {
            return res.status(404).json({ error: 'Provider not found' });
        }
        res.json({ provider });
    } catch (err: any) {
        console.error('Error fetching provider:', err);
        res.status(500).json({ error: 'Failed to fetch provider' });
    }
  });

  app.post('/api/admin/providers', requireAdmin, requirePermission('*'), async (req: Request, res: Response) => {
    try {
        const { name, ownerUserId } = req.body;
        if (!name || !ownerUserId) {
            return res.status(400).json({ error: 'name and ownerUserId are required' });
        }
        const provider = await storage.createProvider({ name, ownerUserId });
        await audit(req, 'create_provider', 'provider', provider.id, { name, ownerUserId });
        res.status(201).json({ provider });
    } catch (err: any) {
        console.error('Error creating provider:', err);
        res.status(500).json({ error: 'Failed to create provider' });
    }
  });

  app.put('/api/admin/providers/:id', requireAdmin, requirePermission('*'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, status } = req.body;
        const updatedProvider = await storage.updateProvider(id, { name, status });
        if (!updatedProvider) {
            return res.status(404).json({ error: 'Provider not found' });
        }
        await audit(req, 'update_provider', 'provider', id, { name, status });
        res.json({ provider: updatedProvider });
    } catch (err: any) {
        console.error('Error updating provider:', err);
        res.status(500).json({ error: 'Failed to update provider' });
    }
  });

  app.get('/api/admin/providers/:providerId/territories', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
        const { providerId } = req.params;
        const territories = await storage.getTerritoriesForProvider(providerId);
        res.json({ territories });
    } catch (err: any) {
        console.error('Error fetching territories:', err);
        res.status(500).json({ error: 'Failed to fetch territories' });
    }
  });

  app.post('/api/admin/providers/:providerId/territories', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { providerId } = req.params;
      const data = req.body;
      const territory = await storage.createProviderTerritory({ providerId, ...data });
      await audit(req, 'create_provider_territory', 'provider_territory', territory.id, { providerId, name: data.name });
      res.status(201).json({ territory });
    } catch (err: any) {
        console.error('Error creating provider territory:', err);
        res.status(500).json({ error: 'Failed to create territory' });
    }
  });

  app.put('/api/admin/territories/:id', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const updatedTerritory = await storage.updateProviderTerritory(id, data);
        if (!updatedTerritory) {
            return res.status(404).json({ error: 'Territory not found' });
        }
        await audit(req, 'update_provider_territory', 'provider_territory', id, data);
        res.json({ territory: updatedTerritory });
    } catch (err: any) {
        console.error('Error updating territory:', err);
        res.status(500).json({ error: 'Failed to update territory' });
    }
  });

  app.delete('/api/admin/territories/:id', requireAdmin, requirePermission('*'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const success = await storage.deleteProviderTerritory(id);
        if (!success) {
            return res.status(404).json({ error: 'Territory not found' });
        }
        await audit(req, 'delete_provider_territory', 'provider_territory', id);
        res.json({ success: true });
    } catch (err: any) {
        console.error('Error deleting territory:', err);
        res.status(500).json({ error: 'Failed to delete territory' });
    }
  });

  // --- Swaps ---

  app.post('/api/admin/swaps/generate', requireAdmin, requirePermission('*'), async (req, res) => {
    try {
      const { generateSwapRecommendations } = await import('./swapRecommendationService');
      const recommendations = await generateSwapRecommendations();
      await audit(req, 'generate_swaps', 'system', undefined, { count: recommendations.length });
      res.status(201).json({ recommendations });
    } catch (err: any) {
      console.error('Error generating swap recommendations:', err);
      res.status(500).json({ error: 'Failed to generate recommendations' });
    }
  });

  app.get('/api/admin/swaps/pending', requireAdmin, requirePermission('operations'), async (_req, res) => {
    try {
      const swaps = await storage.getPendingSwaps();
      res.json({ swaps });
    } catch (err: any) {
      console.error('Error fetching pending swaps:', err);
      res.status(500).json({ error: 'Failed to fetch pending swaps' });
    }
  });

  app.put('/api/admin/swaps/:id/decision', requireAdmin, requirePermission('*'), async (req, res) => {
    try {
      const { id } = req.params;
      const { decision } = req.body; // 'accepted' or 'rejected'
      if (!['accepted', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: 'Invalid decision' });
      }

      const updatedSwap = await storage.updateSwapStatus(id, decision, req.session.userId!);
      if (!updatedSwap) {
        return res.status(404).json({ error: 'Swap recommendation not found or already actioned' });
      }

      // If accepted, perform the location provider change
      if (decision === 'accepted') {
        await storage.updateLocation(updatedSwap.location_a_to_b_id, { provider_id: updatedSwap.provider_b_id });
        await storage.updateLocation(updatedSwap.location_b_to_a_id, { provider_id: updatedSwap.provider_a_id });
        
        // Notify customers
        try {
            const { sendProviderChangeNotification } = await import('./notificationService');
            const locA = await storage.getLocationById(updatedSwap.location_a_to_b_id);
            const locB = await storage.getLocationById(updatedSwap.location_b_to_a_id);
            const providerA = await storage.getProviderById(updatedSwap.provider_a_id);
            const providerB = await storage.getProviderById(updatedSwap.provider_b_id);

            if (locA && providerA && providerB) {
                sendProviderChangeNotification(locA.user_id, locA.address, providerA.name, providerB.name, locA.collection_day || 'their usual day');
            }
            if (locB && providerA && providerB) {
                sendProviderChangeNotification(locB.user_id, locB.address, providerB.name, providerA.name, locB.collection_day || 'their usual day');
            }
        } catch (notifyErr) {
            console.error('[Swap] Failed to send customer notifications:', notifyErr);
        }
      }

      await audit(req, `swap_${decision}`, 'swap_recommendation', id, {});
      res.json({ swap: updatedSwap });
    } catch (err: any) {
      console.error('Error actioning swap:', err);
      res.status(500).json({ error: 'Failed to action swap recommendation' });
    }
  });

  // Bulk delete zones
  app.post('/api/admin/zones/bulk-delete', requireAdmin, requirePermission('*'), async (req: Request, res: Response) => {
    try {
      const { zoneIds } = req.body;
      if (!Array.isArray(zoneIds) || zoneIds.length === 0) {
        return res.status(400).json({ error: 'zoneIds must be a non-empty array' });
      }

      // Validate all zones exist before deleting any
      const zones = await Promise.all(zoneIds.map((id: string) => storage.getZoneById(id)));
      const notFound = zoneIds.filter((_: string, i: number) => !zones[i]);
      if (notFound.length > 0) {
        return res.status(404).json({ error: `Zones not found: ${notFound.join(', ')}` });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const zoneId of zoneIds) {
          await client.query(`UPDATE locations SET zone_id = NULL WHERE zone_id = $1`, [zoneId]);
          await client.query(`DELETE FROM driver_custom_zones WHERE id = $1`, [zoneId]);
        }
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      for (let i = 0; i < zoneIds.length; i++) {
        await audit(req, 'zone_deleted', 'driver_custom_zones', zoneIds[i], { zone_name: zones[i].name, driver_name: zones[i].driver_name });
      }
      res.json({ results: zoneIds.map((id: string) => ({ id, success: true })) });
    } catch (error) {
      console.error('Bulk zone delete error:', error);
      res.status(500).json({ error: 'Failed to process bulk zone deletion' });
    }
  });

  // ── Zone Assignment Requests ──

  app.get('/api/admin/service-areas/locations', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { search, status, collectionDay, page, limit } = req.query;
      const { rows, total } = await storage.getLocationsGroupedByZone({
        search: search as string | undefined,
        status: status as string | undefined,
        collectionDay: collectionDay as string | undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 200,
      });
      res.json({ locations: rows, total, page: page ? parseInt(page as string, 10) : 1 });
    } catch (error) {
      console.error('Service areas locations error:', error);
      res.status(500).json({ error: 'Failed to fetch service area locations' });
    }
  });

  app.get('/api/admin/zone-assignment-requests', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status, zoneId, locationId } = req.query;
      const requests = await storage.getZoneAssignmentRequests({
        status: status as string | undefined,
        zoneId: zoneId as string | undefined,
        locationId: locationId as string | undefined,
      });
      res.json({ requests });
    } catch (error) {
      console.error('Get zone assignment requests error:', error);
      res.status(500).json({ error: 'Failed to fetch zone assignment requests' });
    }
  });

  app.post('/api/admin/zone-assignment-requests', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { locationId, zoneId } = req.body;
      if (!locationId || !zoneId) return res.status(400).json({ error: 'locationId and zoneId are required' });

      const zone = await storage.getZoneById(zoneId);
      if (!zone) return res.status(404).json({ error: 'Zone not found' });
      if (zone.status !== 'active') return res.status(400).json({ error: 'Zone must be active to receive assignments' });

      const locResult = await storage.query('SELECT id, address FROM locations WHERE id = $1', [locationId]);
      if (locResult.rows.length === 0) return res.status(404).json({ error: 'Location not found' });

      // Check for existing pending request for same location+zone
      const existing = await storage.getZoneAssignmentRequests({ status: 'pending', locationId, zoneId });
      if (existing.length > 0) return res.status(409).json({ error: 'A pending request already exists for this location and zone' });

      const deadlineHours = parseInt(process.env.ZONE_ASSIGNMENT_DEADLINE_HOURS || '72', 10);
      const adminId = (req.session as any).userId;
      const request = await storage.createZoneAssignmentRequest(locationId, zoneId, zone.driver_id, adminId, deadlineHours);

      // Notify driver in-app
      const driverProfile = await storage.getDriverById(zone.driver_id);
      if (driverProfile?.user_id) {
        await storage.createNotification(
          driverProfile.user_id,
          'zone_assignment_request',
          'New Location Assignment Request',
          `An admin has requested you add ${locResult.rows[0].address} to your zone "${zone.name}". Please respond within ${deadlineHours} hours.`
        );
      }

      // Email notification
      try {
        await sendDriverNotification(zone.driver_id, 'zone_assignment_request',
          `Location Assignment Request: ${locResult.rows[0].address}`,
          `An admin has requested you add ${locResult.rows[0].address} to your zone "${zone.name}". Please log in to approve or deny this request.`
        );
      } catch (emailErr) {
        console.warn('Failed to send zone assignment email:', emailErr);
      }

      await audit(req, 'zone_assignment_requested', 'zone_assignment_requests', request.id, {
        locationId, zoneId, zoneName: zone.name, driverName: zone.driver_name, address: locResult.rows[0].address
      });

      res.json({ success: true, request });
    } catch (error) {
      console.error('Create zone assignment request error:', error);
      res.status(500).json({ error: 'Failed to create zone assignment request' });
    }
  });

  app.delete('/api/admin/zone-assignment-requests/:id', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const cancelled = await storage.cancelZoneAssignmentRequest(req.params.id);
      if (!cancelled) return res.status(404).json({ error: 'Request not found or not pending' });
      await audit(req, 'zone_assignment_cancelled', 'zone_assignment_requests', req.params.id, {});
      res.json({ success: true });
    } catch (error) {
      console.error('Cancel zone assignment request error:', error);
      res.status(500).json({ error: 'Failed to cancel zone assignment request' });
    }
  });

  // ── Batch Auto-Assign Locations to Zones ──
  app.post('/api/admin/service-areas/auto-assign', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const adminId = (req.session as any).userId;
      const conflictStrategy = process.env.ZONE_AUTO_ASSIGN_CONFLICT_STRATEGY || 'skip';
      const deadlineHours = parseInt(process.env.ZONE_ASSIGNMENT_DEADLINE_HOURS || '72', 10);

      const unassigned = await storage.getUnassignedLocationsWithCoords();
      const results = {
        assigned: 0,
        skippedNoZone: 0,
        skippedConflict: 0,
        skippedExistingRequest: 0,
        errors: 0,
      };

      for (const loc of unassigned) {
        try {
          const matchingZones = await storage.findActiveZonesContainingPoint(
            Number(loc.latitude), Number(loc.longitude)
          );

          if (matchingZones.length === 0) {
            results.skippedNoZone++;
            continue;
          }

          let targetZone = matchingZones[0];

          if (matchingZones.length > 1) {
            switch (conflictStrategy) {
              case 'nearest_center': {
                let minDist = Infinity;
                let nearest = matchingZones[0];
                for (const zone of matchingZones) {
                  if (zone.center_lat == null || zone.center_lng == null) continue;
                  const R = 3958.8;
                  const dLat = (Number(loc.latitude) - zone.center_lat) * Math.PI / 180;
                  const dLng = (Number(loc.longitude) - zone.center_lng) * Math.PI / 180;
                  const a = Math.sin(dLat / 2) ** 2 +
                    Math.cos(zone.center_lat * Math.PI / 180) * Math.cos(Number(loc.latitude) * Math.PI / 180) *
                    Math.sin(dLng / 2) ** 2;
                  const dist = R * 2 * Math.asin(Math.sqrt(a));
                  if (dist < minDist) { minDist = dist; nearest = zone; }
                }
                targetZone = nearest;
                break;
              }
              case 'first_created':
                targetZone = matchingZones.sort((a, b) =>
                  new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                )[0];
                break;
              case 'skip':
              default:
                results.skippedConflict++;
                continue;
            }
          }

          // Check for existing pending request on this location
          const existing = await storage.getZoneAssignmentRequests({ status: 'pending', locationId: loc.id });
          if (existing.length > 0) {
            results.skippedExistingRequest++;
            continue;
          }

          await storage.createZoneAssignmentRequest(loc.id, targetZone.id, targetZone.driver_id, adminId, deadlineHours);

          // Notify driver in-app
          const driverProfile = await storage.getDriverById(targetZone.driver_id);
          if (driverProfile?.user_id) {
            await storage.createNotification(
              driverProfile.user_id,
              'zone_assignment_request',
              'New Location Assignment Request',
              `An admin has requested you add ${loc.address} to your zone "${targetZone.name}". Please respond within ${deadlineHours} hours.`
            );
          }

          // Email notification
          try {
            await sendDriverNotification(targetZone.driver_id, 'zone_assignment_request',
              `Location Assignment Request: ${loc.address}`,
              `An admin has requested you add ${loc.address} to your zone "${targetZone.name}". Please log in to approve or deny this request.`
            );
          } catch (emailErr) {
            console.warn('Failed to send zone assignment email:', emailErr);
          }

          results.assigned++;
        } catch (err) {
          console.error(`[AutoAssign] Error processing location ${loc.id}:`, err);
          results.errors++;
        }
      }

      await audit(req, 'zone_auto_assign_batch', 'locations', null, {
        total: unassigned.length, ...results, conflictStrategy
      });

      res.json({ success: true, results });
    } catch (error) {
      console.error('Auto-assign batch error:', error);
      res.status(500).json({ error: 'Failed to run auto-assignment' });
    }
  });

  // Planning
  // Exception dashboard — surfaces items requiring admin attention
  app.get('/api/admin/exceptions', requireAdmin, async (req: Request, res: Response) => {
    try {
      const [unmatchedOnDemand, escalatedMissed, expiredBids, failedAssignments, staleDraftRoutes] = await Promise.all([
        // On-demand requests pending > 1 hour without a driver
        pool.query(
          `SELECT odr.id, odr.service_name, odr.requested_date, p.address, odr.created_at
           FROM on_demand_requests odr
           JOIN locations p ON p.id = odr.location_id
           WHERE odr.status = 'pending' AND odr.assigned_driver_id IS NULL
             AND odr.created_at < NOW() - INTERVAL '1 hour'
           ORDER BY odr.created_at ASC LIMIT 50`
        ),
        // Escalated missed collections
        pool.query(
          `SELECT mcr.id, mcr.reported_date, mcr.status, p.address, mcr.created_at
           FROM missed_collection_reports mcr
           JOIN locations p ON p.id = mcr.location_id
           WHERE mcr.status IN ('pending', 'escalated')
           ORDER BY mcr.created_at ASC LIMIT 50`
        ),
        // Routes with expired/no bids (open > 24h with no pending bids)
        pool.query(
          `SELECT r.id, r.title, r.scheduled_date, r.status, r.created_at
           FROM routes r
           WHERE r.status IN ('open', 'bidding') AND r.assigned_driver_id IS NULL
             AND r.created_at < NOW() - INTERVAL '24 hours'
             AND r.scheduled_date >= CURRENT_DATE
             AND NOT EXISTS (SELECT 1 FROM route_bids rb WHERE rb.route_id = r.id AND rb.status = 'pending')
           ORDER BY r.scheduled_date ASC LIMIT 50`
        ),
        // Failed auto-assignments (from log)
        pool.query(
          `SELECT aal.id, aal.location_id, aal.failure_reason, aal.created_at, p.address
           FROM auto_assignment_log aal
           JOIN locations p ON p.id = aal.location_id
           WHERE aal.success = false AND aal.created_at > NOW() - INTERVAL '7 days'
           ORDER BY aal.created_at DESC LIMIT 50`
        ).catch(() => ({ rows: [] })),
        // Stale draft routes for upcoming dates
        pool.query(
          `SELECT r.id, r.title, r.scheduled_date, r.created_at,
                  COALESCE(sc.stop_count, 0)::int AS stop_count
           FROM routes r
           LEFT JOIN (SELECT route_id, COUNT(*) AS stop_count FROM route_stops GROUP BY route_id) sc ON sc.route_id = r.id
           WHERE r.status = 'draft' AND r.scheduled_date >= CURRENT_DATE
             AND r.scheduled_date <= CURRENT_DATE + INTERVAL '3 days'
           ORDER BY r.scheduled_date ASC LIMIT 50`
        ),
      ]);

      res.json({
        unmatchedOnDemand: unmatchedOnDemand.rows,
        escalatedMissed: escalatedMissed.rows,
        expiredBids: expiredBids.rows,
        failedAssignments: failedAssignments.rows,
        staleDraftRoutes: staleDraftRoutes.rows,
        totalExceptions:
          unmatchedOnDemand.rows.length +
          escalatedMissed.rows.length +
          expiredBids.rows.length +
          failedAssignments.rows.length +
          staleDraftRoutes.rows.length,
      });
    } catch (error) {
      console.error('Failed to fetch exceptions:', error);
      res.status(500).json({ error: 'Failed to fetch exceptions' });
    }
  });

  app.get('/api/admin/planning/calendar', requireAdmin, async (req: Request, res: Response) => {
    try {
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

      // Auto-complete stale past-date routes that have no pending stops
      await storage.query(
        `UPDATE routes SET status = 'completed', completed_at = NOW()
         WHERE scheduled_date >= $1 AND scheduled_date <= $2
           AND scheduled_date < CURRENT_DATE
           AND status IN ('assigned', 'in_progress')
           AND NOT EXISTS (
             SELECT 1 FROM route_stops rs
             WHERE rs.route_id = routes.id
               AND rs.status NOT IN ('completed', 'failed', 'cancelled')
           )`,
        [from, to]
      );

      const data = await storage.getPlanningCalendarData(from, to);
      res.json(data);
    } catch (error) {
      console.error('Failed to fetch planning calendar:', error);
      res.status(500).json({ error: 'Failed to fetch planning data' });
    }
  });

  app.get('/api/admin/planning/date/:date', requireAdmin, async (req: Request, res: Response) => {
    try {
      const date = req.params.date as string;
      const [locations, onDemandRequests, existingRoutes] = await Promise.all([
        storage.getLocationsDueOnDate(date),
        storage.getOnDemandRequestsForDate(date),
        storage.getAllRoutes({ date_from: date, date_to: date }),
      ]);
      res.json({ locations, onDemandRequests, existingRoutes: existingRoutes.map(formatRouteForClient) });
    } catch (error) {
      console.error('Failed to fetch planning date:', error);
      res.status(500).json({ error: 'Failed to fetch planning data for date' });
    }
  });

  app.post('/api/admin/planning/auto-group', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { date } = req.body;
      if (!date) return res.status(400).json({ error: 'date is required' });

      const locations = await storage.getLocationsDueOnDate(date);
      const created: any[] = [];

      if (locations.length > 0) {
        const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
        const route = await storage.createRoute({
          title: `${dayName} Route - ${date}`,
          scheduled_date: date,
          estimated_stops: locations.length,
          route_type: 'daily_route',
          source: 'auto_planned',
          status: 'draft',
        });
        await storage.addRouteStops(
          route.id,
          locations.map((p: any) => ({ location_id: p.id, order_type: 'recurring' }))
        );
        created.push(route);
      }

      // Auto-bundle small on-demand requests
      const onDemandRequests = await storage.getOnDemandRequestsForDate(date);
      const bulkThreshold = 200;
      for (const sp of onDemandRequests) {
        if (Number(sp.service_price) < bulkThreshold && created.length > 0) {
          // Add to the daily route
          await storage.addRouteStops(created[0].id, [{
            location_id: sp.location_id,
            order_type: 'on_demand',
            on_demand_request_id: sp.id,
          }]);
        } else {
          // Create standalone bulk_collection route
          const bulkRoute = await storage.createRoute({
            title: `Bulk Collection - ${sp.customer_name || sp.address}`,
            scheduled_date: date,
            estimated_stops: 1,
            route_type: 'bulk_collection',
            source: 'on_demand',
            on_demand_request_id: sp.id,
            base_pay: Number(sp.service_price),
            status: 'draft',
          });
          await storage.addRouteStops(bulkRoute.id, [{
            location_id: sp.location_id,
            order_type: 'on_demand',
            on_demand_request_id: sp.id,
          }]);
          created.push(bulkRoute);
        }
      }

      await audit(req, 'auto_group_routes', 'route', null as any, { date, routeCount: created.length });
      res.json({ routes: created.map(formatRouteForClient) });
    } catch (error) {
      console.error('Failed to auto-group routes:', error);
      res.status(500).json({ error: 'Failed to auto-group routes' });
    }
  });

  // ── Route Auto-Plan (multi-day) ──

  app.post('/api/admin/planning/auto-plan', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { startDate, days } = req.body;
      if (!startDate || !days) return res.status(400).json({ error: 'startDate and days are required' });

      const maxStops = parseInt(process.env.ROUTE_MAX_STOPS || '50', 10);
      const existingDates = new Set(await storage.getExistingRouteDates(
        startDate,
        new Date(new Date(startDate + 'T12:00:00').getTime() + (days - 1) * 86400000).toISOString().split('T')[0]
      ));

      let routesCreated = 0;
      let daysPlanned = 0;
      let skippedDays = 0;

      for (let i = 0; i < days; i++) {
        const d = new Date(new Date(startDate + 'T12:00:00').getTime() + i * 86400000);
        const dateStr = d.toISOString().split('T')[0];
        const dayOfWeek = d.getDay();

        // Skip Sundays
        if (dayOfWeek === 0) { skippedDays++; continue; }

        // Skip dates that already have routes
        if (existingDates.has(dateStr)) { skippedDays++; continue; }

        const locations = await storage.getLocationsDueOnDate(dateStr);
        if (locations.length === 0) { skippedDays++; continue; }

        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });

        // Split into multiple routes if exceeding capacity
        const chunks: typeof locations[] = [];
        if (locations.length > maxStops) {
          for (let c = 0; c < locations.length; c += maxStops) {
            chunks.push(locations.slice(c, c + maxStops));
          }
        } else {
          chunks.push(locations);
        }

        for (let ci = 0; ci < chunks.length; ci++) {
          const chunk = chunks[ci];
          const suffix = chunks.length > 1 ? ` (${String.fromCharCode(65 + ci)})` : '';
          const route = await storage.createRoute({
            title: `${dayName} Route${suffix} - ${dateStr}`,
            scheduled_date: dateStr,
            estimated_stops: chunk.length,
            route_type: 'daily_route',
            source: 'auto_planned',
            status: 'draft',
          });
          await storage.addRouteStops(
            route.id,
            chunk.map((p: any) => ({ location_id: p.id, order_type: 'recurring' }))
          );
          routesCreated++;
        }

        // Auto-bundle small on-demand requests
        const onDemandRequests = await storage.getOnDemandRequestsForDate(dateStr);
        const bulkThreshold = 200;
        for (const sp of onDemandRequests) {
          if (Number(sp.service_price) >= bulkThreshold) {
            const bulkRoute = await storage.createRoute({
              title: `Bulk Collection - ${sp.customer_name || sp.address}`,
              scheduled_date: dateStr,
              estimated_stops: 1,
              route_type: 'bulk_collection',
              source: 'on_demand',
              on_demand_request_id: sp.id,
              base_pay: Number(sp.service_price),
              status: 'draft',
            });
            await storage.addRouteStops(bulkRoute.id, [{
              location_id: sp.location_id,
              order_type: 'on_demand',
              on_demand_request_id: sp.id,
            }]);
            routesCreated++;
          }
        }

        daysPlanned++;
      }

      await audit(req, 'auto_plan_routes', 'route', null as any, { startDate, days, routesCreated, daysPlanned });
      res.json({ routesCreated, daysPlanned, skippedDays });
    } catch (error) {
      console.error('Failed to auto-plan routes:', error);
      res.status(500).json({ error: 'Failed to auto-plan routes' });
    }
  });

  // ── Sync Route to OptimoRoute ──

  app.post('/api/admin/routes/:id/sync-to-optimo', requireAdmin, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.id;
      const route = await storage.getRouteById(routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });
      const stops = await storage.getRouteStops(routeId);

      let ordersSynced = 0;
      let ordersSkipped = 0;
      const errors: string[] = [];
      const scheduledDate = getRouteDate(route);

      for (const stop of stops) {
        if (!stop.address) {
          errors.push(`Stop ${stop.id}: missing address, skipped`);
          continue;
        }
        const stopKey = stop.location_id ? stop.location_id.substring(0, 8) : stop.id.substring(0, 8);
        const orderNo = `ROUTE-${routeId.substring(0, 8)}-${stopKey}`;
        try {
          const result = await optimo.createOrder({
            orderNo,
            type: 'P',
            date: scheduledDate,
            duration: 8,
            address: stop.address,
            locationName: stop.customer_name || '',
            notes: `Route: ${route.title}`,
          });
          if (result && result.success === false) {
            ordersSkipped++;
          } else {
            ordersSynced++;
          }
          // Save order number on the stop for future pull-back (order exists either way)
          await storage.updateRouteStop(stop.id, { optimo_order_no: orderNo });
        } catch (err: any) {
          errors.push(`${stop.address}: ${err.message}`);
        }
      }

      if (errors.length === 0) {
        await storage.markRouteSynced(routeId);
      }
      await audit(req, 'sync_route_to_optimo', 'route', routeId, { ordersSynced, ordersSkipped, errors: errors.length });
      res.json({ ordersSynced, ordersSkipped, errors });
    } catch (error) {
      console.error('Failed to sync route to OptimoRoute:', error);
      res.status(500).json({ error: 'Failed to sync route to OptimoRoute' });
    }
  });

  app.post('/api/admin/planning/sync-day', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { date } = req.body;
      if (!date) return res.status(400).json({ error: 'date is required' });

      const routes = await storage.getAllRoutes({ date_from: date, date_to: date });
      const publishedRoutes = routes.filter((r: any) => r.status !== 'draft' && r.status !== 'cancelled');

      let totalSynced = 0;
      let totalSkipped = 0;
      const allErrors: string[] = [];

      for (const route of publishedRoutes) {
        const stops = await storage.getRouteStops(route.id);
        let routeSynced = 0;
        let routeErrors = 0;
        const scheduledDate = getRouteDate(route);

        for (const stop of stops) {
          if (!stop.address) {
            allErrors.push(`Route ${route.id} stop ${stop.id}: missing address, skipped`);
            routeErrors++;
            continue;
          }
          const stopKey = stop.location_id ? stop.location_id.substring(0, 8) : stop.id.substring(0, 8);
          const orderNo = `ROUTE-${route.id.substring(0, 8)}-${stopKey}`;
          try {
            const result = await optimo.createOrder({
              orderNo,
              type: 'P',
              date: scheduledDate,
              duration: 8,
              address: stop.address,
              locationName: stop.customer_name || '',
              notes: `Route: ${route.title}`,
            });
            if (result && result.success === false) {
              totalSkipped++;
            } else {
              routeSynced++;
            }
            await storage.updateRouteStop(stop.id, { optimo_order_no: orderNo });
          } catch (err: any) {
            allErrors.push(`${stop.address}: ${err.message}`);
            routeErrors++;
          }
        }

        totalSynced += routeSynced;
        if (routeErrors === 0) {
          await storage.markRouteSynced(route.id);
        }
      }

      await audit(req, 'sync_day_to_optimo', 'route', null as any, { date, totalSynced, totalSkipped });
      res.json({ routesSynced: publishedRoutes.length, ordersSynced: totalSynced, ordersSkipped: totalSkipped, errors: allErrors });
    } catch (error) {
      console.error('Failed to sync day to OptimoRoute:', error);
      res.status(500).json({ error: 'Failed to sync day to OptimoRoute' });
    }
  });

  // ── Pull optimized sequence from OptimoRoute ──

  app.post('/api/admin/routes/:id/pull-sequence', requireAdmin, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.id;
      const route = await storage.getRouteById(routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });

      const stops = await storage.getRouteStops(routeId);
      const date = getRouteDate(route);
      const optimoData = await optimo.getRoutes(date);
      const optimoRoutes = optimoData.routes || [];
      await applyOptimoIdentifierBackfill(route, stops, optimoRoutes);

      const stopsWithIdentifiers = stops.filter((s: any) => getStoredOptimoIdentifier(s));
      if (stopsWithIdentifiers.length === 0) {
        return res.status(400).json({ error: 'No stops have OptimoRoute identifiers. Sync to Optimo first.' });
      }

      // Build a map of identifier -> { stopNumber, scheduledAt }
      const orderMap = new Map<string, { stopNumber: number; scheduledAt: string }>();
      for (const oRoute of optimoRoutes) {
        for (const oStop of (oRoute.stops || [])) {
          const identifier = getOptimoApiStopIdentifier(oStop);
          if (!identifier) continue;
          orderMap.set(identifier, {
            stopNumber: oStop.stopNumber || 0,
            scheduledAt: oStop.scheduledAt || '',
          });
        }
      }

      // Update portal stops with optimized sequence
      let updated = 0;
      for (const stop of stopsWithIdentifiers) {
        const optimoInfo = orderMap.get(getStoredOptimoIdentifier(stop)!);
        if (optimoInfo) {
          await storage.updateRouteStop(stop.id, {
            stop_number: optimoInfo.stopNumber,
            scheduled_at: optimoInfo.scheduledAt,
          });
          updated++;
        }
      }

      res.json({ stopsUpdated: updated, totalStops: stops.length });
    } catch (error) {
      console.error('Failed to pull sequence from OptimoRoute:', error);
      res.status(500).json({ error: 'Failed to pull sequence from OptimoRoute' });
    }
  });

  app.post('/api/admin/routes/:id/pull-completion', requireAdmin, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.id;
      const route = await storage.getRouteById(routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });

      const stops = await storage.getRouteStops(routeId);
      await applyOptimoIdentifierBackfill(route, stops);

      const identifiers = stops
        .map((stop: any) => getStoredOptimoIdentifier(stop))
        .filter((identifier): identifier is string => Boolean(identifier));
      if (identifiers.length === 0) {
        return res.status(400).json({ error: 'No stops have OptimoRoute identifiers.' });
      }

      const dataMap = await fetchCompletionPayloadsByIdentifier(identifiers);

      // Update portal stops with completion status and POD data
      let updated = 0;
      for (const stop of stops) {
        const identifier = getStoredOptimoIdentifier(stop);
        if (!identifier) continue;

        const data = dataMap.get(identifier);
        const portalStatus = normalizeOptimoStatus(data?.status);
        const updateFields: any = {};
        if (portalStatus && portalStatus !== stop.status) updateFields.status = portalStatus;
        if (data?.form) updateFields.pod_data = JSON.stringify(data.form);
        if (Object.keys(updateFields).length === 0) continue;

        await storage.updateRouteStop(stop.id, updateFields);
        if (updateFields.status) updated++;
      }

      const onDemandIds = Array.from(new Set(
        stops
          .map((s: any) => s.on_demand_request_id)
          .filter((id: any) => typeof id === 'string' && id.length > 0)
      ));
      if (onDemandIds.length > 0) {
        await storage.query(
          `WITH derived AS (
             SELECT odr.id,
                    CASE
                      WHEN EXISTS (
                        SELECT 1 FROM route_stops rs
                        WHERE rs.on_demand_request_id = odr.id AND rs.status = 'completed'
                      ) THEN 'completed'
                      WHEN odr.status != 'completed' AND EXISTS (
                        SELECT 1 FROM route_stops rs
                        WHERE rs.on_demand_request_id = odr.id AND rs.status = 'cancelled'
                      ) THEN 'cancelled'
                      WHEN odr.status = 'pending' AND EXISTS (
                        SELECT 1 FROM route_stops rs
                        WHERE rs.on_demand_request_id = odr.id AND rs.status IN ('scheduled', 'in_progress', 'pending')
                      ) THEN 'scheduled'
                      ELSE odr.status
                    END AS next_status
             FROM on_demand_requests odr
             WHERE odr.id = ANY($1::uuid[])
           )
           UPDATE on_demand_requests odr
           SET status = d.next_status,
               updated_at = NOW()
           FROM derived d
           WHERE odr.id = d.id
             AND odr.status IS DISTINCT FROM d.next_status`,
          [onDemandIds]
        );
      }

      // If all stops are terminal (completed/failed/cancelled), mark route completed
      const updatedStops = await storage.getRouteStops(routeId);
      const allTerminal = updatedStops.length > 0 && updatedStops.every((s: any) => ['completed', 'failed', 'cancelled'].includes(s.status));
      if (allTerminal && route.status !== 'completed') {
        await storage.updateRoute(routeId, { status: 'completed', completed_at: new Date().toISOString() });
      }

      res.json({ stopsUpdated: updated, totalStops: stops.length });
    } catch (error) {
      console.error('Failed to pull completion from OptimoRoute:', error);
      res.status(500).json({ error: 'Failed to pull completion from OptimoRoute' });
    }
  });

  // Batch pull completion data from OptimoRoute for all routes on a given date.
  // Called automatically when admin views a day in the calendar.
  app.post('/api/admin/routes/pull-completion-for-date', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { date } = req.body as { date: string };
      if (!date) return res.status(400).json({ error: 'date is required' });

      // Find all non-completed, non-cancelled routes for this date
      const routeResult = await storage.query(
        `SELECT id, title, status, scheduled_date, optimo_route_key
         FROM routes
         WHERE scheduled_date::text LIKE $1
           AND status NOT IN ('completed', 'cancelled', 'draft')`,
        [`${date}%`]
      );
      const routes = routeResult.rows;
      if (routes.length === 0) return res.json({ routesUpdated: 0, stopsUpdated: 0 });

      const allStopsResult = await storage.query(
        `SELECT rs.id, rs.route_id, rs.optimo_order_no, rs.status, rs.on_demand_request_id,
                rs.stop_number, rs.scheduled_at, COALESCE(rs.address, p.address) AS address
         FROM route_stops rs
         LEFT JOIN locations p ON rs.location_id = p.id
         WHERE rs.route_id = ANY($1)`,
        [routes.map((route: any) => route.id)]
      );
      const allStops = allStopsResult.rows;

      if (allStops.some((stop: any) => !getStoredOptimoIdentifier(stop))) {
        const optimoRoutes = (await optimo.getRoutes(date)).routes || [];
        const stopsByRoute = new Map<string, any[]>();
        for (const stop of allStops) {
          const routeStops = stopsByRoute.get(stop.route_id) || [];
          routeStops.push(stop);
          stopsByRoute.set(stop.route_id, routeStops);
        }

        for (const route of routes) {
          await applyOptimoIdentifierBackfill(route, stopsByRoute.get(route.id) || [], optimoRoutes);
        }
      }

      const identifiers = Array.from(new Set(
        allStops
          .map((stop: any) => getStoredOptimoIdentifier(stop))
          .filter((identifier): identifier is string => Boolean(identifier))
      ));
      if (identifiers.length === 0) return res.json({ routesUpdated: 0, stopsUpdated: 0 });

      const statusMap = await fetchCompletionPayloadsByIdentifier(identifiers);

      let stopsUpdated = 0;
      const routeIdsToCheck = new Set<string>();

      for (const stop of allStops) {
        const identifier = getStoredOptimoIdentifier(stop);
        if (!identifier) continue;
        const data = statusMap.get(identifier);
        const portalStatus = normalizeOptimoStatus(data?.status);
        if (portalStatus && portalStatus !== stop.status) {
          // Update stop status and store POD form data if present
          const updateFields: any = { status: portalStatus };
          if (data?.form) {
            updateFields.pod_data = JSON.stringify(data.form);
          }
          await storage.updateRouteStop(stop.id, updateFields);
          stopsUpdated++;
          routeIdsToCheck.add(stop.route_id);
        } else if (data?.form) {
          // Status unchanged but POD data available — store it
          await storage.updateRouteStop(stop.id, { pod_data: JSON.stringify(data.form) });
        }
      }

      const onDemandIds = Array.from(new Set(
        allStops
          .map((s: any) => s.on_demand_request_id)
          .filter((id: any) => typeof id === 'string' && id.length > 0)
      ));
      if (onDemandIds.length > 0) {
        await storage.query(
          `WITH derived AS (
             SELECT odr.id,
                    CASE
                      WHEN EXISTS (
                        SELECT 1 FROM route_stops rs
                        WHERE rs.on_demand_request_id = odr.id AND rs.status = 'completed'
                      ) THEN 'completed'
                      WHEN odr.status != 'completed' AND EXISTS (
                        SELECT 1 FROM route_stops rs
                        WHERE rs.on_demand_request_id = odr.id AND rs.status = 'cancelled'
                      ) THEN 'cancelled'
                      WHEN odr.status = 'pending' AND EXISTS (
                        SELECT 1 FROM route_stops rs
                        WHERE rs.on_demand_request_id = odr.id AND rs.status IN ('scheduled', 'in_progress', 'pending')
                      ) THEN 'scheduled'
                      ELSE odr.status
                    END AS next_status
             FROM on_demand_requests odr
             WHERE odr.id = ANY($1::uuid[])
           )
           UPDATE on_demand_requests odr
           SET status = d.next_status,
               updated_at = NOW()
           FROM derived d
           WHERE odr.id = d.id
             AND odr.status IS DISTINCT FROM d.next_status`,
          [onDemandIds]
        );
      }

      // Auto-complete routes where all stops are terminal (completed or failed)
      let routesUpdated = 0;
      for (const routeId of routeIdsToCheck) {
        const stopsResult = await storage.query(
          `SELECT status FROM route_stops WHERE route_id = $1`,
          [routeId]
        );
        const allTerminal = stopsResult.rows.length > 0 && stopsResult.rows.every((s: any) => ['completed', 'failed', 'cancelled'].includes(s.status));
        if (allTerminal) {
          await storage.updateRoute(routeId, { status: 'completed', completed_at: new Date().toISOString() });
          routesUpdated++;
        }
      }

      // Also mark stale past-date routes as completed if they have no pending stops
      const staleResult = await storage.query(
        `SELECT r.id FROM routes r
         WHERE r.scheduled_date::text LIKE $1
           AND r.status IN ('assigned', 'in_progress')
           AND r.scheduled_date < CURRENT_DATE
           AND NOT EXISTS (
             SELECT 1 FROM route_stops rs
             WHERE rs.route_id = r.id
               AND rs.status NOT IN ('completed', 'failed', 'cancelled')
           )`,
        [`${date}%`]
      );
      for (const row of staleResult.rows) {
        await storage.updateRoute(row.id, { status: 'completed', completed_at: new Date().toISOString() });
        routesUpdated++;
      }

      res.json({ routesUpdated, stopsUpdated });
    } catch (error) {
      console.error('Failed to pull completion for date:', error);
      res.status(500).json({ error: 'Failed to pull completion data' });
    }
  });

  // Persist live stop statuses received from OptimoStatusBanner polling.
  // Accepts a map of { orderNo: optimoStatus } and persists them to route_stops.
  app.post('/api/admin/routes/sync-live-statuses', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { stopStatuses } = req.body as { stopStatuses: Record<string, string> };
      if (!stopStatuses || typeof stopStatuses !== 'object') {
        return res.status(400).json({ error: 'stopStatuses object is required' });
      }

      const orderNos = Object.keys(stopStatuses);
      if (orderNos.length === 0) return res.json({ updated: 0 });

      let updated = 0;
      for (const [orderNo, rawStatus] of Object.entries(stopStatuses)) {
        const portalStatus = normalizeOptimoStatus(rawStatus) ?? rawStatus;
        const result = await storage.query(
          `UPDATE route_stops SET status = $1 WHERE optimo_order_no = $2 AND status != $1`,
          [portalStatus, orderNo]
        );
        if (result.rowCount && result.rowCount > 0) updated++;
      }

      res.json({ updated });
    } catch (error) {
      console.error('Failed to sync live statuses:', error);
      res.status(500).json({ error: 'Failed to sync live statuses' });
    }
  });

  // ── Weekly Planner ──

  app.get('/api/admin/planning/week', requireAdmin, async (req: Request, res: Response) => {
    try {
      const monday = req.query.monday as string;
      if (!monday) return res.status(400).json({ error: 'monday date is required' });

      const monDate = new Date(monday + 'T12:00:00');
      const satDate = new Date(monDate);
      satDate.setDate(satDate.getDate() + 5);
      const saturday = satDate.toISOString().split('T')[0];

      const [routes, cancelled] = await Promise.all([
        storage.getAllRoutes({ date_from: monday, date_to: saturday }),
        storage.getCancelledCollectionsForWeek(monday, saturday),
      ]);

      // Get missing clients for each day (Mon-Sat)
      const missingByDay: Record<string, any[]> = {};
      for (let i = 0; i < 6; i++) {
        const d = new Date(monDate);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        missingByDay[dateStr] = await storage.getMissingClientsForDate(dateStr);
      }

      res.json({ routes: routes.map(formatRouteForClient), cancelled, missingByDay });
    } catch (error) {
      console.error('Failed to fetch week planning data:', error);
      res.status(500).json({ error: 'Failed to fetch week planning data' });
    }
  });

  app.post('/api/admin/planning/copy-week', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { sourceMondayDate } = req.body;
      if (!sourceMondayDate) return res.status(400).json({ error: 'sourceMondayDate is required' });

      const monDate = new Date(sourceMondayDate + 'T12:00:00');
      const satDate = new Date(monDate);
      satDate.setDate(satDate.getDate() + 5);
      const saturday = satDate.toISOString().split('T')[0];

      // Check if target week already has routes
      const targetMonday = new Date(monDate);
      targetMonday.setDate(targetMonday.getDate() + 7);
      const targetSaturday = new Date(targetMonday);
      targetSaturday.setDate(targetSaturday.getDate() + 5);
      const existingTarget = await storage.getAllRoutes({
        date_from: targetMonday.toISOString().split('T')[0],
        date_to: targetSaturday.toISOString().split('T')[0],
      });
      if (existingTarget.length > 0) {
        return res.status(409).json({
          error: 'Target week already has routes. Delete them first or choose a different week.',
          existingCount: existingTarget.length,
        });
      }

      const created = await storage.copyWeekRoutes(sourceMondayDate, saturday);
      await audit(req, 'copy_week_routes', 'route', undefined, { sourceMondayDate, routesCopied: created.length });
      res.json({ routes: created.map(formatRouteForClient) });
    } catch (error) {
      console.error('Failed to copy week:', error);
      res.status(500).json({ error: 'Failed to copy week' });
    }
  });

  app.post('/api/admin/planning/publish-week', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { mondayDate } = req.body;
      if (!mondayDate) return res.status(400).json({ error: 'mondayDate is required' });

      const monDate = new Date(mondayDate + 'T12:00:00');
      const satDate = new Date(monDate);
      satDate.setDate(satDate.getDate() + 5);
      const saturday = satDate.toISOString().split('T')[0];

      const routes = await storage.getAllRoutes({ date_from: mondayDate, date_to: saturday, status: 'draft' });
      let published = 0;
      for (const route of routes) {
        await storage.updateRoute(route.id, { status: 'open' });
        published++;
      }

      await audit(req, 'publish_week_routes', 'route', undefined, { mondayDate, publishedCount: published });
      res.json({ published });
    } catch (error) {
      console.error('Failed to publish week:', error);
      res.status(500).json({ error: 'Failed to publish week' });
    }
  });

  // Route Optimization
  app.post('/api/admin/routes/:id/optimize', requireAdmin, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.id as string;
      const result = await optimizeRouteJob(routeId);
      await audit(req, 'optimize_route', 'route', routeId, { planningId: result.planningId, ordersCreated: result.ordersCreated });
      res.json(result);
    } catch (error: any) {
      console.error('Failed to optimize route:', error);
      res.status(400).json({ error: error.message || 'Failed to optimize route' });
    }
  });

  app.get('/api/admin/routes/:id/optimize-status', requireAdmin, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.id as string;
      const result = await checkRouteOptimizationStatus(routeId);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to check optimization status' });
    }
  });

  // Bids
  app.get('/api/admin/bids/stats', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getBidStats();
      res.json(stats);
    } catch (error) {
      console.error('Admin bid stats error:', error);
      res.status(500).json({ error: 'Failed to fetch bid stats' });
    }
  });

  app.get('/api/admin/bids', requireAdmin, async (req: Request, res: Response) => {
    try {
      const options = {
        driverId: (req.query.driverId as string) || undefined,
        routeStatus: (req.query.routeStatus as string) || undefined,
        search: (req.query.search as string) || undefined,
        sortBy: (req.query.sortBy as string) || 'bid_date',
        sortDir: (req.query.sortDir as string) || 'desc',
        limit: Math.min(parseInt(req.query.limit as string) || 50, 500),
        offset: Math.max(parseInt(req.query.offset as string) || 0, 0),
      };
      const result = await storage.getAllBidsPaginated(options);
      res.json({
        bids: result.bids.map((b: any) => ({
          id: b.id,
          routeId: b.job_id,
          routeTitle: b.job_title,
          routeStatus: b.job_status,
          routeScheduledDate: b.job_scheduled_date,
          routeBasePay: b.job_base_pay ? Number(b.job_base_pay) : null,
          driverId: b.driver_id,
          driverName: b.driver_name,
          driverRating: b.driver_rating ? Number(b.driver_rating) : null,
          bidAmount: Number(b.bid_amount),
          message: b.message,
          driverRatingAtBid: b.driver_rating_at_bid ? Number(b.driver_rating_at_bid) : null,
          createdAt: b.created_at,
        })),
        total: result.total,
      });
    } catch (error) {
      console.error('Admin bids error:', error);
      res.status(500).json({ error: 'Failed to fetch bids' });
    }
  });

  // ── Driver Payment Tracking ──
  // Lists completed routes with assigned drivers and their payment status.
  // Used by the Expenses > Driver Pay tab in the admin accounting view.

  app.get('/api/admin/driver-payments', requireAdmin, requirePermission('billing.read'), async (req: Request, res: Response) => {
    try {
      const { payment_status, driver_id, date_from, date_to } = req.query;
      const conditions: string[] = [`rj.status = 'completed'`, `rj.assigned_driver_id IS NOT NULL`];
      const params: any[] = [];
      let idx = 1;
      if (payment_status) { conditions.push(`rj.payment_status = $${idx++}`); params.push(payment_status); }
      if (driver_id) { conditions.push(`rj.assigned_driver_id = $${idx++}`); params.push(driver_id); }
      if (date_from) { conditions.push(`rj.scheduled_date >= $${idx++}`); params.push(date_from); }
      if (date_to) { conditions.push(`rj.scheduled_date <= $${idx++}`); params.push(date_to); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await pool.query(
        `SELECT rj.id, rj.title, rj.scheduled_date, rj.base_pay, rj.actual_pay,
                rj.payment_status, rj.assigned_driver_id, rj.status,
                d.name AS driver_name, d.stripe_connect_account_id AS driver_stripe_id
         FROM routes rj
         LEFT JOIN driver_profiles d ON rj.assigned_driver_id = d.id
         ${where}
         ORDER BY rj.scheduled_date DESC`,
        params
      );

      // Summary stats
      const summaryResult = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE payment_status = 'unpaid')::int AS unpaid_count,
           COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS paid_count,
           COALESCE(SUM(COALESCE(actual_pay, base_pay)) FILTER (WHERE payment_status = 'unpaid'), 0)::numeric AS unpaid_total,
           COALESCE(SUM(COALESCE(actual_pay, base_pay)) FILTER (WHERE payment_status = 'paid'), 0)::numeric AS paid_total
         FROM routes
         WHERE status = 'completed' AND assigned_driver_id IS NOT NULL`
      );

      res.json({
        routes: result.rows.map((r: any) => ({
          id: r.id,
          title: r.title,
          scheduledDate: r.scheduled_date,
          basePay: r.base_pay ? Number(r.base_pay) : null,
          actualPay: r.actual_pay ? Number(r.actual_pay) : null,
          paymentStatus: r.payment_status || 'unpaid',
          driverId: r.assigned_driver_id,
          driverName: r.driver_name,
          driverStripeId: r.driver_stripe_id,
        })),
        summary: {
          unpaidCount: summaryResult.rows[0]?.unpaid_count || 0,
          paidCount: summaryResult.rows[0]?.paid_count || 0,
          unpaidTotal: Number(summaryResult.rows[0]?.unpaid_total || 0),
          paidTotal: Number(summaryResult.rows[0]?.paid_total || 0),
        },
      });
    } catch (error) {
      console.error('Driver payments error:', error);
      res.status(500).json({ error: 'Failed to fetch driver payments' });
    }
  });

  // Update a route's payment status (unpaid → processing → paid) for driver payroll tracking
  app.put('/api/admin/routes/:id/payment-status', requireAdmin, requirePermission('billing'), async (req: Request, res: Response) => {
    try {
      const { payment_status, actual_pay } = req.body;
      if (!payment_status || !['unpaid', 'paid', 'processing'].includes(payment_status)) {
        return res.status(400).json({ error: 'payment_status must be unpaid, processing, or paid' });
      }
      const route = await storage.getRouteById(req.params.id as string);
      if (!route) return res.status(404).json({ error: 'Route not found' });

      const updated = await storage.updateRoute(req.params.id as string, {
        payment_status,
        ...(actual_pay !== undefined ? { actual_pay: parseFloat(actual_pay) } : {}),
      });
      await audit(req, 'update_payment_status', 'route', req.params.id as string, { payment_status, actual_pay });
      res.json({ route: formatRouteForClient(updated) });
    } catch (error) {
      console.error('Update payment status error:', error);
      res.status(500).json({ error: 'Failed to update payment status' });
    }
  });

  // Bulk notifications
  app.post('/api/admin/bulk-notify', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { userIds, type, data } = req.body;
      if (!userIds || !Array.isArray(userIds) || !type) {
        return res.status(400).json({ error: 'userIds array and type are required' });
      }
      let sent = 0;
      let failed = 0;
      for (const userId of userIds) {
        try {
          switch (type) {
            case 'pickup_reminder':
              await sendCollectionReminder(userId, data?.address || '', data?.date || '', data?.collectionType || 'Regular');
              break;
            case 'billing_alert':
              await sendBillingAlert(userId, data?.invoiceNumber || '', data?.amount || 0, data?.dueDate || '');
              break;
            case 'service_update':
              await sendServiceUpdate(userId, data?.updateType || 'Update', data?.details || '');
              break;
          }
          sent++;
        } catch { failed++; }
      }
      await audit(req, 'bulk_notify', 'system', undefined, { type, count: userIds.length, sent, failed });
      res.json({ success: true, sent, failed });
    } catch (error) {
      res.status(500).json({ error: 'Failed to send bulk notifications' });
    }
  });

  // Stripe billing actions
  app.post('/api/admin/billing/create-invoice', requireAdmin, requirePermission('billing'), async (req: Request, res: Response) => {
    try {
      const { customerId, amount, description } = req.body;
      if (!customerId || !amount) return res.status(400).json({ error: 'customerId and amount are required' });
      const user = await storage.getUserById(customerId);
      if (!user?.stripe_customer_id) return res.status(400).json({ error: 'Customer has no Stripe account' });
      const stripe = await getUncachableStripeClient();
      await stripe.invoiceItems.create({
        customer: user.stripe_customer_id,
        amount: Math.round(amount * 100),
        currency: 'usd',
        description: description || 'Admin charge',
      });
      const invoice = await stripe.invoices.create({
        customer: user.stripe_customer_id,
        auto_advance: true,
      });
      await stripe.invoices.finalizeInvoice(invoice.id);
      await audit(req, 'create_invoice', 'user', customerId, { amount, description, invoiceId: invoice.id });
      res.json({ success: true, invoiceId: invoice.id });
    } catch (error: any) {
      console.error('Create invoice error:', error);
      res.status(500).json({ error: 'Failed to create invoice' });
    }
  });

  app.post('/api/admin/billing/apply-credit', requireAdmin, requirePermission('billing'), async (req: Request, res: Response) => {
    try {
      const { customerId, amount, description } = req.body;
      if (!customerId || !amount) return res.status(400).json({ error: 'customerId and amount are required' });
      const user = await storage.getUserById(customerId);
      if (!user?.stripe_customer_id) return res.status(400).json({ error: 'Customer has no Stripe account' });
      const stripe = await getUncachableStripeClient();
      await stripe.customers.update(user.stripe_customer_id, {
        balance: -Math.round(Math.abs(amount) * 100),
      });
      await audit(req, 'apply_credit', 'user', customerId, { amount, description });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to apply credit' });
    }
  });

  app.post('/api/admin/billing/cancel-subscription', requireAdmin, requirePermission('billing'), async (req: Request, res: Response) => {
    try {
      const { subscriptionId, customerId } = req.body;
      if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required' });
      const stripe = await getUncachableStripeClient();
      await stripe.subscriptions.cancel(subscriptionId);
      await audit(req, 'cancel_subscription', 'user', customerId, { subscriptionId });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  });

  app.post('/api/admin/billing/pause-subscription', requireAdmin, requirePermission('billing'), async (req: Request, res: Response) => {
    try {
      const { subscriptionId, customerId } = req.body;
      if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required' });
      const stripe = await getUncachableStripeClient();
      await stripe.subscriptions.update(subscriptionId, {
        pause_collection: { behavior: 'void' },
      });
      await audit(req, 'pause_subscription', 'user', customerId, { subscriptionId });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to pause subscription' });
    }
  });

  app.post('/api/admin/billing/resume-subscription', requireAdmin, requirePermission('billing'), async (req: Request, res: Response) => {
    try {
      const { subscriptionId, customerId } = req.body;
      if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required' });
      const stripe = await getUncachableStripeClient();
      await stripe.subscriptions.update(subscriptionId, {
        pause_collection: '',
      } as any);
      await audit(req, 'resume_subscription', 'user', customerId, { subscriptionId });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to resume subscription' });
    }
  });

  app.get('/api/admin/billing/payment-history/:customerId', requireAdmin, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserById(req.params.customerId);
      if (!user?.stripe_customer_id) return res.json([]);
      const stripe = await getUncachableStripeClient();
      const charges = await stripe.charges.list({ customer: user.stripe_customer_id, limit: 50 });
      res.json(charges.data.map((c: any) => ({
        id: c.id,
        amount: c.amount / 100,
        status: c.status,
        description: c.description,
        created: new Date(c.created * 1000).toISOString(),
        receiptUrl: c.receipt_url,
        paymentMethod: c.payment_method_details?.card ? `${c.payment_method_details.card.brand} ····${c.payment_method_details.card.last4}` : 'N/A',
      })));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch payment history' });
    }
  });

  app.post('/api/admin/notify', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { userId, userIds, type, data, message, channel } = req.body;

      const targetIds: string[] = userIds && Array.isArray(userIds) ? userIds : userId ? [userId] : [];
      if (targetIds.length === 0) {
        return res.status(400).json({ error: 'userId or userIds required' });
      }

      let sent = 0;
      let failed = 0;

      for (const uid of targetIds) {
        try {
          if (message) {
            await sendCustomNotification(uid, message, channel || 'email');
          } else if (type) {
            switch (type) {
              case 'pickup_reminder':
                await sendCollectionReminder(uid, data?.address || '', data?.date || '', data?.collectionType || 'Regular');
                break;
              case 'billing_alert':
                await sendBillingAlert(uid, data?.invoiceNumber || '', data?.amount || 0, data?.dueDate || '');
                break;
              case 'service_update':
                await sendServiceUpdate(uid, data?.updateType || 'Update', data?.details || '');
                break;
              default:
                failed++;
                continue;
            }
          }
          sent++;
        } catch {
          failed++;
        }
      }

      if (targetIds.length > 1) {
        await audit(req, 'bulk_notify', 'system', undefined, { channel: channel || type, count: targetIds.length, sent, failed });
      }

      res.json({ success: true, sent, failed });
    } catch (error) {
      console.error('Admin notify error:', error);
      res.status(500).json({ error: 'Failed to send notification' });
    }
  });

  app.get('/api/admin/current', requireAdmin, async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const role = (req as any).adminRole;
      res.json({
        id: adminUser.id,
        name: `${adminUser.first_name} ${adminUser.last_name}`,
        email: adminUser.email,
        role: role || 'full_admin',
        permissions: ROLE_PERMISSIONS[role as AdminRole] || ROLE_PERMISSIONS.full_admin,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch admin info' });
    }
  });

  app.get('/api/admin/roles', requireAdmin, requirePermission('*'), async (_req: Request, res: Response) => {
    try {
      const admins = await storage.getAdminUsers();
      res.json({
        admins: admins.map((a: any) => ({
          id: a.id,
          name: `${a.first_name} ${a.last_name}`,
          email: a.email,
          role: a.admin_role || 'full_admin',
          createdAt: a.created_at,
        })),
        roles: Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => ({
          id: role,
          label: role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          permissions: perms,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch roles' });
    }
  });

  app.put('/api/admin/roles/:userId', requireAdmin, requirePermission('*'), async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const validRoles = ['full_admin', 'support', 'viewer'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      await storage.updateAdminRole(userId, role);
      await audit(req, 'update_admin_role', 'user', userId, { role });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update role' });
    }
  });

  app.post('/api/admin/customers/bulk-action', requireAdmin, requirePermission('customers'), async (req: Request, res: Response) => {
    try {
      const { action, userIds } = req.body;
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: 'userIds array is required' });
      }

      switch (action) {
        case 'grant_admin':
        case 'revoke_admin':
          if (!hasPermission((req as any).adminRole, '*')) {
            return res.status(403).json({ error: 'Only full admins can change admin status' });
          }
          if (action === 'grant_admin') {
            await storage.bulkUpdateAdminStatus(userIds, true);
            await audit(req, 'bulk_grant_admin', 'system', undefined, { count: userIds.length });
          } else {
            await storage.bulkUpdateAdminStatus(userIds, false);
            await audit(req, 'bulk_revoke_admin', 'system', undefined, { count: userIds.length });
          }
          break;
        case 'export': {
          const users = await storage.getUsersForExport({});
          const header = 'ID,First Name,Last Name,Email,Phone,Member Since,Stripe ID,Admin,Properties,Addresses,Created At\n';
          const rows = users
            .filter((u: any) => userIds.includes(u.id))
            .map((u: any) =>
              [u.id, u.first_name, u.last_name, u.email, u.phone || '', u.member_since || '', u.stripe_customer_id || '', u.is_admin, u.property_count, `"${(u.addresses || '').replace(/"/g, '""')}"`, u.created_at].join(',')
            ).join('\n');
          await audit(req, 'export_customers', 'system', undefined, { count: userIds.length });
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename=customers.csv');
          return res.send(header + rows);
        }
        default:
          return res.status(400).json({ error: 'Invalid bulk action' });
      }

      res.json({ success: true, affected: userIds.length });
    } catch (error) {
      res.status(500).json({ error: 'Failed to execute bulk action' });
    }
  });

  app.post('/api/admin/impersonate/:userId', requireAdmin, requirePermission('*'), async (req: Request, res: Response) => {
    try {
      const targetUserId = req.params.userId;
      const targetUser = await storage.getUserById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const adminUserId = req.session.originalAdminUserId || req.session.userId;
      req.session.originalAdminUserId = adminUserId;
      req.session.impersonatingUserId = targetUserId;
      req.session.userId = targetUserId;

      await audit(req, 'impersonate_user', 'user', targetUserId, { targetUserEmail: targetUser.email });

      req.session.save((err) => {
        if (err) {
          console.error('Session save error during impersonation:', err);
          return res.status(500).json({ error: 'Failed to start impersonation' });
        }
        res.json({ success: true, user: { firstName: targetUser.first_name, lastName: targetUser.last_name, email: targetUser.email } });
      });
    } catch (error) {
      console.error('Impersonation error:', error);
      res.status(500).json({ error: 'Failed to start impersonation' });
    }
  });

  app.post('/api/admin/stop-impersonate', requireAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.session?.originalAdminUserId) {
        return res.status(400).json({ error: 'Not currently impersonating' });
      }

      req.session.userId = req.session.originalAdminUserId;
      delete req.session.impersonatingUserId;
      delete req.session.originalAdminUserId;

      req.session.save((err) => {
        if (err) {
          console.error('Session save error stopping impersonation:', err);
          return res.status(500).json({ error: 'Failed to stop impersonation' });
        }
        res.json({ success: true });
      });
    } catch (error) {
      console.error('Stop impersonation error:', error);
      res.status(500).json({ error: 'Failed to stop impersonation' });
    }
  });

  app.post('/api/admin/impersonate-driver/:driverId', requireAdmin, requirePermission('*'), async (req: Request, res: Response) => {
    try {
      const driverProfileId = req.params.driverId;
      const driverProfile = await storage.getDriverById(driverProfileId);
      if (!driverProfile || !driverProfile.user_id) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      // Use unified impersonation: set userId to the driver's user_id
      const adminUserId = req.session.originalAdminUserId || req.session.userId;
      req.session.originalAdminUserId = adminUserId;
      req.session.impersonatingUserId = driverProfile.user_id;
      req.session.userId = driverProfile.user_id;

      await audit(req, 'impersonate_driver', 'driver', driverProfileId, { driverName: driverProfile.name });

      req.session.save((err) => {
        if (err) {
          console.error('Session save error during driver impersonation:', err);
          return res.status(500).json({ error: 'Failed to start driver impersonation' });
        }
        res.json({ success: true, driver: { id: driverProfile.id, name: driverProfile.name, userId: driverProfile.user_id } });
      });
    } catch (error) {
      console.error('Driver impersonation error:', error);
      res.status(500).json({ error: 'Failed to start driver impersonation' });
    }
  });

  // Keep backward-compat endpoint — redirects to unified stop-impersonate
  app.post('/api/admin/stop-impersonate-driver', requireAdmin, requirePermission('*'), async (req: Request, res: Response) => {
    try {
      if (!req.session?.originalAdminUserId) {
        return res.status(400).json({ error: 'Not currently impersonating' });
      }

      await audit(req, 'stop_impersonate_driver', 'driver', req.session.impersonatingUserId || undefined, {});

      req.session.userId = req.session.originalAdminUserId;
      delete req.session.impersonatingUserId;
      delete req.session.originalAdminUserId;

      req.session.save((err) => {
        if (err) {
          console.error('Session save error stopping driver impersonation:', err);
          return res.status(500).json({ error: 'Failed to stop driver impersonation' });
        }
        res.json({ success: true });
      });
    } catch (error) {
      console.error('Stop driver impersonation error:', error);
      res.status(500).json({ error: 'Failed to stop driver impersonation' });
    }
  });

  // ==================== Unified People API ====================

  app.get('/api/admin/people', requireAdmin, requirePermission('customers'), async (req: Request, res: Response) => {
    try {
      const role = req.query.role as string | undefined;
      const search = req.query.search as string | undefined;
      const sortBy = req.query.sortBy as string | undefined;
      const sortDir = req.query.sortDir as string | undefined;
      const collectionDay = req.query.collectionDay as string | undefined;
      const transferStatus = req.query.transferStatus as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
      const page = parseInt(req.query.page as string) || 1;
      const offset = (page - 1) * limit;

      const result = await roleRepo.getAllPeoplePaginated({
        role: role || undefined,
        search: search || undefined,
        sortBy,
        sortDir,
        limit,
        offset,
        pickupDay: collectionDay || undefined,
        transferStatus: transferStatus || undefined,
      });

      res.json({
        users: result.users.map((u: any) => ({
          id: u.id,
          firstName: u.first_name,
          lastName: u.last_name,
          email: u.email,
          phone: u.phone,
          roles: u.roles || [],
          isAdmin: (u.roles || []).includes('admin'),
          createdAt: u.created_at,
          locationCount: parseInt(u.property_count) || 0,
          collectionDays: u.pickup_days || [],
          driverRating: u.driver_rating ? parseFloat(u.driver_rating) : null,
          driverOnboardingStatus: u.driver_onboarding_status || null,
          driverJobsCompleted: u.driver_jobs_completed || null,
          driverStripeConnected: u.driver_stripe_connected || false,
        })),
        total: result.total,
        page,
        limit,
      });
    } catch (error) {
      console.error('Get people error:', error);
      res.status(500).json({ error: 'Failed to get people' });
    }
  });

  app.get('/api/admin/people/:userId', requireAdmin, requirePermission('customers'), async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserById(req.params.userId);
      if (!user) {
        return res.status(404).json({ error: 'Person not found' });
      }

      const roles = await roleRepo.getUserRoles(user.id);
      const locations = await storage.getLocationsForUser(user.id);
      let driverProfile = null;
      if (roles.includes('driver')) {
        driverProfile = await storage.getDriverProfileByUserId(user.id);
      }
      const adminRole = roles.includes('admin') ? await roleRepo.getAdminRole(user.id) : null;

      res.json({
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        roles,
        adminRole,
        isAdmin: roles.includes('admin'),
        createdAt: user.created_at,
        locations,
        driverProfile,
      });
    } catch (error) {
      console.error('Get person error:', error);
      res.status(500).json({ error: 'Failed to get person details' });
    }
  });

  app.put('/api/admin/people/:userId/roles', requireAdmin, requirePermission('*'), async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { role, action, adminRole } = req.body;

      if (!role || !action || !['add', 'remove'].includes(action)) {
        return res.status(400).json({ error: 'role and action (add|remove) are required' });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (action === 'add') {
        await roleRepo.addRole(userId, role, req.session.userId, adminRole);
        // If adding driver role, create driver_profile if missing
        if (role === 'driver') {
          const existingProfile = await storage.getDriverProfileByUserId(userId);
          if (!existingProfile) {
            await storage.createDriverProfile({
              userId,
              name: `${user.first_name} ${user.last_name}`.trim(),
            });
          }
        }
      } else {
        await roleRepo.removeRole(userId, role);
      }

      await audit(req, `${action}_role`, 'user', userId, { role, adminRole });

      const updatedRoles = await roleRepo.getUserRoles(userId);
      res.json({ success: true, roles: updatedRoles });
    } catch (error) {
      console.error('Update roles error:', error);
      res.status(500).json({ error: 'Failed to update roles' });
    }
  });

  // Delete a user (full_admin only)
  app.delete('/api/admin/people/:userId', requireAdmin, requirePermission('*'), async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      // Prevent self-deletion
      if (userId === req.session.userId) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userName = `${user.first_name} ${user.last_name}`.trim();

      // Log before deletion (audit_log cascades with user)
      await audit(req, 'delete_user', 'user', userId, { name: userName, email: user.email });

      // Transaction: clean up non-cascading FKs, then delete
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Unlink routes assigned to this user's driver profile
        await client.query(
          `UPDATE routes SET assigned_driver_id = NULL WHERE assigned_driver_id IN (SELECT id FROM driver_profiles WHERE user_id = $1)`,
          [userId]
        );
        // Delete driver_profiles (no ON DELETE CASCADE on user_id FK)
        await client.query('DELETE FROM driver_profiles WHERE user_id = $1', [userId]);
        // Clean invitations (invited_by / accepted_by have no CASCADE)
        await client.query('DELETE FROM invitations WHERE invited_by = $1 OR accepted_by = $1', [userId]);
        // Delete user — CASCADE handles everything else
        await client.query('DELETE FROM users WHERE id = $1', [userId]);
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // Driver list for assignment dropdowns
  app.get('/api/admin/drivers', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const drivers = await storage.getDrivers();
      res.json(drivers.map((d: any) => ({ id: d.id, name: d.name, email: d.user_email, status: d.status || 'active', onboardingStatus: d.onboarding_status })));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch drivers' });
    }
  });

  // Update driver status (suspend, reject, activate)
  app.put('/api/admin/drivers/:id/status', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      const validStatuses = ['active', 'suspended', 'rejected'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }
      await storage.updateDriver(req.params.id, { status });

      // Reactivation: notify and log for manual route/contract review (US-14)
      if (status === 'active') {
        const activeContracts = await pool.query(
          `SELECT id, day_of_week, (SELECT name FROM service_zones WHERE id = route_contracts.zone_id) AS zone_name
           FROM route_contracts WHERE driver_id = $1 AND status = 'active' AND end_date >= CURRENT_DATE`,
          [req.params.id]
        );
        if (activeContracts.rows.length > 0) {
          console.log(`[DriverReactivation] Driver ${req.params.id} reactivated with ${activeContracts.rows.length} active contract(s)`);
          sendDriverNotification(req.params.id, 'Account Reactivated',
            `<p>Your driver account has been reactivated.</p>
             <p>You have ${activeContracts.rows.length} active contract(s). Log in to the team portal to check your schedule.</p>`
          ).catch(() => {});
        }
      }

      // Cascade: unassign future routes when suspending/rejecting a driver (US-3)
      let unassignedCount = 0;
      if (['suspended', 'rejected'].includes(status)) {
        const unassigned = await pool.query(
          `UPDATE routes SET assigned_driver_id = NULL, status = 'open', updated_at = NOW()
           WHERE assigned_driver_id = $1 AND scheduled_date >= CURRENT_DATE AND status IN ('assigned', 'open', 'bidding')
           RETURNING id`,
          [req.params.id]
        );
        unassignedCount = unassigned.rowCount || 0;
        if (unassignedCount > 0) {
          console.log(`[DriverCascade] Unassigned ${unassignedCount} future routes from ${status} driver ${req.params.id}`);
        }
      }

      await audit(req, 'update_driver_status', 'driver', req.params.id, { status, unassignedRoutes: unassignedCount });
      res.json({ success: true, unassignedRoutes: unassignedCount });
    } catch (error) {
      console.error('Failed to update driver status:', error);
      res.status(500).json({ error: 'Failed to update driver status' });
    }
  });

  // On-Demand Services CRUD
  app.get('/api/admin/on-demand-services', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await storage.query('SELECT * FROM on_demand_services ORDER BY name');
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch on-demand services' });
    }
  });

  app.post('/api/admin/on-demand-services', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { name, description, price, icon } = req.body;
      if (!name || price == null) return res.status(400).json({ error: 'name and price are required' });
      const result = await storage.query(
        'INSERT INTO on_demand_services (name, description, price, icon_name) VALUES ($1, $2, $3, $4) RETURNING *',
        [name, description || '', Math.round(price * 100) / 100, icon || null]
      );
      await audit(req, 'create_on_demand_service', 'on_demand_service', result.rows[0].id, { name, price });
      res.status(201).json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create on-demand service' });
    }
  });

  app.put('/api/admin/on-demand-services/:id', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { name, description, price, active, icon } = req.body;
      if (!name || price == null) return res.status(400).json({ error: 'name and price are required' });
      const result = await storage.query(
        'UPDATE on_demand_services SET name=$1, description=$2, price=$3, active=$4, icon_name=$5 WHERE id=$6 RETURNING *',
        [name, description || '', Math.round(price * 100) / 100, active !== false, icon || null, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Service not found' });
      await audit(req, 'update_on_demand_service', 'on_demand_service', req.params.id, { name, price, active });
      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update on-demand service' });
    }
  });

  app.delete('/api/admin/on-demand-services/:id', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const result = await storage.query('DELETE FROM on_demand_services WHERE id=$1 RETURNING id', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Service not found' });
      await audit(req, 'delete_on_demand_service', 'on_demand_service', req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete on-demand service' });
    }
  });

  // ── Address Serviceability Review ──

  app.get('/api/admin/address-reviews', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const locations = await storage.getPendingReviewLocations();
      res.json({
        locations: locations.map(p => ({
          id: p.id,
          address: p.address,
          serviceType: p.service_type,
          customerName: `${p.first_name} ${p.last_name}`,
          customerEmail: p.email,
          customerPhone: p.phone,
          serviceStatus: p.service_status,
          submittedAt: p.created_at,
          notes: p.notes,
          inHoa: p.in_hoa,
          communityName: p.community_name,
          hasGateCode: p.has_gate_code,
          coverageFlaggedAt: p.coverage_flagged_at,
          coverageZoneName: p.coverage_zone_name,
        })),
      });
    } catch (error) {
      console.error('Get address reviews error:', error);
      res.status(500).json({ error: 'Failed to fetch pending reviews' });
    }
  });

  // Bulk approve/deny multiple pending addresses in one request.
  // Each location is processed in its own transaction with row-level locking.
  // On approval: creates Stripe subscriptions + notifies customer.
  app.post('/api/admin/address-reviews/bulk-decision', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { locationIds, decision, notes } = req.body;
      if (!Array.isArray(locationIds) || locationIds.length === 0) {
        return res.status(400).json({ error: 'locationIds must be a non-empty array' });
      }
      if (!decision || !['approved', 'denied', 'waitlist'].includes(decision)) {
        return res.status(400).json({ error: 'decision must be approved, denied, or waitlist' });
      }

      const results: { id: string; success: boolean; error?: string }[] = [];
      for (const locationId of locationIds) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const lockResult = await client.query('SELECT * FROM locations WHERE id = $1 FOR UPDATE', [locationId]);
          const location = lockResult.rows[0];
          if (!location) {
            await client.query('ROLLBACK');
            results.push({ id: locationId, success: false, error: 'Not found' });
            continue;
          }
          // Prevent re-processing approved locations (would double-create subscriptions).
          // Denied locations CAN be reversed.
          if (location.service_status === 'approved' && decision === 'approved') {
            await client.query('ROLLBACK');
            results.push({ id: locationId, success: false, error: 'Already approved' });
            continue;
          }

          await client.query(
            `UPDATE locations SET service_status = $1, service_status_notes = $2, service_status_updated_at = NOW(), updated_at = NOW() WHERE id = $3`,
            [decision, notes || null, locationId]
          );

          // Clear stale collection day data on denial (may have been set by auto-assign before review)
          if (decision === 'denied') {
            await client.query(
              `UPDATE locations SET collection_day = NULL, collection_day_source = NULL, collection_day_detected_at = NULL WHERE id = $1`,
              [locationId]
            );
          }

          // Cancel future route stops for denied/paused/cancelled locations
          if (['denied', 'paused', 'cancelled'].includes(decision)) {
            storage.cancelFutureStopsForLocation(locationId, new Date().toISOString().split('T')[0])
              .then(count => { if (count > 0) console.log(`[Cascade] Cancelled ${count} future stops for ${decision} location ${locationId}`); })
              .catch(err => console.error(`[Cascade] Failed to cancel stops for location ${locationId}:`, err));
          }

          // Only claim/delete pending selections on approval (they become Stripe subscriptions)
          let pendingSelections: DbPendingSelection[] = [];
          if (decision === 'approved') {
            const selResult = await client.query('SELECT * FROM pending_service_selections WHERE location_id = $1', [locationId]);
            pendingSelections = selResult.rows;
            await client.query('DELETE FROM pending_service_selections WHERE location_id = $1', [locationId]);
          }
          await client.query('COMMIT');

          await audit(req, `address_review_${decision}`, 'location', locationId, { notes, bulk: true });

          // Notify customer of status change
          if (location.user_id && ['approved', 'denied', 'paused', 'cancelled'].includes(decision)) {
            sendServiceStatusNotification(location.user_id, location.address, decision).catch(() => {});
          }

          // Activate subscriptions on approval
          if (decision === 'approved' && pendingSelections.length > 0) {
            activatePendingSelections(locationId, location.user_id, {
              source: 'bulk_approval',
              preloadedSelections: pendingSelections,
            }).catch(err => {
              console.error(`Bulk: Failed to activate subscriptions for ${locationId}:`, err);
            });
          }

          // Notify customer of decision
          const hasRental = decision === 'approved' && pendingSelections.some(s => !s.use_sticker);
          const msg = decision === 'approved'
            ? approvalMessage(location.address, location.collection_day, hasRental)
            : decision === 'waitlist'
            ? waitlistMessage(location.address)
            : denialMessage(location.address, notes);
          sendServiceUpdate(location.user_id, msg.subject, msg.body).catch(() => {});

          // Create in-portal notification
          const notifType = decision === 'approved' ? 'address_approved'
            : decision === 'waitlist' ? 'address_waitlisted'
            : 'address_denied';
          storage.createNotification(location.user_id, notifType, msg.subject, msg.body, { locationId }).catch(err => {
            console.error('Failed to create in-portal notification:', err);
          });

          results.push({ id: locationId, success: true });
        } catch (txErr) {
          await client.query('ROLLBACK');
          results.push({ id: locationId, success: false, error: 'Transaction failed' });
        } finally {
          client.release();
        }
      }

      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      // Auto-assign approved locations to contract drivers (fire-and-forget)
      if (decision === 'approved') {
        const approvedIds = results.filter(r => r.success).map(r => r.id);
        if (approvedIds.length > 0) {
          import('./autoAssignmentEngine').then(({ tryAutoAssignBatch }) => {
            tryAutoAssignBatch(approvedIds).then(assignResults => {
              const assigned = assignResults.filter(r => r.assigned).length;
              if (assigned > 0) console.log(`[AutoAssign] Bulk: ${assigned}/${approvedIds.length} locations auto-assigned`);
            }).catch(err => console.error('[AutoAssign] Bulk error:', err));
          }).catch(err => console.error('[AutoAssign] Import error:', err));
        }
      }

      res.json({ results, succeeded, failed });
    } catch (error) {
      console.error('Bulk address review error:', error);
      res.status(500).json({ error: 'Failed to process bulk review' });
    }
  });

  app.post('/api/admin/address-reviews/:locationId/check-feasibility', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const locationId = req.params.locationId as string;
      const location = await storage.getLocationById(locationId);
      if (!location) return res.status(404).json({ error: 'Location not found' });

      const feasibilityResult = await checkRouteFeasibility(location.address, location.id);

      await audit(req, 'check_feasibility', 'location', location.id, feasibilityResult);
      res.json(feasibilityResult);
    } catch (error) {
      console.error('Feasibility check error:', error);
      res.status(500).json({ error: 'Failed to check route feasibility' });
    }
  });

  // Route suggestion for a location (geocode → nearest zone → day detection)
  app.get('/api/admin/address-reviews/:locationId/route-suggestion', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const suggestion = await suggestRoute(req.params.locationId as string);
      res.json({ suggestion });
    } catch (error) {
      console.error('Route suggestion error:', error);
      res.status(500).json({ error: 'Failed to get route suggestion' });
    }
  });

  app.put('/api/admin/address-reviews/:locationId/decision', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const locationId = req.params.locationId as string;
      const { decision, notes } = req.body;
      if (!decision || !['approved', 'denied', 'waitlist'].includes(decision)) {
        return res.status(400).json({ error: 'decision must be approved, denied, or waitlist' });
      }

      // Pre-compute optimal collection day before acquiring lock (geocoding is slow)
      let optimizationResult: Awaited<ReturnType<typeof findOptimalCollectionDay>> = null;
      if (decision === 'approved') {
        try {
          optimizationResult = await findOptimalCollectionDay(locationId);
        } catch (e) {
          console.error('Collection day optimization failed (non-blocking):', e);
        }
      }

      // Hoist for notification after connection is released
      let notifyUserId: string | undefined;
      let notifyAddress: string | undefined;
      let pendingSelections: DbPendingSelection[] = [];

      // Use a dedicated connection with FOR UPDATE to prevent double-approval race condition
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const lockResult = await client.query('SELECT * FROM locations WHERE id = $1 FOR UPDATE', [locationId]);
        const location = lockResult.rows[0];
        if (!location) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Location not found' });
        }
        notifyUserId = location.user_id;
        notifyAddress = location.address;

        // Prevent re-processing approved locations (would double-create subscriptions).
        // Denied locations CAN be reversed (moved back to pending_review/waitlist).
        if (location.service_status === 'approved' && decision === 'approved') {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Location already approved' });
        }

        await client.query(
          `UPDATE locations SET service_status = $1, service_status_notes = $2, service_status_updated_at = NOW(), updated_at = NOW() WHERE id = $3`,
          [decision, notes || null, locationId]
        );

        // Clear stale collection day data on denial (may have been set by auto-assign before review)
        if (decision === 'denied') {
          await client.query(
            `UPDATE locations SET collection_day = NULL, collection_day_source = NULL, collection_day_detected_at = NULL WHERE id = $1`,
            [locationId]
          );
        }

        // Cancel future route stops for denied/paused/cancelled locations
        if (['denied', 'paused', 'cancelled'].includes(decision)) {
          storage.cancelFutureStopsForLocation(locationId, new Date().toISOString().split('T')[0])
            .then(count => { if (count > 0) console.log(`[Cascade] Cancelled ${count} future stops for ${decision} location ${locationId}`); })
            .catch(err => console.error(`[Cascade] Failed to cancel stops for location ${locationId}:`, err));
        }

        // Auto-assign collection day from route insertion optimization
        if (optimizationResult) {
          await client.query(
            `UPDATE locations SET collection_day = $1, collection_day_source = $2, collection_day_detected_at = NOW() WHERE id = $3`,
            [optimizationResult.collection_day, optimizationResult.source || 'route_optimized', locationId]
          );
        }

        // Only claim/delete pending selections on approval (they become Stripe subscriptions)
        // For denied/waitlist: preserve so customer doesn't have to re-select
        if (decision === 'approved') {
          const selResult = await client.query('SELECT * FROM pending_service_selections WHERE location_id = $1', [locationId]);
          pendingSelections = selResult.rows;
          await client.query('DELETE FROM pending_service_selections WHERE location_id = $1', [locationId]);
        }
        await client.query('COMMIT');

        await audit(req, `address_review_${decision}`, 'location', locationId, { notes });

        // Notify customer of status change
        if (notifyUserId && ['approved', 'denied', 'paused', 'cancelled'].includes(decision)) {
          sendServiceStatusNotification(notifyUserId, notifyAddress, decision).catch(() => {});
        }

        // Activate subscriptions on approval (outside transaction -- Stripe is external)
        if (decision === 'approved' && pendingSelections.length > 0) {
          activatePendingSelections(locationId, location.user_id, {
            source: 'admin_approval',
            preloadedSelections: pendingSelections,
          }).catch(err => {
            console.error('Failed to activate subscriptions on approval:', err);
          });
        }
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      // Notify customer of decision (fire-and-forget)
      if (notifyUserId) {
        const hasRental = decision === 'approved' && pendingSelections.some(s => !s.use_sticker);
        const msg = decision === 'approved'
          ? approvalMessage(notifyAddress!, optimizationResult?.collection_day, hasRental)
          : decision === 'waitlist'
          ? waitlistMessage(notifyAddress!)
          : denialMessage(notifyAddress!, notes);
        sendServiceUpdate(notifyUserId, msg.subject, msg.body).catch(err => {
          console.error('Failed to send address review notification:', err);
        });

        // Create in-portal notification
        const notifType = decision === 'approved' ? 'address_approved'
          : decision === 'waitlist' ? 'address_waitlisted'
          : 'address_denied';
        storage.createNotification(notifyUserId, notifType, msg.subject, msg.body, { locationId }).catch(err => {
          console.error('Failed to create in-portal notification:', err);
        });
      }

      // Auto-assign to contract driver's route (fire-and-forget)
      if (decision === 'approved') {
        import('./autoAssignmentEngine').then(({ tryAutoAssignLocation }) => {
          tryAutoAssignLocation(locationId).then(result => {
            if (result.assigned) {
              console.log(`[AutoAssign] Location ${locationId} auto-assigned to route ${result.routeId}`);
            } else {
              console.log(`[AutoAssign] Location ${locationId} not assigned: ${result.reason}${result.details ? ' - ' + result.details : ''}`);
            }
          }).catch(err => console.error('[AutoAssign] Error:', err));
        }).catch(err => console.error('[AutoAssign] Import error:', err));
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Address review decision error:', error);
      res.status(500).json({ error: 'Failed to update address review' });
    }
  });

  // ── System Settings (Integrations) ─────────────────────────────────

  // Allowed setting keys and their metadata
  // displayType drives frontend rendering: text | secret | toggle | file_json | hidden
  type DisplayType = 'text' | 'secret' | 'toggle' | 'file_json' | 'hidden';
  const SETTING_DEFINITIONS: Record<string, { category: string; isSecret: boolean; label: string; displayType: DisplayType }> = {
    // Google OAuth (shared credentials)
    GOOGLE_OAUTH_CLIENT_ID:     { category: 'google_oauth', isSecret: false, label: 'OAuth Client ID',     displayType: 'text' },
    GOOGLE_OAUTH_CLIENT_SECRET: { category: 'google_oauth', isSecret: true,  label: 'OAuth Client Secret', displayType: 'secret' },
    // Gmail
    GMAIL_SERVICE_ACCOUNT_JSON: { category: 'gmail', isSecret: true,  label: 'Service Account JSON',       displayType: 'file_json' },
    GMAIL_SENDER_EMAIL:         { category: 'gmail', isSecret: false, label: 'Sender Email (Service Acct)', displayType: 'text' },
    GMAIL_REFRESH_TOKEN:        { category: 'gmail', isSecret: true,  label: 'OAuth Refresh Token',         displayType: 'secret' },
    GMAIL_AUTH_MODE:            { category: 'gmail', isSecret: false, label: 'Auth Mode',                   displayType: 'hidden' },
    // Google SSO
    GOOGLE_SSO_ENABLED:         { category: 'google_sso', isSecret: false, label: 'Enable Google Sign-In', displayType: 'toggle' },
    // Google Maps
    GOOGLE_MAPS_API_KEY:        { category: 'google_maps', isSecret: true,  label: 'API Key',              displayType: 'secret' },
    // Gemini AI
    GEMINI_API_KEY:             { category: 'gemini', isSecret: true,  label: 'API Key',                    displayType: 'secret' },
    // Twilio
    TWILIO_ACCOUNT_SID:         { category: 'twilio', isSecret: false, label: 'Account SID',               displayType: 'text' },
    TWILIO_AUTH_TOKEN:          { category: 'twilio', isSecret: true,  label: 'Auth Token',                 displayType: 'secret' },
    TWILIO_PHONE_NUMBER:        { category: 'twilio', isSecret: false, label: 'Phone Number',               displayType: 'text' },
    // Stripe
    STRIPE_SECRET_KEY:          { category: 'stripe', isSecret: true,  label: 'Secret Key',                displayType: 'secret' },
    STRIPE_PUBLISHABLE_KEY:     { category: 'stripe', isSecret: false, label: 'Publishable Key',           displayType: 'text' },
    STRIPE_WEBHOOK_SECRET:      { category: 'stripe', isSecret: true,  label: 'Webhook Secret',            displayType: 'secret' },
    // OptimoRoute
    OPTIMOROUTE_API_KEY:        { category: 'optimoroute', isSecret: true,  label: 'API Key',              displayType: 'secret' },
    OPTIMO_SYNC_ENABLED:        { category: 'optimoroute', isSecret: false, label: 'Auto Sync Enabled',    displayType: 'toggle' },
    OPTIMO_SYNC_HOUR:           { category: 'optimoroute', isSecret: false, label: 'Sync Hour (0-23)',     displayType: 'text' },
    OPTIMO_SYNC_WINDOW_DAYS:    { category: 'optimoroute', isSecret: false, label: 'Sync Window (days)',   displayType: 'text' },
    // Collection Day Optimization
    PICKUP_OPTIMIZATION_WINDOW_DAYS: { category: 'optimoroute', isSecret: false, label: 'Optimization Window (days)', displayType: 'text' },
    PICKUP_OPTIMIZATION_METRIC:      { category: 'optimoroute', isSecret: false, label: 'Optimize By (distance/time/both)', displayType: 'text' },
    PICKUP_AUTO_ASSIGN:              { category: 'optimoroute', isSecret: false, label: 'Auto-Assign Collection Day at Signup', displayType: 'toggle' },
    PICKUP_AUTO_APPROVE:             { category: 'optimoroute', isSecret: false, label: 'Auto-Approve Addresses in Zone', displayType: 'toggle' },
    PICKUP_AUTO_APPROVE_MAX_MILES:   { category: 'optimoroute', isSecret: false, label: 'Auto-Approve Max Distance (miles)', displayType: 'text' },
    PICKUP_AUTO_APPROVE_MAX_MINUTES: { category: 'optimoroute', isSecret: false, label: 'Auto-Approve Max Time (minutes)', displayType: 'text' },
    PICKUP_AUTO_APPROVE_USE_FEASIBILITY: { category: 'optimoroute', isSecret: false, label: 'Use Route Feasibility Check', displayType: 'toggle' },
    // Operations
    ZONE_APPROVAL_REQUIRED:     { category: 'operations', isSecret: false, label: 'Require Admin Approval for Driver Zones', displayType: 'toggle' },
    WAITLIST_AUTO_FLAG_ENABLED: { category: 'operations', isSecret: false, label: 'Auto-Flag Waitlisted Locations on Zone Approval', displayType: 'toggle' },
    AUTO_ASSIGN_NEW_LOCATIONS: { category: 'operations', isSecret: false, label: 'Auto-Assign New Locations to Contract Drivers', displayType: 'toggle' },
    AUTO_EXPIRE_CONTRACTS:    { category: 'operations', isSecret: false, label: 'Auto-Expire Contracts Past End Date', displayType: 'toggle' },
    AUTO_REOPEN_EXPIRED_CONTRACTS: { category: 'operations', isSecret: false, label: 'Auto-Reopen Expired Contracts as Opportunities', displayType: 'toggle' },
    AUTO_GENERATE_CONTRACT_ROUTES: { category: 'operations', isSecret: false, label: 'Auto-Generate Routes for Active Contracts', displayType: 'toggle' },
    AUTO_SWAP_ENABLED:             { category: 'operations', isSecret: false, label: 'Auto-Swap Providers for Efficiency', displayType: 'toggle' },
    AUTO_ACCEPT_BIDS:              { category: 'operations', isSecret: false, label: 'Auto-Accept Best Bid After Window', displayType: 'toggle' },
    BID_WINDOW_HOURS:              { category: 'operations', isSecret: false, label: 'Bid Window for Advance Routes (hours)', displayType: 'text' },
    SAME_DAY_BID_WINDOW_MINUTES:   { category: 'operations', isSecret: false, label: 'Bid Window for Same-Day Routes (minutes)', displayType: 'text' },
    ZONE_ASSIGNMENT_DEADLINE_HOURS:     { category: 'operations', isSecret: false, label: 'Zone Assignment Deadline (hours)',  displayType: 'text' },
    ZONE_AUTO_ASSIGN_CONFLICT_STRATEGY: { category: 'operations', isSecret: false, label: 'Multi-Zone Conflict Strategy',     displayType: 'text' },
    // Billing
    SKIP_CREDIT_AMOUNT_CENTS:   { category: 'billing', isSecret: false, label: 'Skip Credit Amount (cents)', displayType: 'text' },
    // App Config
    APP_DOMAIN:                 { category: 'app', isSecret: false, label: 'App Domain',                   displayType: 'text' },
    CORS_ORIGIN:                { category: 'app', isSecret: false, label: 'CORS Origin',                  displayType: 'text' },
    AUTO_FIX_ERRORS:            { category: 'app', isSecret: false, label: 'Auto-Fix Errors (Claude)',     displayType: 'toggle' },
    // Slack
    SLACK_WEBHOOK_URL:          { category: 'slack', isSecret: true,  label: 'Webhook URL',                  displayType: 'secret' },
    // Marketplace
    SURGE_PRICING_ENABLED:      { category: 'operations', isSecret: false, label: 'Surge Pricing',              displayType: 'toggle' },
    // Weather
    OPENWEATHERMAP_API_KEY:     { category: 'weather', isSecret: true,  label: 'API Key',                    displayType: 'secret' },
    WEATHER_LOCATION:           { category: 'weather', isSecret: false, label: 'Location (lat,lon)',          displayType: 'text' },
  };

  app.get('/api/admin/settings', requireAdmin, async (req: Request, res: Response) => {
    try {
      const dbSettings = await getAllSettings();
      const dbMap = new Map(dbSettings.map(s => [s.key, s]));

      // Build full list from SETTING_DEFINITIONS (canonical source of truth).
      // Category and display_type always come from the definition, not the DB row,
      // so category renames take effect without a migration.
      const settings = Object.entries(SETTING_DEFINITIONS).map(([key, def]) => {
        const db = dbMap.get(key);
        if (db) {
          return { ...db, category: def.category, label: def.label, display_type: def.displayType };
        }
        // Not in DB — show env var value (masked if secret)
        const envVal = process.env[key] || '';
        return {
          key,
          value: def.isSecret && envVal ? '••••••' + envVal.slice(-4) : envVal,
          category: def.category,
          is_secret: def.isSecret,
          label: def.label,
          display_type: def.displayType,
          source: 'env' as const,
          updated_at: null,
        };
      });

      res.json(settings);
    } catch (error) {
      console.error('Get settings error:', error);
      res.status(500).json({ error: 'Failed to load settings' });
    }
  });

  app.put('/api/admin/settings', requireAdmin, requirePermission('*'), async (req: Request, res: Response) => {
    try {
      const { key, value } = req.body;
      if (!key || value === undefined || value === null) {
        return res.status(400).json({ error: 'key and value are required' });
      }

      const def = SETTING_DEFINITIONS[key];
      if (!def) {
        return res.status(400).json({ error: `Unknown setting: ${key}` });
      }

      const userId = req.session.userId!;
      await saveSetting(key, value, def.category, def.isSecret, userId);
      await audit(req, 'update_setting', 'system_settings', key, { category: def.category });

      res.json({ success: true });
    } catch (error) {
      console.error('Update setting error:', error);
      res.status(500).json({ error: 'Failed to update setting' });
    }
  });

  // ── Integration Status Checks ──

  app.get('/api/admin/integrations/status', requireAdmin, async (req: Request, res: Response) => {
    try {
      const target = req.query.integration as string | undefined;
      const mode = req.query.mode as string | undefined;
      if (target) {
        const result = await testSingleIntegration(target, mode ? { mode } : undefined);
        return res.json({ results: { [target]: result } });
      }
      const results = await testAllIntegrations();
      res.json({ results });
    } catch (error) {
      console.error('Integration status check error:', error);
      res.status(500).json({ error: 'Failed to check integration status' });
    }
  });

  // ── Gmail OAuth Authorization Flow ──

  function getGmailRedirectUri(req: Request): string {
    const appDomain = process.env.APP_DOMAIN;
    if (appDomain) return `${appDomain}/api/admin/gmail/callback`;
    const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:5000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    return `${protocol}://${host}/api/admin/gmail/callback`;
  }

  app.get('/api/admin/gmail/authorize', requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return res.status(400).json({ error: 'Set OAuth Client ID and Client Secret first' });
      }

      const redirectUri = getGmailRedirectUri(req);
      const oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUri);

      const state = crypto.randomBytes(32).toString('hex');
      req.session.gmailOAuthState = state;

      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Session error' });
        }

        const authUrl = oauth2Client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: ['https://www.googleapis.com/auth/gmail.send'],
          state,
        });

        res.json({ url: authUrl });
      });
    } catch (error) {
      console.error('Gmail authorize error:', error);
      res.status(500).json({ error: 'Failed to generate authorization URL' });
    }
  });

  app.get('/api/admin/gmail/callback', requireAdmin, async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;
      const error = req.query.error as string;

      if (error || !code) {
        return res.redirect('/admin/settings?gmail_auth=denied');
      }

      const expectedState = req.session.gmailOAuthState;
      delete req.session.gmailOAuthState;

      if (!expectedState || state !== expectedState) {
        return res.redirect('/admin/settings?gmail_auth=state_mismatch');
      }

      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return res.redirect('/admin/settings?gmail_auth=missing_credentials');
      }

      const redirectUri = getGmailRedirectUri(req);
      const oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUri);

      const { tokens } = await oauth2Client.getToken(code);
      if (!tokens.refresh_token) {
        return res.redirect('/admin/settings?gmail_auth=no_refresh_token');
      }

      // Save the refresh token via settings system
      const userId = req.session.userId!;
      await saveSetting('GMAIL_REFRESH_TOKEN', tokens.refresh_token, 'gmail', true, userId);

      req.session.save(() => {
        res.redirect('/admin/settings?gmail_auth=success');
      });
    } catch (error) {
      console.error('Gmail callback error:', error);
      res.redirect('/admin/settings?gmail_auth=error');
    }
  });

  // ============================================================
  // Compensation Rules CRUD
  // ============================================================

  app.get('/api/admin/compensation-rules', requireAdmin, requirePermission('operations'), async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM compensation_rules ORDER BY rule_type, priority DESC, created_at DESC`
      );
      res.json({
        rules: rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          ruleType: r.rule_type,
          conditions: r.conditions,
          rateAmount: r.rate_amount != null ? Number(r.rate_amount) : null,
          rateMultiplier: Number(r.rate_multiplier),
          priority: r.priority,
          active: r.active,
          effectiveFrom: r.effective_from,
          effectiveTo: r.effective_to,
          createdBy: r.created_by,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      });
    } catch (err: any) {
      console.error('Error fetching compensation rules:', err);
      res.status(500).json({ error: 'Failed to fetch compensation rules' });
    }
  });

  app.post('/api/admin/compensation-rules', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { name, ruleType, conditions, rateAmount, rateMultiplier, priority, active, effectiveFrom, effectiveTo } = req.body;
      if (!name || !ruleType) {
        return res.status(400).json({ error: 'name and ruleType are required' });
      }
      const validTypes = ['base_rate', 'service_type_modifier', 'difficulty_modifier', 'zone_modifier'];
      if (!validTypes.includes(ruleType)) {
        return res.status(400).json({ error: `ruleType must be one of: ${validTypes.join(', ')}` });
      }
      if (effectiveFrom && effectiveTo && new Date(effectiveFrom) > new Date(effectiveTo)) {
        return res.status(400).json({ error: 'effectiveFrom must be before effectiveTo' });
      }
      const { rows } = await pool.query(
        `INSERT INTO compensation_rules (name, rule_type, conditions, rate_amount, rate_multiplier, priority, active, effective_from, effective_to, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [name, ruleType, JSON.stringify(conditions || {}), rateAmount ?? null, rateMultiplier ?? 1.0, priority ?? 0, active !== false, effectiveFrom ?? null, effectiveTo ?? null, req.session.userId]
      );
      const r = rows[0];
      await audit(req, 'create_compensation_rule', 'compensation_rule', r.id, { name, ruleType });
      res.status(201).json({
        rule: {
          id: r.id, name: r.name, ruleType: r.rule_type, conditions: r.conditions,
          rateAmount: r.rate_amount != null ? Number(r.rate_amount) : null,
          rateMultiplier: Number(r.rate_multiplier), priority: r.priority, active: r.active,
          effectiveFrom: r.effective_from, effectiveTo: r.effective_to,
          createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
        },
      });
    } catch (err: any) {
      console.error('Error creating compensation rule:', err);
      res.status(500).json({ error: 'Failed to create compensation rule' });
    }
  });

  app.put('/api/admin/compensation-rules/:id', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { name, ruleType, conditions, rateAmount, rateMultiplier, priority, active, effectiveFrom, effectiveTo } = req.body;
      if (effectiveFrom && effectiveTo && new Date(effectiveFrom) > new Date(effectiveTo)) {
        return res.status(400).json({ error: 'effectiveFrom must be before effectiveTo' });
      }
      const { rows } = await pool.query(
        `UPDATE compensation_rules SET
           name = COALESCE($1, name),
           rule_type = COALESCE($2, rule_type),
           conditions = COALESCE($3, conditions),
           rate_amount = $4,
           rate_multiplier = COALESCE($5, rate_multiplier),
           priority = COALESCE($6, priority),
           active = COALESCE($7, active),
           effective_from = $8,
           effective_to = $9,
           updated_at = NOW()
         WHERE id = $10 RETURNING *`,
        [name, ruleType, conditions ? JSON.stringify(conditions) : null, rateAmount ?? null, rateMultiplier, priority, active, effectiveFrom ?? null, effectiveTo ?? null, req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
      const r = rows[0];
      await audit(req, 'update_compensation_rule', 'compensation_rule', r.id, { name: r.name });
      res.json({
        rule: {
          id: r.id, name: r.name, ruleType: r.rule_type, conditions: r.conditions,
          rateAmount: r.rate_amount != null ? Number(r.rate_amount) : null,
          rateMultiplier: Number(r.rate_multiplier), priority: r.priority, active: r.active,
          effectiveFrom: r.effective_from, effectiveTo: r.effective_to,
          createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
        },
      });
    } catch (err: any) {
      console.error('Error updating compensation rule:', err);
      res.status(500).json({ error: 'Failed to update compensation rule' });
    }
  });

  app.delete('/api/admin/compensation-rules/:id', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM compensation_rules WHERE id = $1`, [req.params.id]);
      if (rowCount === 0) return res.status(404).json({ error: 'Rule not found' });
      await audit(req, 'delete_compensation_rule', 'compensation_rule', req.params.id, {});
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error deleting compensation rule:', err);
      res.status(500).json({ error: 'Failed to delete compensation rule' });
    }
  });

  // Compensation rules — preview impact across sample locations
  app.get('/api/admin/compensation-rules/preview', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { zoneId, limit: lim = '20' } = req.query;
      const limitNum = Math.min(parseInt(lim as string) || 20, 50);

      const params: any[] = [limitNum];
      const zoneFilter = zoneId ? `AND l.zone_id = $2` : '';
      if (zoneId) params.push(zoneId);

      const { rows: locations } = await pool.query(
        `SELECT l.id, l.address, l.service_type, l.zone_id,
                COALESCE(l.difficulty_score, 1.0) AS difficulty_score,
                l.custom_rate,
                sz.name AS zone_name
         FROM locations l
         LEFT JOIN service_zones sz ON l.zone_id = sz.id
         WHERE l.service_status = 'approved' AND l.collection_day IS NOT NULL
         ${zoneFilter}
         ORDER BY l.created_at DESC
         LIMIT $1`,
        params
      );

      const rules = await getActiveRules();

      const results = locations.map((loc: any) => {
        const locCtx = {
          id: loc.id,
          address: loc.address || '',
          service_type: loc.service_type || 'residential',
          difficulty_score: parseFloat(loc.difficulty_score) || 1.0,
          custom_rate: loc.custom_rate != null ? parseFloat(loc.custom_rate) : null,
          zone_id: loc.zone_id,
        };
        const breakdown = calculateStopCompensation(locCtx, null, rules);
        return {
          id: loc.id,
          address: loc.address,
          serviceType: loc.service_type,
          zoneId: loc.zone_id,
          zoneName: loc.zone_name,
          difficultyScore: parseFloat(loc.difficulty_score),
          customRate: loc.custom_rate != null ? Number(loc.custom_rate) : null,
          breakdown,
        };
      });

      const rates = results.map((r: any) => r.breakdown.finalRate);
      const totalLocationsResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM locations WHERE service_status = 'approved' AND collection_day IS NOT NULL ${zoneFilter}`,
        zoneId ? [zoneId] : []
      );

      res.json({
        locations: results,
        summary: {
          avgRate: rates.length > 0 ? Math.round((rates.reduce((a: number, b: number) => a + b, 0) / rates.length) * 100) / 100 : 0,
          minRate: rates.length > 0 ? Math.min(...rates) : 0,
          maxRate: rates.length > 0 ? Math.max(...rates) : 0,
          sampledCount: results.length,
          totalLocations: totalLocationsResult.rows[0].count,
        },
      });
    } catch (err: any) {
      console.error('Error previewing compensation rules:', err);
      res.status(500).json({ error: 'Failed to preview compensation rules' });
    }
  });

  // ============================================================
  // Route Valuation Endpoints
  // ============================================================

  app.get('/api/admin/routes/:id/valuation', requireAdmin, async (req, res) => {
    try {
      const valuation = await calculateRouteValuation(req.params.id as string);
      res.json({ valuation });
    } catch (err: any) {
      console.error('Error calculating route valuation:', err);
      res.status(500).json({ error: 'Failed to calculate route valuation' });
    }
  });

  app.post('/api/admin/routes/:id/recalculate', requireAdmin, async (req, res) => {
    try {
      const valuation = await recalculateRouteValue(req.params.id as string);
      res.json({ valuation });
    } catch (err: any) {
      console.error('Error recalculating route value:', err);
      res.status(500).json({ error: 'Failed to recalculate route value' });
    }
  });

  app.get('/api/admin/locations/:id/compensation-preview', requireAdmin, async (req, res) => {
    try {
      const contractId = req.query.contractId as string | undefined;
      const breakdown = await previewLocationCompensation(req.params.id as string, contractId);
      res.json({ breakdown });
    } catch (err: any) {
      console.error('Error previewing location compensation:', err);
      res.status(500).json({ error: 'Failed to preview compensation' });
    }
  });

  // ============================================================
  // Route Contracts CRUD
  // ============================================================

  app.get('/api/admin/contracts', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const zoneId = req.query.zoneId as string | undefined;
      const driverId = req.query.driverId as string | undefined;

      let where = 'WHERE 1=1';
      const params: any[] = [];
      if (status) { params.push(status); where += ` AND rc.status = $${params.length}`; }
      if (zoneId) { params.push(zoneId); where += ` AND rc.zone_id = $${params.length}`; }
      if (driverId) { params.push(driverId); where += ` AND rc.driver_id = $${params.length}`; }

      const { rows } = await pool.query(
        `SELECT rc.*,
                dp.name AS driver_name,
                sz.name AS zone_name,
                (SELECT COUNT(*) FROM routes r WHERE r.contract_id = rc.id) AS route_count,
                (SELECT COUNT(*) FROM route_stops rs JOIN routes r ON rs.route_id = r.id WHERE r.contract_id = rc.id) AS stop_count,
                (SELECT COALESCE(AVG(r2.computed_value), 0) FROM routes r2 WHERE r2.contract_id = rc.id AND r2.computed_value IS NOT NULL) AS avg_weekly_value
         FROM route_contracts rc
         JOIN driver_profiles dp ON rc.driver_id = dp.id
         JOIN service_zones sz ON rc.zone_id = sz.id
         ${where}
         ORDER BY rc.status ASC, rc.end_date ASC`,
        params
      );

      res.json({
        contracts: rows.map((c: any) => ({
          id: c.id,
          driverId: c.driver_id,
          driverName: c.driver_name,
          zoneId: c.zone_id,
          zoneName: c.zone_name,
          dayOfWeek: c.day_of_week,
          startDate: c.start_date,
          endDate: c.end_date,
          status: c.status,
          perStopRate: c.per_stop_rate != null ? Number(c.per_stop_rate) : null,
          termsNotes: c.terms_notes,
          awardedBy: c.awarded_by,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          routeCount: parseInt(c.route_count) || 0,
          stopCount: parseInt(c.stop_count) || 0,
          computedWeeklyValue: c.avg_weekly_value != null ? Number(parseFloat(c.avg_weekly_value).toFixed(2)) : 0,
        })),
      });
    } catch (err: any) {
      console.error('Error fetching contracts:', err);
      res.status(500).json({ error: 'Failed to fetch contracts' });
    }
  });

  app.post('/api/admin/contracts', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { driverId, zoneId, dayOfWeek, startDate, endDate, perStopRate, termsNotes, status } = req.body;
      if (!driverId || !zoneId || !dayOfWeek || !startDate || !endDate) {
        return res.status(400).json({ error: 'driverId, zoneId, dayOfWeek, startDate, and endDate are required' });
      }
      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      if (!validDays.includes(dayOfWeek.toLowerCase())) {
        return res.status(400).json({ error: `dayOfWeek must be one of: ${validDays.join(', ')}` });
      }

      // Check for existing active contract on same zone+day with overlapping date range (US-23)
      const existing = await pool.query(
        `SELECT id FROM route_contracts
         WHERE zone_id = $1 AND day_of_week = $2 AND status = 'active'
           AND start_date <= $4 AND end_date >= $3`,
        [zoneId, dayOfWeek.toLowerCase(), startDate, endDate]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'An active contract with overlapping dates already exists for this zone and day', existingContractId: existing.rows[0].id });
      }

      const { rows } = await pool.query(
        `INSERT INTO route_contracts (driver_id, zone_id, day_of_week, start_date, end_date, per_stop_rate, terms_notes, status, awarded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [driverId, zoneId, dayOfWeek.toLowerCase(), startDate, endDate, perStopRate ?? null, termsNotes ?? null, status || 'active', req.session.userId]
      );
      const c = rows[0];
      await audit(req, 'create_contract', 'route_contract', c.id, { driverId, zoneId, dayOfWeek, startDate, endDate });
      res.status(201).json({
        contract: {
          id: c.id, driverId: c.driver_id, zoneId: c.zone_id, dayOfWeek: c.day_of_week,
          startDate: c.start_date, endDate: c.end_date, status: c.status,
          perStopRate: c.per_stop_rate != null ? Number(c.per_stop_rate) : null,
          termsNotes: c.terms_notes, awardedBy: c.awarded_by,
          createdAt: c.created_at, updatedAt: c.updated_at,
        },
      });
    } catch (err: any) {
      console.error('Error creating contract:', err);
      res.status(500).json({ error: 'Failed to create contract' });
    }
  });

  app.put('/api/admin/contracts/:id', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { endDate, perStopRate, termsNotes, status } = req.body;
      const { rows } = await pool.query(
        `UPDATE route_contracts SET
           end_date = COALESCE($1, end_date),
           per_stop_rate = $2,
           terms_notes = COALESCE($3, terms_notes),
           status = COALESCE($4, status),
           updated_at = NOW()
         WHERE id = $5 RETURNING *`,
        [endDate, perStopRate ?? null, termsNotes, status, req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Contract not found' });
      const c = rows[0];
      await audit(req, 'update_contract', 'route_contract', c.id, { endDate, perStopRate, termsNotes, status });
      res.json({
        contract: {
          id: c.id, driverId: c.driver_id, zoneId: c.zone_id, dayOfWeek: c.day_of_week,
          startDate: c.start_date, endDate: c.end_date, status: c.status,
          perStopRate: c.per_stop_rate != null ? Number(c.per_stop_rate) : null,
          termsNotes: c.terms_notes, awardedBy: c.awarded_by,
          createdAt: c.created_at, updatedAt: c.updated_at,
        },
      });
    } catch (err: any) {
      console.error('Error updating contract:', err);
      res.status(500).json({ error: 'Failed to update contract' });
    }
  });

  app.delete('/api/admin/contracts/:id', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      // Soft terminate — don't hard delete, set status to 'terminated'
      const { rows } = await pool.query(
        `UPDATE route_contracts SET status = 'terminated', updated_at = NOW() WHERE id = $1
         RETURNING *, (SELECT name FROM service_zones WHERE id = route_contracts.zone_id) AS zone_name`,
        [req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Contract not found' });
      const contract = rows[0];

      // Unassign future routes linked to this contract
      const futureRoutes = await pool.query(
        `UPDATE routes SET status = 'open', assigned_driver_id = NULL, contract_id = NULL, updated_at = NOW()
         WHERE contract_id = $1 AND scheduled_date > CURRENT_DATE AND status IN ('draft', 'assigned')
         RETURNING id`,
        [req.params.id]
      );
      const unassignedCount = futureRoutes.rows.length;

      // Notify driver
      sendDriverNotification(contract.driver_id,
        'Contract Terminated',
        `<p>Your contract for <strong>${contract.zone_name || 'Zone'} - ${contract.day_of_week}</strong> has been terminated.</p>
         ${unassignedCount > 0 ? `<p>${unassignedCount} future route(s) have been unassigned.</p>` : ''}`
      ).catch(err => console.error('[ContractTerminate] Notification error:', err));

      await audit(req, 'terminate_contract', 'route_contract', contract.id, { unassignedRoutes: unassignedCount });
      res.json({ success: true, contract: { id: contract.id, status: contract.status }, unassignedRoutes: unassignedCount });
    } catch (err: any) {
      console.error('Error terminating contract:', err);
      res.status(500).json({ error: 'Failed to terminate contract' });
    }
  });

  // Renew a contract (extend end_date, optionally update rate/terms)
  app.post('/api/admin/contracts/:id/renew', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { newEndDate, perStopRate, termsNotes } = req.body;
      if (!newEndDate) return res.status(400).json({ error: 'newEndDate is required' });

      const existing = await pool.query(
        `SELECT rc.*, sz.name AS zone_name FROM route_contracts rc
         LEFT JOIN service_zones sz ON rc.zone_id = sz.id
         WHERE rc.id = $1`, [req.params.id]
      );
      if (existing.rows.length === 0) return res.status(404).json({ error: 'Contract not found' });
      const contract = existing.rows[0];

      if (!['active', 'expired'].includes(contract.status)) {
        return res.status(400).json({ error: `Cannot renew a ${contract.status} contract` });
      }

      const updates: string[] = [`end_date = $1`, `expiry_warned_at = NULL`, `updated_at = NOW()`];
      const params: any[] = [newEndDate];
      let idx = 2;

      if (contract.status === 'expired') {
        updates.push(`status = 'active'`);
      }
      if (perStopRate !== undefined) {
        updates.push(`per_stop_rate = $${idx++}`);
        params.push(perStopRate);
      }
      if (termsNotes !== undefined) {
        updates.push(`terms_notes = $${idx++}`);
        params.push(termsNotes);
      }
      params.push(req.params.id);

      const { rows } = await pool.query(
        `UPDATE route_contracts SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
        params
      );

      // Notify driver
      sendDriverNotification(contract.driver_id,
        'Contract Renewed',
        `<p>Your contract for <strong>${contract.zone_name || 'Zone'} - ${contract.day_of_week}</strong> has been renewed until <strong>${newEndDate}</strong>.</p>`
      ).catch(err => console.error('[ContractRenew] Notification error:', err));

      await audit(req, 'renew_contract', 'route_contract', req.params.id, { newEndDate, perStopRate, termsNotes });
      res.json({ success: true, contract: rows[0] });
    } catch (err: any) {
      console.error('Error renewing contract:', err);
      res.status(500).json({ error: 'Failed to renew contract' });
    }
  });

  // ============================================================
  // Coverage Requests (admin management)
  // ============================================================

  app.get('/api/admin/coverage-requests', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const statusFilter = req.query.status as string | undefined;
      const contractFilter = req.query.contractId as string | undefined;
      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;
      if (statusFilter) { conditions.push(`cr.status = $${idx++}`); params.push(statusFilter); }
      if (contractFilter) { conditions.push(`cr.contract_id = $${idx++}`); params.push(contractFilter); }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const { rows } = await pool.query(
        `SELECT cr.*, rc.day_of_week, sz.name AS zone_name,
                req_dp.name AS requesting_driver_name,
                sub_dp.name AS substitute_driver_name
         FROM coverage_requests cr
         JOIN route_contracts rc ON cr.contract_id = rc.id
         LEFT JOIN service_zones sz ON rc.zone_id = sz.id
         LEFT JOIN driver_profiles req_dp ON cr.requesting_driver_id = req_dp.id
         LEFT JOIN driver_profiles sub_dp ON cr.substitute_driver_id = sub_dp.id
         ${where}
         ORDER BY cr.coverage_date DESC`,
        params
      );
      res.json({
        data: rows.map((r: any) => ({
          id: r.id,
          contractId: r.contract_id,
          requestingDriverId: r.requesting_driver_id,
          requestingDriverName: r.requesting_driver_name,
          coverageDate: r.coverage_date,
          reason: r.reason,
          reasonNotes: r.reason_notes,
          substituteDriverId: r.substitute_driver_id,
          substituteDriverName: r.substitute_driver_name,
          substitutePay: r.substitute_pay != null ? Number(r.substitute_pay) : null,
          status: r.status,
          dayOfWeek: r.day_of_week,
          zoneName: r.zone_name,
          reviewedBy: r.reviewed_by,
          createdAt: r.created_at,
        })),
      });
    } catch (err: any) {
      console.error('Error fetching coverage requests:', err);
      res.status(500).json({ error: 'Failed to fetch coverage requests' });
    }
  });

  app.put('/api/admin/coverage-requests/:id', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { status, substituteDriverId, substitutePay } = req.body;
      if (!status || !['approved', 'filled', 'denied'].includes(status)) {
        return res.status(400).json({ error: 'status must be approved, filled, or denied' });
      }

      const existing = await pool.query(
        `SELECT cr.*, rc.driver_id AS contract_driver_id, rc.day_of_week, rc.zone_id,
                sz.name AS zone_name
         FROM coverage_requests cr
         JOIN route_contracts rc ON cr.contract_id = rc.id
         LEFT JOIN service_zones sz ON rc.zone_id = sz.id
         WHERE cr.id = $1`,
        [req.params.id]
      );
      if (existing.rows.length === 0) return res.status(404).json({ error: 'Coverage request not found' });
      const request = existing.rows[0];

      const updates: string[] = [`status = $1`, `reviewed_by = $2`];
      const params: any[] = [status, (req.session as any).userId];
      let idx = 3;

      if (status === 'filled') {
        if (!substituteDriverId) return res.status(400).json({ error: 'substituteDriverId required when filling' });
        updates.push(`substitute_driver_id = $${idx++}`);
        params.push(substituteDriverId);
        if (substitutePay != null) {
          updates.push(`substitute_pay = $${idx++}`);
          params.push(substitutePay);
        }
      }
      params.push(req.params.id);

      const { rows } = await pool.query(
        `UPDATE coverage_requests SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
        params
      );

      // When approved (no substitute yet), unassign the original driver's route so it's not left assigned (US-9)
      if (status === 'approved') {
        const unassigned = await pool.query(
          `UPDATE routes SET assigned_driver_id = NULL, status = 'open', updated_at = NOW()
           WHERE contract_id = $1 AND scheduled_date = $2 AND assigned_driver_id = $3
           RETURNING id`,
          [request.contract_id, request.coverage_date, request.contract_driver_id]
        );
        if ((unassigned.rowCount || 0) > 0) {
          console.log(`[Coverage] Unassigned route ${unassigned.rows[0].id} from approved coverage request ${req.params.id}`);
        }
      }

      // Handle route reassignment when filling coverage
      if (status === 'filled' && substituteDriverId) {
        const routeResult = await pool.query(
          `SELECT id FROM routes WHERE contract_id = $1 AND scheduled_date = $2 LIMIT 1`,
          [request.contract_id, request.coverage_date]
        );
        if (routeResult.rows.length > 0) {
          await pool.query(
            `UPDATE routes SET assigned_driver_id = $1, updated_at = NOW() WHERE id = $2`,
            [substituteDriverId, routeResult.rows[0].id]
          );
        }

        // Notify substitute driver
        sendDriverNotification(substituteDriverId,
          'Coverage Assignment',
          `<p>You have been assigned to cover <strong>${request.zone_name || 'a zone'} - ${request.day_of_week}</strong> on <strong>${request.coverage_date}</strong>.</p>
           ${substitutePay ? `<p>Pay: $${Number(substitutePay).toFixed(2)}</p>` : ''}`
        ).catch(err => console.error('[Coverage] Substitute notification error:', err));
      }

      // Notify requesting driver of decision
      const statusMsg = status === 'approved' ? 'approved' : status === 'filled' ? 'filled with a substitute' : 'denied';
      sendDriverNotification(request.requesting_driver_id,
        `Coverage Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        `<p>Your coverage request for <strong>${request.zone_name || 'Zone'} - ${request.day_of_week}</strong> on <strong>${request.coverage_date}</strong> has been <strong>${statusMsg}</strong>.</p>`
      ).catch(err => console.error('[Coverage] Requester notification error:', err));

      await audit(req, `coverage_${status}`, 'coverage_request', req.params.id, { substituteDriverId, substitutePay });
      res.json({ success: true, data: rows[0] });
    } catch (err: any) {
      console.error('Error updating coverage request:', err);
      res.status(500).json({ error: 'Failed to update coverage request' });
    }
  });

  // ============================================================
  // Contract Performance & Dashboard
  // ============================================================

  app.get('/api/admin/contracts/:id/performance', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const contractId = req.params.id;

      const metrics = await pool.query(
        `SELECT
           COUNT(r.id)::int AS total_routes,
           COUNT(r.id) FILTER (WHERE r.status = 'completed')::int AS completed_routes,
           COALESCE(SUM(COALESCE(sc.stop_count, 0)), 0)::int AS total_stops,
           COALESCE(SUM(COALESCE(dc.done_count, 0)), 0)::int AS completed_stops,
           COALESCE(SUM(r.computed_value) FILTER (WHERE r.status = 'completed'), 0)::numeric AS total_compensation,
           COALESCE(AVG(r.computed_value), 0)::numeric AS avg_route_value
         FROM routes r
         LEFT JOIN (SELECT route_id, COUNT(*) AS stop_count FROM route_stops WHERE status != 'cancelled' GROUP BY route_id) sc ON sc.route_id = r.id
         LEFT JOIN (SELECT route_id, COUNT(*) AS done_count FROM route_stops WHERE status IN ('completed', 'failed') GROUP BY route_id) dc ON dc.route_id = r.id
         WHERE r.contract_id = $1`,
        [contractId]
      );

      const coverageCount = await pool.query(
        'SELECT COUNT(*)::int AS count FROM coverage_requests WHERE contract_id = $1',
        [contractId]
      );

      const m = metrics.rows[0];
      const totalRoutes = m.total_routes || 0;
      const completedRoutes = m.completed_routes || 0;

      res.json({
        data: {
          totalRoutes,
          completedRoutes,
          completionRate: totalRoutes > 0 ? Number((completedRoutes / totalRoutes).toFixed(4)) : 0,
          totalStops: m.total_stops,
          completedStops: m.completed_stops,
          stopCompletionRate: m.total_stops > 0 ? Number((m.completed_stops / m.total_stops).toFixed(4)) : 0,
          totalCompensation: Number(parseFloat(m.total_compensation).toFixed(2)),
          avgRouteValue: Number(parseFloat(m.avg_route_value).toFixed(2)),
          coverageRequestCount: coverageCount.rows[0].count,
        },
      });
    } catch (err: any) {
      console.error('Error fetching contract performance:', err);
      res.status(500).json({ error: 'Failed to fetch performance metrics' });
    }
  });

  app.get('/api/admin/contracts/dashboard', requireAdmin, requirePermission('operations'), async (_req, res) => {
    try {
      const counts = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'active')::int AS active_count,
           COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
           COUNT(*) FILTER (WHERE status = 'expired')::int AS expired_count,
           COUNT(*) FILTER (WHERE status = 'active' AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')::int AS expiring_count
         FROM route_contracts`
      );

      const pendingCoverage = await pool.query(
        `SELECT COUNT(*)::int AS count FROM coverage_requests WHERE status = 'pending'`
      );

      const expiringContracts = await pool.query(
        `SELECT rc.id, rc.driver_id, rc.day_of_week, rc.end_date, rc.per_stop_rate,
                dp.name AS driver_name, sz.name AS zone_name
         FROM route_contracts rc
         JOIN driver_profiles dp ON rc.driver_id = dp.id
         LEFT JOIN service_zones sz ON rc.zone_id = sz.id
         WHERE rc.status = 'active'
           AND rc.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
         ORDER BY rc.end_date ASC`
      );

      const c = counts.rows[0];
      res.json({
        data: {
          activeCount: c.active_count,
          pendingCount: c.pending_count,
          expiredCount: c.expired_count,
          expiringCount: c.expiring_count,
          pendingCoverageCount: pendingCoverage.rows[0].count,
          expiringContracts: expiringContracts.rows.map((r: any) => ({
            id: r.id,
            driverName: r.driver_name,
            zoneName: r.zone_name,
            dayOfWeek: r.day_of_week,
            endDate: r.end_date,
            perStopRate: r.per_stop_rate != null ? Number(r.per_stop_rate) : null,
          })),
        },
      });
    } catch (err: any) {
      console.error('Error fetching contracts dashboard:', err);
      res.status(500).json({ error: 'Failed to fetch dashboard' });
    }
  });

  // ============================================================
  // Auto-Assignment Activity Log
  // ============================================================

  app.get('/api/admin/auto-assignment-log', requireAdmin, async (req, res) => {
    try {
      const { assigned, reason, days = '7', limit: lim = '50', offset: off = '0' } = req.query;
      const params: any[] = [];
      const conditions: string[] = [];

      // Date range filter
      const daysNum = parseInt(days as string) || 7;
      params.push(daysNum);
      conditions.push(`aal.created_at >= NOW() - ($${params.length} || ' days')::interval`);

      if (assigned === 'true') { conditions.push('aal.assigned = true'); }
      else if (assigned === 'false') { conditions.push('aal.assigned = false'); }

      if (reason) { params.push(reason); conditions.push(`aal.reason = $${params.length}`); }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limitNum = Math.min(parseInt(lim as string) || 50, 100);
      const offsetNum = parseInt(off as string) || 0;

      params.push(limitNum, offsetNum);
      const limitIdx = params.length - 1;
      const offsetIdx = params.length;

      const [dataResult, countResult] = await Promise.all([
        pool.query(
          `SELECT aal.*, l.address AS location_address,
                  dp.name AS driver_name, sz.name AS zone_name
           FROM auto_assignment_log aal
           LEFT JOIN locations l ON aal.location_id = l.id
           LEFT JOIN route_contracts rc ON aal.contract_id = rc.id
           LEFT JOIN driver_profiles dp ON rc.driver_id = dp.id
           LEFT JOIN service_zones sz ON rc.zone_id = sz.id
           ${where}
           ORDER BY aal.created_at DESC
           LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
          params
        ),
        pool.query(`SELECT COUNT(*)::int AS total FROM auto_assignment_log aal ${where}`, params.slice(0, -2)),
      ]);

      const total = countResult.rows[0].total;
      const assignedCount = await pool.query(
        `SELECT COUNT(*)::int AS count FROM auto_assignment_log
         WHERE created_at >= NOW() - ($1 || ' days')::interval AND assigned = true`,
        [daysNum]
      );

      res.json({
        data: dataResult.rows.map((r: any) => ({
          id: r.id,
          locationId: r.location_id,
          locationAddress: r.location_address,
          contractId: r.contract_id,
          routeId: r.route_id,
          assigned: r.assigned,
          reason: r.reason,
          details: r.details,
          compensation: r.compensation != null ? Number(r.compensation) : null,
          capacityWarning: r.capacity_warning,
          driverName: r.driver_name,
          zoneName: r.zone_name,
          createdAt: r.created_at,
        })),
        total,
        assignedCount: assignedCount.rows[0].count,
      });
    } catch (err: any) {
      console.error('Error fetching auto-assignment log:', err);
      res.status(500).json({ error: 'Failed to fetch assignment log' });
    }
  });

  // ============================================================
  // Contract Opportunities & Applications (RC1 — award workflow)
  // ============================================================

  // List opportunities (with application counts)
  app.get('/api/admin/contract-opportunities', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const statusFilter = req.query.status as string | undefined;
      const conditions = statusFilter ? `WHERE co.status = $1` : '';
      const params = statusFilter ? [statusFilter] : [];
      const { rows } = await pool.query(
        `SELECT co.*,
                sz.name AS zone_name,
                (SELECT COUNT(*) FROM contract_applications ca WHERE ca.opportunity_id = co.id) AS application_count
         FROM contract_opportunities co
         JOIN service_zones sz ON co.zone_id = sz.id
         ${conditions}
         ORDER BY co.created_at DESC`,
        params
      );
      res.json({
        opportunities: rows.map((o: any) => ({
          id: o.id,
          zoneId: o.zone_id,
          zoneName: o.zone_name,
          dayOfWeek: o.day_of_week,
          startDate: o.start_date,
          durationMonths: o.duration_months,
          proposedPerStopRate: o.proposed_per_stop_rate != null ? Number(o.proposed_per_stop_rate) : null,
          requirements: o.requirements || {},
          status: o.status,
          awardedContractId: o.awarded_contract_id,
          discoveryRouteId: o.discovery_route_id,
          createdAt: o.created_at,
          applicationCount: parseInt(o.application_count),
        })),
      });
    } catch (err: any) {
      console.error('Error fetching opportunities:', err);
      res.status(500).json({ error: 'Failed to fetch opportunities' });
    }
  });

  // Create opportunity
  app.post('/api/admin/contract-opportunities', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { zoneId, dayOfWeek, startDate, durationMonths, proposedPerStopRate, requirements } = req.body;
      if (!zoneId || !dayOfWeek || !startDate || !durationMonths) {
        return res.status(400).json({ error: 'zoneId, dayOfWeek, startDate, and durationMonths are required' });
      }
      const userId = (req.session as any).userId;
      const { rows } = await pool.query(
        `INSERT INTO contract_opportunities (zone_id, day_of_week, start_date, duration_months, proposed_per_stop_rate, requirements, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [zoneId, dayOfWeek, startDate, durationMonths, proposedPerStopRate ?? null, JSON.stringify(requirements || {}), userId]
      );
      const o = rows[0];
      await audit(req, 'create_contract_opportunity', 'contract_opportunity', o.id, { zoneId, dayOfWeek });

      // Notify drivers whose active zones match this zone + day
      try {
        const { rows: matchingDrivers } = await pool.query(
          `SELECT DISTINCT dzs.driver_id
           FROM driver_zone_selections dzs
           WHERE dzs.zone_id = $1 AND dzs.status = 'active'`,
          [zoneId]
        );
        const rateText = proposedPerStopRate != null ? ` at $${Number(proposedPerStopRate).toFixed(2)}/stop` : '';
        for (const { driver_id } of matchingDrivers) {
          sendDriverNotification(
            driver_id,
            `New Contract Opportunity — ${dayOfWeek}s`,
            `<p>A new contract opportunity has been posted for a zone you cover (${dayOfWeek}s${rateText}).</p>
             <p>Log in to the team portal to review and apply.</p>`
          ).catch(() => {/* non-blocking */});
        }
      } catch {
        // Notification failure should not block the response
      }

      res.status(201).json({
        opportunity: {
          id: o.id,
          zoneId: o.zone_id,
          dayOfWeek: o.day_of_week,
          startDate: o.start_date,
          durationMonths: o.duration_months,
          proposedPerStopRate: o.proposed_per_stop_rate != null ? Number(o.proposed_per_stop_rate) : null,
          requirements: o.requirements || {},
          status: o.status,
          createdAt: o.created_at,
        },
      });
    } catch (err: any) {
      console.error('Error creating opportunity:', err);
      res.status(500).json({ error: 'Failed to create opportunity' });
    }
  });

  // Update opportunity (e.g. cancel)
  app.put('/api/admin/contract-opportunities/:id', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { status, proposedPerStopRate, requirements } = req.body;
      const updates: string[] = [];
      const params: any[] = [];
      let idx = 1;
      if (status) { updates.push(`status = $${idx++}`); params.push(status); }
      if (proposedPerStopRate !== undefined) { updates.push(`proposed_per_stop_rate = $${idx++}`); params.push(proposedPerStopRate); }
      if (requirements !== undefined) { updates.push(`requirements = $${idx++}`); params.push(JSON.stringify(requirements)); }
      if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
      params.push(req.params.id);
      const { rows } = await pool.query(
        `UPDATE contract_opportunities SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
        params
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Opportunity not found' });
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error updating opportunity:', err);
      res.status(500).json({ error: 'Failed to update opportunity' });
    }
  });

  // List applications for an opportunity
  app.get('/api/admin/contract-opportunities/:id/applications', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT ca.*, dp.name AS driver_name, dp.rating AS driver_rating
         FROM contract_applications ca
         JOIN driver_profiles dp ON ca.driver_id = dp.id
         WHERE ca.opportunity_id = $1
         ORDER BY ca.created_at ASC`,
        [req.params.id]
      );
      res.json({
        applications: rows.map((a: any) => ({
          id: a.id,
          opportunityId: a.opportunity_id,
          driverId: a.driver_id,
          driverName: a.driver_name,
          driverRating: a.driver_rating != null ? Number(a.driver_rating) : null,
          proposedRate: a.proposed_rate != null ? Number(a.proposed_rate) : null,
          message: a.message,
          driverRatingAtApplication: a.driver_rating_at_application != null ? Number(a.driver_rating_at_application) : null,
          status: a.status,
          createdAt: a.created_at,
        })),
      });
    } catch (err: any) {
      console.error('Error fetching applications:', err);
      res.status(500).json({ error: 'Failed to fetch applications' });
    }
  });

  // Award opportunity to a driver → creates a route contract
  app.post('/api/admin/contract-opportunities/:id/award', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { applicationId, perStopRate, termsNotes } = req.body;
      if (!applicationId) return res.status(400).json({ error: 'applicationId is required' });

      // Fetch opportunity with zone name
      const oppResult = await pool.query(
        `SELECT co.*, sz.name AS zone_name FROM contract_opportunities co LEFT JOIN service_zones sz ON co.zone_id = sz.id WHERE co.id = $1`,
        [req.params.id]
      );
      if (oppResult.rows.length === 0) return res.status(404).json({ error: 'Opportunity not found' });
      const opp = oppResult.rows[0];
      if (opp.status !== 'open') return res.status(400).json({ error: 'Opportunity is not open' });

      // Fetch application
      const appResult = await pool.query(`SELECT * FROM contract_applications WHERE id = $1 AND opportunity_id = $2`, [applicationId, req.params.id]);
      if (appResult.rows.length === 0) return res.status(404).json({ error: 'Application not found' });
      const app_ = appResult.rows[0];

      // Calculate end date from start_date + duration_months
      const endDate = new Date(opp.start_date);
      endDate.setMonth(endDate.getMonth() + opp.duration_months);
      const endDateStr = endDate.toISOString().split('T')[0];

      // Determine per-stop rate: explicit override > application proposed > opportunity proposed
      const finalRate = perStopRate ?? (app_.proposed_rate != null ? Number(app_.proposed_rate) : (opp.proposed_per_stop_rate != null ? Number(opp.proposed_per_stop_rate) : null));

      const userId = (req.session as any).userId;

      // Create the route contract
      const contractResult = await pool.query(
        `INSERT INTO route_contracts (driver_id, zone_id, day_of_week, start_date, end_date, per_stop_rate, terms_notes, awarded_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING *`,
        [app_.driver_id, opp.zone_id, opp.day_of_week, opp.start_date, endDateStr, finalRate, termsNotes || null, userId]
      );
      const contract = contractResult.rows[0];

      // Update opportunity → awarded
      await pool.query(
        `UPDATE contract_opportunities SET status = 'awarded', awarded_contract_id = $1 WHERE id = $2`,
        [contract.id, req.params.id]
      );

      // Accept the winning application, reject others
      await pool.query(`UPDATE contract_applications SET status = 'accepted' WHERE id = $1`, [applicationId]);
      await pool.query(
        `UPDATE contract_applications SET status = 'rejected' WHERE opportunity_id = $1 AND id != $2 AND status = 'pending'`,
        [req.params.id, applicationId]
      );

      await audit(req, 'award_contract_opportunity', 'contract_opportunity', req.params.id, {
        applicationId, contractId: contract.id, driverId: app_.driver_id,
      });

      // Notify winning driver (US-11)
      sendDriverNotification(app_.driver_id, 'Contract Opportunity Awarded',
        `<p>Congratulations! You've been awarded the contract for <strong>${opp.zone_name || 'Zone'} - ${opp.day_of_week}</strong>.</p>
         <p>Start date: ${opp.start_date}, Duration: ${opp.duration_months} months.</p>
         <p>Log in to the team portal to view your contract details.</p>`
      ).catch(err => console.error('[Opportunity] Winner notification error:', err));

      // Notify rejected applicants (US-11)
      pool.query(
        `SELECT driver_id FROM contract_applications WHERE opportunity_id = $1 AND id != $2 AND status = 'rejected'`,
        [req.params.id, applicationId]
      ).then(({ rows }) => {
        for (const ra of rows) {
          sendDriverNotification(ra.driver_id, 'Application Update',
            `<p>The opportunity for <strong>${opp.zone_name || 'Zone'} - ${opp.day_of_week}</strong> has been awarded to another driver.</p>
             <p>Check the team portal for other available opportunities.</p>`
          ).catch(() => {});
        }
      }).catch(() => {});

      res.json({
        contract: {
          id: contract.id,
          driverId: contract.driver_id,
          zoneId: contract.zone_id,
          dayOfWeek: contract.day_of_week,
          startDate: contract.start_date,
          endDate: contract.end_date,
          status: contract.status,
          perStopRate: contract.per_stop_rate != null ? Number(contract.per_stop_rate) : null,
        },
      });
    } catch (err: any) {
      console.error('Error awarding opportunity:', err);
      if (err.constraint === 'idx_rc_unique_active') {
        return res.status(409).json({ error: 'An active contract already exists for this zone+day combination' });
      }
      res.status(500).json({ error: 'Failed to award opportunity' });
    }
  });

  // ============================================================
  // Contract-Based Route Creation
  // ============================================================

  // Create a route for a specific contract + date
  app.post('/api/admin/contracts/:id/create-route', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { scheduledDate } = req.body;
      if (!scheduledDate) return res.status(400).json({ error: 'scheduledDate is required' });

      // Fetch contract with driver + zone info
      const cResult = await pool.query(
        `SELECT rc.*, dp.name AS driver_name, sz.name AS zone_name
         FROM route_contracts rc
         JOIN driver_profiles dp ON rc.driver_id = dp.id
         JOIN service_zones sz ON rc.zone_id = sz.id
         WHERE rc.id = $1`,
        [req.params.id]
      );
      if (cResult.rows.length === 0) return res.status(404).json({ error: 'Contract not found' });
      const contract = cResult.rows[0];
      if (contract.status !== 'active') return res.status(400).json({ error: 'Contract is not active' });

      // Check date falls on the contracted day of week
      const dateObj = new Date(scheduledDate + 'T12:00:00');
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const actualDay = dayNames[dateObj.getDay()];
      if (actualDay !== contract.day_of_week) {
        return res.status(400).json({ error: `Date ${scheduledDate} is a ${actualDay}, but contract is for ${contract.day_of_week}` });
      }

      // Check no existing route for this contract+date
      const existingRoute = await pool.query(
        `SELECT id FROM routes WHERE contract_id = $1 AND scheduled_date = $2`,
        [req.params.id, scheduledDate]
      );
      if (existingRoute.rows.length > 0) {
        return res.status(409).json({ error: 'A route already exists for this contract on that date', routeId: existingRoute.rows[0].id });
      }

      // Create the route
      const title = `${contract.zone_name} - ${contract.day_of_week.charAt(0).toUpperCase() + contract.day_of_week.slice(1)}`;
      const route = await storage.createRoute({
        title,
        scheduled_date: scheduledDate,
        assigned_driver_id: contract.driver_id,
        route_type: 'daily_route',
        zone_id: contract.zone_id,
        source: 'contract',
        status: 'assigned',
      });

      // Link route to contract and set pay_mode to dynamic
      await pool.query(
        `UPDATE routes SET contract_id = $1, pay_mode = 'dynamic' WHERE id = $2`,
        [req.params.id, route.id]
      );

      // Auto-populate stops from locations in this zone with matching collection day
      const locationsResult = await pool.query(
        `SELECT l.id, l.address
         FROM locations l
         WHERE l.zone_id = $1
           AND l.collection_day = $2
           AND l.service_status = 'approved'
         ORDER BY l.address`,
        [contract.zone_id, contract.day_of_week]
      );

      let stopNumber = 1;
      for (const loc of locationsResult.rows) {
        await pool.query(
          `INSERT INTO route_stops (route_id, location_id, order_type, stop_number, status)
           VALUES ($1, $2, 'recurring', $3, 'pending')`,
          [route.id, loc.id, stopNumber++]
        );
      }

      // Recalculate route value if stops were added
      let valuation = null;
      if (locationsResult.rows.length > 0) {
        const { recalculateRouteValue } = await import('./compensationEngine');
        valuation = await recalculateRouteValue(route.id);
      }

      await audit(req, 'create_contract_route', 'route', route.id, { contractId: req.params.id, scheduledDate, stopsAdded: locationsResult.rows.length });

      res.status(201).json({
        route: {
          id: route.id,
          title,
          scheduledDate,
          status: 'assigned',
          driverName: contract.driver_name,
          stopCount: locationsResult.rows.length,
          computedValue: valuation?.computedValue ?? 0,
        },
      });
    } catch (err: any) {
      console.error('Error creating contract route:', err);
      res.status(500).json({ error: 'Failed to create contract route' });
    }
  });

  // Bulk-create routes for a contract over a date range
  app.post('/api/admin/contracts/:id/create-routes-bulk', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { startDate, endDate } = req.body;
      if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate are required' });

      // Fetch contract
      const cResult = await pool.query(
        `SELECT rc.*, dp.name AS driver_name, sz.name AS zone_name
         FROM route_contracts rc
         JOIN driver_profiles dp ON rc.driver_id = dp.id
         JOIN service_zones sz ON rc.zone_id = sz.id
         WHERE rc.id = $1`,
        [req.params.id]
      );
      if (cResult.rows.length === 0) return res.status(404).json({ error: 'Contract not found' });
      const contract = cResult.rows[0];
      if (contract.status !== 'active') return res.status(400).json({ error: 'Contract is not active' });

      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const targetDayIndex = dayNames.indexOf(contract.day_of_week);

      // Find all matching days in the range
      const dates: string[] = [];
      const current = new Date(startDate + 'T12:00:00');
      const end = new Date(endDate + 'T12:00:00');
      while (current <= end) {
        if (current.getDay() === targetDayIndex) {
          dates.push(current.toISOString().split('T')[0]);
        }
        current.setDate(current.getDate() + 1);
      }

      // Check which dates already have routes
      const existingResult = await pool.query(
        `SELECT scheduled_date FROM routes WHERE contract_id = $1 AND scheduled_date = ANY($2)`,
        [req.params.id, dates]
      );
      const existingDates = new Set(existingResult.rows.map((r: any) => {
        const d = r.scheduled_date;
        return typeof d === 'string' ? d.split('T')[0] : new Date(d).toISOString().split('T')[0];
      }));
      const newDates = dates.filter(d => !existingDates.has(d));

      // Fetch locations for this zone+day
      const locationsResult = await pool.query(
        `SELECT l.id FROM locations l
         WHERE l.zone_id = $1 AND l.collection_day = $2 AND l.service_status = 'approved'
         ORDER BY l.address`,
        [contract.zone_id, contract.day_of_week]
      );
      const locationIds = locationsResult.rows.map((l: any) => l.id);

      const created: Array<{ id: string; date: string; stopCount: number }> = [];
      const { recalculateRouteValue } = await import('./compensationEngine');

      for (const date of newDates) {
        const title = `${contract.zone_name} - ${contract.day_of_week.charAt(0).toUpperCase() + contract.day_of_week.slice(1)}`;
        const route = await storage.createRoute({
          title,
          scheduled_date: date,
          assigned_driver_id: contract.driver_id,
          route_type: 'daily_route',
          zone_id: contract.zone_id,
          source: 'contract',
          status: 'assigned',
        });
        await pool.query(`UPDATE routes SET contract_id = $1, pay_mode = 'dynamic' WHERE id = $2`, [req.params.id, route.id]);

        let stopNumber = 1;
        for (const locId of locationIds) {
          await pool.query(
            `INSERT INTO route_stops (route_id, location_id, order_type, stop_number, status) VALUES ($1, $2, 'recurring', $3, 'pending')`,
            [route.id, locId, stopNumber++]
          );
        }

        if (locationIds.length > 0) {
          await recalculateRouteValue(route.id);
        }

        created.push({ id: route.id, date, stopCount: locationIds.length });
      }

      await audit(req, 'bulk_create_contract_routes', 'route_contract', req.params.id, { startDate, endDate, routesCreated: created.length, skipped: existingDates.size });

      res.json({
        routesCreated: created.length,
        skippedDates: existingDates.size,
        routes: created,
      });
    } catch (err: any) {
      console.error('Error bulk creating contract routes:', err);
      res.status(500).json({ error: 'Failed to create routes' });
    }
  });

  // ============================================================
  // Driver Qualification Management (admin side)
  // ============================================================

  app.put('/api/admin/drivers/:id/qualifications', requireAdmin, async (req, res) => {
    try {
      const { equipmentTypes, certifications, maxStopsPerDay, minRatingForAssignment } = req.body;
      const { rows } = await pool.query(
        `UPDATE driver_profiles SET
           equipment_types = COALESCE($1, equipment_types),
           certifications = COALESCE($2, certifications),
           max_stops_per_day = COALESCE($3, max_stops_per_day),
           min_rating_for_assignment = COALESCE($4, min_rating_for_assignment),
           qualifications_verified = TRUE,
           updated_at = NOW()
         WHERE id = $5 RETURNING id, equipment_types, certifications, max_stops_per_day, min_rating_for_assignment, qualifications_verified, qualifications_updated_at`,
        [equipmentTypes ?? null, certifications ?? null, maxStopsPerDay ?? null, minRatingForAssignment ?? null, req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Driver not found' });
      const d = rows[0];
      res.json({
        qualifications: {
          equipmentTypes: d.equipment_types || [],
          certifications: d.certifications || [],
          maxStopsPerDay: d.max_stops_per_day,
          minRatingForAssignment: Number(d.min_rating_for_assignment),
          verified: d.qualifications_verified,
          updatedAt: d.qualifications_updated_at,
        },
      });
    } catch (err: any) {
      console.error('Error updating driver qualifications:', err);
      res.status(500).json({ error: 'Failed to update driver qualifications' });
    }
  });

  app.get('/api/admin/drivers/:id/qualifications', requireAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT equipment_types, certifications, max_stops_per_day, min_rating_for_assignment,
                qualifications_verified, qualifications_updated_at
         FROM driver_profiles WHERE id = $1`,
        [req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Driver not found' });
      const d = rows[0];
      res.json({
        qualifications: {
          equipmentTypes: d.equipment_types || [],
          certifications: d.certifications || [],
          maxStopsPerDay: d.max_stops_per_day,
          minRatingForAssignment: Number(d.min_rating_for_assignment),
          verified: d.qualifications_verified ?? false,
          updatedAt: d.qualifications_updated_at,
        },
      });
    } catch (err: any) {
      console.error('Error fetching driver qualifications:', err);
      res.status(500).json({ error: 'Failed to fetch driver qualifications' });
    }
  });

  // ============================================================
  // Zone Expansion Proposals (Sprint 3, Task 9)
  // ============================================================

  app.get('/api/admin/zone-expansion-proposals', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const params: any[] = [];
      let where = '';
      if (status) { where = 'WHERE zep.status = $1'; params.push(status); }
      const { rows } = await pool.query(
        `SELECT zep.*, dp.name AS driver_name, dp.id AS driver_id
         FROM zone_expansion_proposals zep
         JOIN driver_profiles dp ON dp.id = zep.driver_id
         ${where} ORDER BY zep.created_at DESC`,
        params
      );
      res.json({ proposals: rows.map((r: any) => ({
        id: r.id, driverId: r.driver_id, driverName: r.driver_name,
        proposedZoneName: r.proposed_zone_name, zoneType: r.zone_type,
        centerLat: r.center_lat != null ? Number(r.center_lat) : null,
        centerLng: r.center_lng != null ? Number(r.center_lng) : null,
        radiusMiles: r.radius_miles != null ? Number(r.radius_miles) : null,
        polygonCoords: r.polygon_coords, zipCodes: r.zip_codes,
        daysOfWeek: r.days_of_week, proposedRate: r.proposed_rate != null ? Number(r.proposed_rate) : null,
        notes: r.notes, status: r.status, adminNotes: r.admin_notes,
        convertedOpportunityId: r.converted_opportunity_id, createdAt: r.created_at,
      })) });
    } catch (err: any) {
      console.error('Error listing zone proposals:', err);
      res.status(500).json({ error: 'Failed to list proposals' });
    }
  });

  // Convert proposal to contract opportunity (one-click)
  app.post('/api/admin/zone-expansion-proposals/:id/convert', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { rows: propRows } = await pool.query(
        `SELECT * FROM zone_expansion_proposals WHERE id = $1 AND status = 'pending'`,
        [req.params.id]
      );
      if (propRows.length === 0) return res.status(404).json({ error: 'Proposal not found or not pending' });
      const p = propRows[0];

      // Need a service zone for the opportunity — use the driver's first active zone selection or require zoneId in body
      const { zoneId, startDate, durationMonths } = req.body;
      if (!zoneId) return res.status(400).json({ error: 'zoneId is required to create an opportunity (select the service zone this proposal maps to)' });

      const userId = (req.session as any).userId;
      const { rows: oppRows } = await pool.query(
        `INSERT INTO contract_opportunities (zone_id, day_of_week, start_date, duration_months, proposed_per_stop_rate, status, created_by)
         VALUES ($1, $2, $3, $4, $5, 'open', $6) RETURNING id`,
        [zoneId, (p.days_of_week?.[0] || 'monday'), startDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
          durationMonths || 3, p.proposed_rate, userId]
      );
      const opportunityId = oppRows[0].id;

      await pool.query(
        `UPDATE zone_expansion_proposals SET status = 'converted', converted_opportunity_id = $1, reviewed_by = $2, updated_at = NOW() WHERE id = $3`,
        [opportunityId, userId, req.params.id]
      );

      await audit(req, 'convert_zone_proposal', 'zone_expansion_proposals', req.params.id, { opportunityId });

      // Notify the proposing driver
      sendDriverNotification(p.driver_id, 'Zone Proposal Converted to Opportunity',
        `<p>Your zone expansion proposal "<strong>${p.proposed_zone_name}</strong>" has been accepted and converted to an open contract opportunity.</p>
         <p>Log in to the team portal to apply.</p>`
      ).catch(() => {});

      res.json({ opportunityId });
    } catch (err: any) {
      console.error('Error converting zone proposal:', err);
      res.status(500).json({ error: 'Failed to convert proposal' });
    }
  });

  app.put('/api/admin/zone-expansion-proposals/:id/reject', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { adminNotes } = req.body;
      const userId = (req.session as any).userId;
      const { rows } = await pool.query(
        `UPDATE zone_expansion_proposals SET status = 'rejected', admin_notes = $1, reviewed_by = $2, updated_at = NOW()
         WHERE id = $3 AND status = 'pending' RETURNING driver_id, proposed_zone_name`,
        [adminNotes || null, userId, req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Proposal not found or not pending' });
      sendDriverNotification(rows[0].driver_id, 'Zone Expansion Proposal Update',
        `<p>Your zone proposal "<strong>${rows[0].proposed_zone_name}</strong>" was not approved at this time.</p>
         ${adminNotes ? `<p>Admin note: ${adminNotes}</p>` : ''}`
      ).catch(() => {});
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error rejecting zone proposal:', err);
      res.status(500).json({ error: 'Failed to reject proposal' });
    }
  });

  // ============================================================
  // Contract Renewal Requests (admin)
  // ============================================================

  app.get('/api/admin/contract-renewal-requests', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const statusFilter = req.query.status as string | undefined;
      const { rows } = await pool.query(
        `SELECT crr.id, crr.contract_id, crr.proposed_rate, crr.proposed_end_date, crr.message,
                crr.status, crr.admin_notes, crr.counter_rate, crr.counter_end_date,
                crr.created_at, crr.updated_at,
                dp.name AS driver_name, dp.email AS driver_email,
                sz.name AS zone_name, rc.day_of_week, rc.end_date AS contract_end_date, rc.per_stop_rate AS current_rate
         FROM contract_renewal_requests crr
         JOIN driver_profiles dp ON dp.id = crr.driver_id
         JOIN route_contracts rc ON rc.id = crr.contract_id
         LEFT JOIN service_zones sz ON sz.id = rc.zone_id
         ${statusFilter ? 'WHERE crr.status = $1' : ''}
         ORDER BY crr.created_at DESC`,
        statusFilter ? [statusFilter] : []
      );
      res.json({ renewalRequests: rows });
    } catch (err: any) {
      console.error('Error fetching renewal requests:', err);
      res.status(500).json({ error: 'Failed to fetch renewal requests' });
    }
  });

  app.post('/api/admin/contract-renewal-requests/:id/approve', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { rows: rqRows } = await pool.query(
        `SELECT crr.*, rc.zone_id, rc.custom_zone_id, rc.day_of_week, rc.per_stop_rate,
                rc.start_date, rc.end_date, rc.driver_id,
                sz.name AS zone_name
         FROM contract_renewal_requests crr
         JOIN route_contracts rc ON rc.id = crr.contract_id
         LEFT JOIN service_zones sz ON sz.id = rc.zone_id
         WHERE crr.id = $1`,
        [req.params.id]
      );
      if (rqRows.length === 0) return res.status(404).json({ error: 'Renewal request not found' });
      const rq = rqRows[0];
      if (rq.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

      const newRate = rq.proposed_rate ?? rq.per_stop_rate;
      let newEndDate = rq.proposed_end_date;
      if (!newEndDate) {
        const dur = new Date(rq.end_date).getTime() - new Date(rq.start_date).getTime();
        newEndDate = new Date(new Date(rq.end_date).getTime() + dur).toISOString().split('T')[0];
      }

      // Extend the existing contract (same pattern as POST /api/admin/contracts/:id/renew)
      await pool.query(
        `UPDATE route_contracts SET end_date = $1, per_stop_rate = $2, expiry_warned_at = NULL, status = 'active', updated_at = NOW()
         WHERE id = $3`,
        [newEndDate, newRate, rq.contract_id]
      );
      await pool.query(
        `UPDATE contract_renewal_requests SET status = 'approved', reviewed_by = $1, updated_at = NOW() WHERE id = $2`,
        [req.session.userId, req.params.id]
      );

      sendDriverNotification(rq.driver_id,
        'Contract Renewed',
        `<p>Your renewal request for <strong>${rq.zone_name || 'Zone'} - ${rq.day_of_week}</strong> has been approved. New end date: <strong>${newEndDate}</strong>.</p>`
      ).catch(() => {});
      await audit(req, 'approve_renewal_request', 'contract_renewal_request', req.params.id, { newEndDate, newRate });
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error approving renewal request:', err);
      res.status(500).json({ error: 'Failed to approve' });
    }
  });

  app.post('/api/admin/contract-renewal-requests/:id/counter', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { counterRate, counterEndDate, adminNotes } = req.body;
      if (!counterRate && !counterEndDate) return res.status(400).json({ error: 'Provide at least counterRate or counterEndDate' });

      const { rows: rqRows } = await pool.query(
        `SELECT crr.*, dp.name AS driver_name, dp.id AS driver_id, sz.name AS zone_name, rc.day_of_week
         FROM contract_renewal_requests crr
         JOIN route_contracts rc ON rc.id = crr.contract_id
         JOIN driver_profiles dp ON dp.id = crr.driver_id
         LEFT JOIN service_zones sz ON sz.id = rc.zone_id
         WHERE crr.id = $1`,
        [req.params.id]
      );
      if (rqRows.length === 0) return res.status(404).json({ error: 'Renewal request not found' });
      const rq = rqRows[0];
      if (rq.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

      await pool.query(
        `UPDATE contract_renewal_requests SET status = 'countered', counter_rate = $1, counter_end_date = $2,
          admin_notes = $3, reviewed_by = $4, updated_at = NOW()
         WHERE id = $5`,
        [counterRate ?? null, counterEndDate ?? null, adminNotes ?? null, req.session.userId, req.params.id]
      );

      sendDriverNotification(rq.driver_id,
        'Counter Offer on Renewal Request',
        `<p>Admin has made a counter offer on your renewal request for <strong>${rq.zone_name || 'Zone'} - ${rq.day_of_week}</strong>.` +
        `${counterRate ? ` Proposed rate: <strong>$${counterRate}/stop</strong>.` : ''}` +
        `${counterEndDate ? ` Proposed end date: <strong>${counterEndDate}</strong>.` : ''}` +
        `</p><p>Log in to accept or negotiate further.</p>`
      ).catch(() => {});
      await audit(req, 'counter_renewal_request', 'contract_renewal_request', req.params.id, { counterRate, counterEndDate });
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error countering renewal request:', err);
      res.status(500).json({ error: 'Failed to counter' });
    }
  });

  app.post('/api/admin/contract-renewal-requests/:id/reject', requireAdmin, requirePermission('operations'), async (req, res) => {
    try {
      const { adminNotes } = req.body;
      const { rows: rqRows } = await pool.query(
        `SELECT crr.driver_id, dp.name AS driver_name, sz.name AS zone_name, rc.day_of_week
         FROM contract_renewal_requests crr
         JOIN route_contracts rc ON rc.id = crr.contract_id
         JOIN driver_profiles dp ON dp.id = crr.driver_id
         LEFT JOIN service_zones sz ON sz.id = rc.zone_id
         WHERE crr.id = $1`,
        [req.params.id]
      );
      if (rqRows.length === 0) return res.status(404).json({ error: 'Renewal request not found' });
      const rq = rqRows[0];

      await pool.query(
        `UPDATE contract_renewal_requests SET status = 'rejected', admin_notes = $1, reviewed_by = $2, updated_at = NOW()
         WHERE id = $3`,
        [adminNotes ?? null, req.session.userId, req.params.id]
      );

      sendDriverNotification(rq.driver_id,
        'Renewal Request Rejected',
        `<p>Your renewal request for <strong>${rq.zone_name || 'Zone'} - ${rq.day_of_week}</strong> was not approved.` +
        `${adminNotes ? ` Admin note: ${adminNotes}` : ''}</p>`
      ).catch(() => {});
      await audit(req, 'reject_renewal_request', 'contract_renewal_request', req.params.id, { adminNotes });
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error rejecting renewal request:', err);
      res.status(500).json({ error: 'Failed to reject' });
    }
  });

  // ============================================================
  // Location Requirements Management
  // ============================================================

  app.put('/api/admin/locations/:id/requirements', requireAdmin, async (req, res) => {
    try {
      const { difficultyScore, customRate, requiredEquipment, requiredCertifications, minDriverRating, dayChangePreference } = req.body;
      const { rows } = await pool.query(
        `UPDATE locations SET
           difficulty_score = COALESCE($1, difficulty_score),
           custom_rate = $2,
           required_equipment = COALESCE($3, required_equipment),
           required_certifications = COALESCE($4, required_certifications),
           min_driver_rating = COALESCE($5, min_driver_rating),
           day_change_preference = COALESCE($6, day_change_preference),
           updated_at = NOW()
         WHERE id = $7
         RETURNING id, difficulty_score, custom_rate, required_equipment, required_certifications, min_driver_rating, day_change_preference`,
        [difficultyScore ?? null, customRate ?? null, requiredEquipment ?? null, requiredCertifications ?? null, minDriverRating ?? null, dayChangePreference ?? null, req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Location not found' });
      const l = rows[0];
      res.json({
        requirements: {
          difficultyScore: Number(l.difficulty_score),
          customRate: l.custom_rate != null ? Number(l.custom_rate) : null,
          requiredEquipment: l.required_equipment || [],
          requiredCertifications: l.required_certifications || [],
          minDriverRating: Number(l.min_driver_rating),
          dayChangePreference: l.day_change_preference,
        },
      });
    } catch (err: any) {
      console.error('Error updating location requirements:', err);
      res.status(500).json({ error: 'Failed to update location requirements' });
    }
  });

  app.get('/api/admin/locations/:id/requirements', requireAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT difficulty_score, custom_rate, required_equipment, required_certifications, min_driver_rating, day_change_preference
         FROM locations WHERE id = $1`,
        [req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Location not found' });
      const l = rows[0];
      res.json({
        requirements: {
          difficultyScore: Number(l.difficulty_score || 1.0),
          customRate: l.custom_rate != null ? Number(l.custom_rate) : null,
          requiredEquipment: l.required_equipment || [],
          requiredCertifications: l.required_certifications || [],
          minDriverRating: Number(l.min_driver_rating || 0),
          dayChangePreference: l.day_change_preference || 'flexible',
        },
      });
    } catch (err: any) {
      console.error('Error fetching location requirements:', err);
      res.status(500).json({ error: 'Failed to fetch location requirements' });
    }
  });
}
