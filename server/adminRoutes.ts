import { type Express, type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import { auth } from '@googleapis/gmail';
import { storage, DbPendingSelection } from './storage';
import { pool } from './db';
import { roleRepo } from './repositories/RoleRepository';
import { getUncachableStripeClient } from './stripeClient';
import { sendPickupReminder, sendBillingAlert, sendServiceUpdate, sendCustomNotification } from './notificationService';
import * as optimo from './optimoRouteClient';
import { getAllSettings, saveSetting } from './settings';
import { testAllIntegrations, testSingleIntegration } from './integrationTests';
import { expenseRepo } from './repositories/ExpenseRepository';
import { billingRepo } from './repositories/BillingRepository';
import { optimizeRouteJob, checkRouteOptimizationStatus } from './optimoSyncService';
import { suggestRoute } from './routeSuggestionService';
import { findOptimalPickupDay } from './pickupDayOptimizer';
import { activatePendingSelections } from './activateSelections';
import { checkRouteFeasibility } from './feasibilityCheck';
import { approvalMessage, denialMessage } from './addressReviewMessages';

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
      const [pendingReviews, pendingMissedPickups, unreadMessages, oldestMissedPickup, oldestReview, noPickupDay] = await Promise.all([
        storage.query(`SELECT COUNT(*) as count FROM properties WHERE service_status = 'pending_review'`),
        storage.query(`SELECT COUNT(*) as count FROM missed_pickup_reports WHERE status = 'pending'`),
        storage.getUnreadCount(adminUserId, 'admin').catch(() => 0),
        storage.query(`SELECT MIN(created_at) as oldest FROM missed_pickup_reports WHERE status = 'pending'`),
        storage.query(`SELECT MIN(created_at) as oldest FROM properties WHERE service_status = 'pending_review'`),
        storage.query(`SELECT COUNT(*) as count FROM properties WHERE service_status = 'approved' AND pickup_day IS NULL`),
      ]);
      const missedPickups = parseInt(pendingMissedPickups.rows[0]?.count || '0');
      const addressReviews = parseInt(pendingReviews.rows[0]?.count || '0');
      const propertiesNeedingPickupDay = parseInt(noPickupDay.rows[0]?.count || '0');
      const oldestMpDate = oldestMissedPickup.rows[0]?.oldest;
      const oldestArDate = oldestReview.rows[0]?.oldest;
      const hoursAgo = (d: string | null) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 3600000) : 0;
      res.json({
        operations: missedPickups,
        dashboard: addressReviews,
        communications: typeof unreadMessages === 'number' ? unreadMessages : parseInt((unreadMessages as any)?.count || '0'),
        missedPickups,
        addressReviews,
        propertiesNeedingPickupDay,
        oldestMissedPickupHours: hoursAgo(oldestMpDate),
        oldestAddressReviewHours: hoursAgo(oldestArDate),
      });
    } catch (error) {
      console.error('Badge counts error:', error);
      res.json({ operations: 0, dashboard: 0, communications: 0, missedPickups: 0, addressReviews: 0 });
    }
  });

  const getAdminId = (req: Request) => req.session.originalAdminUserId || req.session.userId!;

  const audit = async (req: Request, action: string, entityType?: string, entityId?: string, details?: any) => {
    try { await storage.createAuditLog(getAdminId(req), action, entityType, entityId, details); } catch (e) { console.error('Audit log error:', e); }
  };

  app.get('/api/admin/customers', requireAdmin, async (req: Request, res: Response) => {
    try {
      const options = {
        search: (req.query.search as string) || '',
        sortBy: (req.query.sortBy as string) || 'created_at',
        sortDir: (req.query.sortDir as string) || 'desc',
        serviceType: (req.query.serviceType as string) || '',
        hasStripe: (req.query.hasStripe as string) || '',
        limit: parseInt(req.query.limit as string) || 50,
        offset: parseInt(req.query.offset as string) || 0,
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
        propertyCount: parseInt(u.property_count || '0'),
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

      const properties = await storage.getPropertiesForUser(user.id);

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
        properties: properties.map(p => ({
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

  app.get('/api/admin/properties', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const properties = await storage.getAllProperties();
      res.json(properties.map(p => ({
        id: p.id,
        address: p.address,
        serviceType: p.service_type,
        serviceStatus: p.service_status,
        ownerName: p.user_name,
        ownerEmail: p.user_email,
        transferStatus: p.transfer_status,
        zoneId: p.zone_id,
        zoneName: p.zone_name,
        zoneColor: p.zone_color,
        createdAt: p.created_at,
      })));
    } catch (error) {
      console.error('Admin properties error:', error);
      res.status(500).json({ error: 'Failed to fetch properties' });
    }
  });

  app.get('/api/admin/activity', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [recentUsers, recentPickups, recentReferrals] = await Promise.all([
        storage.query(`SELECT id, first_name, last_name, email, created_at FROM users ORDER BY created_at DESC LIMIT 10`),
        storage.query(`SELECT spr.*, u.first_name || ' ' || u.last_name as user_name FROM special_pickup_requests spr LEFT JOIN users u ON spr.user_id = u.id ORDER BY spr.created_at DESC LIMIT 10`),
        storage.query(`SELECT r.*, u.first_name || ' ' || u.last_name as referrer_name FROM referrals r LEFT JOIN users u ON r.referrer_user_id = u.id ORDER BY r.created_at DESC LIMIT 10`),
      ]);

      res.json({
        recentSignups: recentUsers.rows.map(u => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
          email: u.email,
          date: u.created_at,
        })),
        recentPickups: recentPickups.rows.map(p => ({
          id: p.id,
          userName: p.user_name,
          serviceName: p.service_name,
          pickupDate: p.pickup_date,
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
      if (email !== undefined) updateData.email = email;

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
      await storage.deleteAdminNote(parseInt(req.params.noteId), getAdminId(req));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete note' });
    }
  });

  // Analytics
  app.get('/api/admin/analytics/signups', requireAdmin, async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 90;
      const trends = await storage.getSignupTrends(days);
      res.json(trends);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch signup trends' });
    }
  });

  app.get('/api/admin/analytics/revenue', requireAdmin, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const months = parseInt(req.query.months as string) || 6;
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
      const stats = await storage.getPropertyStats();
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
      if (!query || query.length < 2) return res.json({ users: [], properties: [] });
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
        limit: parseInt(req.query.limit as string) || 50,
        offset: parseInt(req.query.offset as string) || 0,
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

  // Missed Pickup Reports
  app.get('/api/admin/missed-pickups', requireAdmin, async (req: Request, res: Response) => {
    try {
      const statusParam = req.query.status as string | undefined;
      const options = {
        status: statusParam && statusParam !== 'all' ? statusParam : undefined,
        limit: parseInt(req.query.limit as string) || 50,
        offset: parseInt(req.query.offset as string) || 0,
      };
      const result = await storage.getMissedPickupReportsAdmin(options);
      res.json({
        reports: result.reports.map((r: any) => ({
          id: r.id,
          propertyId: r.property_id,
          customerName: `${r.first_name} ${r.last_name}`,
          customerEmail: r.email,
          address: r.address,
          pickupDate: r.pickup_date,
          notes: r.notes,
          status: r.status,
          resolutionNotes: r.resolution_notes,
          createdAt: r.created_at,
        })),
        total: result.total,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch missed pickups' });
    }
  });

  app.put('/api/admin/missed-pickups/:id', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { status, resolutionNotes } = req.body;
      await storage.updateMissedPickupStatus(req.params.id, status, resolutionNotes);
      await audit(req, 'resolve_missed_pickup', 'missed_pickup', req.params.id, { status, resolutionNotes });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update missed pickup' });
    }
  });

  // Special Pickup Requests (Schedule Overview)
  app.get('/api/admin/pickup-schedule', requireAdmin, async (req: Request, res: Response) => {
    try {
      const options = {
        status: (req.query.status as string) || undefined,
        limit: parseInt(req.query.limit as string) || 50,
        offset: parseInt(req.query.offset as string) || 0,
      };
      const result = await storage.getSpecialPickupRequestsAdmin(options);
      res.json({
        requests: result.requests.map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          customerName: `${r.first_name} ${r.last_name}`,
          customerEmail: r.email,
          address: r.address,
          serviceName: r.service_name,
          servicePrice: r.service_price,
          pickupDate: r.pickup_date,
          status: r.status,
          notes: r.notes,
          photos: r.photos || [],
          aiEstimate: r.ai_estimate,
          aiReasoning: r.ai_reasoning,
          adminNotes: r.admin_notes,
          assignedDriverId: r.assigned_driver_id,
          cancellationReason: r.cancellation_reason,
          createdAt: r.created_at,
        })),
        total: result.total,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch pickup schedule' });
    }
  });

  // Get single special pickup detail
  app.get('/api/admin/pickup-schedule/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const record = await storage.getSpecialPickupById(req.params.id);
      if (!record) return res.status(404).json({ error: 'Pickup request not found' });
      res.json({
        id: record.id,
        userId: record.user_id,
        customerName: `${record.first_name} ${record.last_name}`,
        customerEmail: record.email,
        customerPhone: record.phone,
        address: record.address,
        serviceName: record.service_name,
        servicePrice: record.service_price,
        pickupDate: record.pickup_date,
        status: record.status,
        notes: record.notes,
        photos: record.photos || [],
        aiEstimate: record.ai_estimate,
        aiReasoning: record.ai_reasoning,
        adminNotes: record.admin_notes,
        assignedDriverId: record.assigned_driver_id,
        cancellationReason: record.cancellation_reason,
        createdAt: record.created_at,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch pickup request' });
    }
  });

  // Update Special Pickup Request (status, notes, driver, price, date)
  app.put('/api/admin/pickup-schedule/:id', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
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
      const existing = await storage.getSpecialPickupById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Pickup request not found' });
      }

      const updates: any = {};
      if (status !== undefined) updates.status = status;
      if (adminNotes !== undefined) updates.adminNotes = adminNotes;
      if (assignedDriverId !== undefined) updates.assignedDriverId = assignedDriverId || null;
      if (pickupDate !== undefined) updates.pickupDate = pickupDate;
      if (servicePrice !== undefined) updates.servicePrice = servicePrice;

      const updated = await storage.updateSpecialPickupRequest(id, updates);

      // Send customer notification on status change
      if (status && status !== existing.status) {
        const messages: Record<string, string> = {
          scheduled: `Your ${existing.service_name} pickup at ${existing.address} has been confirmed and scheduled for ${pickupDate || existing.pickup_date}.`,
          completed: `Your ${existing.service_name} pickup at ${existing.address} has been completed. Thank you!`,
          cancelled: `Your ${existing.service_name} pickup at ${existing.address} has been cancelled.`,
        };
        if (messages[status]) {
          sendServiceUpdate(existing.user_id, `Pickup ${status.charAt(0).toUpperCase() + status.slice(1)}`, messages[status]).catch(e => console.error('Pickup status notification failed:', e));
        }
      }

      // Update OptimoRoute if date changed
      if (pickupDate && pickupDate !== existing.pickup_date) {
        try {
          const orderNo = `SP-${id.substring(0, 8).toUpperCase()}`;
          await optimo.updateOrder(orderNo, { date: pickupDate });
        } catch (e: any) {
          console.error('OptimoRoute date update failed (non-blocking):', e.message);
        }
      }

      await audit(req, 'update_special_pickup', 'special_pickup_request', id, { status, adminNotes, assignedDriverId, pickupDate, servicePrice });
      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update pickup request' });
    }
  });

  // Routes
  app.get('/api/admin/routes', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { route_type, zone_id, status, date_from, date_to } = req.query;
      const routes = await storage.getAllRoutes({
        route_type: route_type as string | undefined,
        zone_id: zone_id as string | undefined,
        status: status as string | undefined,
        date_from: date_from as string | undefined,
        date_to: date_to as string | undefined,
      });
      res.json({ routes });
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

  app.post('/api/admin/routes', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { title, scheduled_date, ...rest } = req.body;
      if (!title || !scheduled_date) {
        return res.status(400).json({ error: 'title and scheduled_date are required' });
      }
      const route = await storage.createRoute({ title, scheduled_date, ...rest });
      await audit(req, 'create_route', 'route', route.id, { title, scheduled_date });
      res.status(201).json({ route });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create route' });
    }
  });

  app.put('/api/admin/routes/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.id as string;
      const existing = await storage.getRouteById(routeId);
      if (!existing) {
        return res.status(404).json({ error: 'Route not found' });
      }
      const { title, description, scheduled_date, start_time, end_time, estimated_stops, estimated_hours, base_pay, status, assigned_driver_id, notes, route_type, zone_id, accepted_bid_id, actual_pay, payment_status } = req.body;
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
          in_progress: ['completed', 'assigned'],
          completed: [],  // terminal state
          cancelled: ['draft'],  // can reopen as draft
        };
        const allowed = VALID_TRANSITIONS[existing.status] || [];
        if (!allowed.includes(status)) {
          return res.status(400).json({
            error: `Cannot transition from "${existing.status}" to "${status}". Allowed: ${allowed.join(', ') || 'none'}`,
          });
        }
      }

      const updated = await storage.updateRoute(routeId, {
        title, description, scheduled_date, start_time, end_time,
        estimated_stops, estimated_hours, base_pay, status, assigned_driver_id, notes,
        route_type, zone_id, accepted_bid_id, actual_pay, payment_status,
      });
      await audit(req, 'update_route', 'route', routeId, req.body);

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

      res.json({ route: updated });
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

  app.post('/api/admin/routes/:id/stops', requireAdmin, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.id as string;
      const { propertyIds, specialPickupIds, missedRedoPropertyIds } = req.body;
      const stops: Array<{ property_id: string; order_type?: string; special_pickup_id?: string }> = [];
      if (propertyIds?.length) {
        for (const pid of propertyIds) {
          stops.push({ property_id: pid, order_type: 'recurring' });
        }
      }
      if (specialPickupIds?.length) {
        for (const spId of specialPickupIds) {
          const sp = await storage.getSpecialPickupById(spId);
          if (sp) {
            stops.push({ property_id: sp.property_id, order_type: 'special', special_pickup_id: spId });
          }
        }
      }
      if (missedRedoPropertyIds?.length) {
        for (const pid of missedRedoPropertyIds) {
          stops.push({ property_id: pid, order_type: 'missed_redo' });
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

  app.delete('/api/admin/routes/:id/stops/:stopId', requireAdmin, async (req: Request, res: Response) => {
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

  // Route Actions
  app.post('/api/admin/routes/:id/publish', requireAdmin, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.id as string;
      const route = await storage.getRouteById(routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });
      if (route.status !== 'draft') return res.status(400).json({ error: 'Only draft routes can be published' });
      const updated = await storage.updateRoute(routeId, { status: 'open' });
      await audit(req, 'publish_route', 'route', routeId, {});
      res.json({ route: updated });
    } catch (error) {
      res.status(500).json({ error: 'Failed to publish route' });
    }
  });

  app.post('/api/admin/routes/:id/assign', requireAdmin, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.id as string;
      const { driverId, bidId, actualPay } = req.body;
      if (!driverId) return res.status(400).json({ error: 'driverId is required' });
      const route = await storage.getRouteById(routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });
      const updated = await storage.updateRoute(routeId, {
        status: 'assigned',
        assigned_driver_id: driverId,
        accepted_bid_id: bidId || undefined,
        actual_pay: actualPay || route.base_pay,
      });
      await audit(req, 'assign_route', 'route', routeId, { driverId, bidId, actualPay });
      res.json({ route: updated });
    } catch (error) {
      console.error('Failed to assign route:', error);
      res.status(500).json({ error: 'Failed to assign route' });
    }
  });

  // Service Zones
  app.get('/api/admin/zones', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const zones = await storage.getAllZones();
      res.json({ zones });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch zones' });
    }
  });

  app.post('/api/admin/zones', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { name, description, center_lat, center_lng, radius_miles, color } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const zone = await storage.createZone({ name, description, center_lat, center_lng, radius_miles, color });
      await audit(req, 'create_zone', 'service_zone', zone.id, { name });
      res.status(201).json({ zone });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create zone' });
    }
  });

  app.put('/api/admin/zones/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const zoneId = req.params.id as string;
      const zone = await storage.updateZone(zoneId, req.body);
      if (!zone) return res.status(404).json({ error: 'Zone not found' });
      await audit(req, 'update_zone', 'service_zone', zoneId, req.body);
      res.json({ zone });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update zone' });
    }
  });

  app.delete('/api/admin/zones/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const zoneId = req.params.id as string;
      await storage.deleteZone(zoneId);
      await audit(req, 'delete_zone', 'service_zone', zoneId, {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete zone' });
    }
  });

  // Bulk-assign (or unassign) a service zone to multiple properties at once
  app.put('/api/admin/properties/bulk-zone', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { propertyIds, zoneId } = req.body;
      if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
        return res.status(400).json({ error: 'propertyIds must be a non-empty array' });
      }
      // zoneId can be null to unassign
      if (zoneId) {
        const zone = await storage.getZoneById(zoneId);
        if (!zone) return res.status(404).json({ error: 'Zone not found' });
      }

      const result = await pool.query(
        `UPDATE properties SET zone_id = $1, updated_at = NOW() WHERE id = ANY($2::uuid[]) RETURNING id`,
        [zoneId || null, propertyIds]
      );

      await audit(req, 'bulk_zone_assign', 'property', null as any, {
        zoneId: zoneId || 'unassigned',
        propertyCount: result.rowCount,
      });

      res.json({ updated: result.rowCount });
    } catch (error) {
      console.error('Bulk zone assign error:', error);
      res.status(500).json({ error: 'Failed to assign zones' });
    }
  });

  // Planning
  app.get('/api/admin/planning/calendar', requireAdmin, async (req: Request, res: Response) => {
    try {
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });
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
      const [properties, specials, existingRoutes] = await Promise.all([
        storage.getPropertiesDueOnDate(date),
        storage.getSpecialPickupsForDate(date),
        storage.getAllRoutes({ date_from: date, date_to: date }),
      ]);
      res.json({ properties, specials, existingRoutes });
    } catch (error) {
      console.error('Failed to fetch planning date:', error);
      res.status(500).json({ error: 'Failed to fetch planning data for date' });
    }
  });

  app.post('/api/admin/planning/auto-group', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { date } = req.body;
      if (!date) return res.status(400).json({ error: 'date is required' });

      const properties = await storage.getPropertiesDueOnDate(date);
      const zones = await storage.getAllZones(true);
      const created: any[] = [];

      // Group properties by zone_id
      const byZone = new Map<string, typeof properties>();
      for (const prop of properties) {
        const key = prop.zone_id || 'unassigned';
        if (!byZone.has(key)) byZone.set(key, []);
        byZone.get(key)!.push(prop);
      }

      for (const [zoneId, zoneProps] of byZone) {
        const zone = zones.find((z: any) => z.id === zoneId);
        const zoneName = zone?.name || 'Unassigned Area';
        const route = await storage.createRoute({
          title: `${zoneName} - ${date}`,
          scheduled_date: date,
          estimated_stops: zoneProps.length,
          zone_id: zoneId === 'unassigned' ? undefined : zoneId,
          route_type: 'daily_route',
          source: 'auto_planned',
          status: 'draft',
        });
        await storage.addRouteStops(
          route.id,
          zoneProps.map((p: any) => ({ property_id: p.id, order_type: 'recurring' }))
        );
        created.push(route);
      }

      // Auto-bundle small special pickups
      const specials = await storage.getSpecialPickupsForDate(date);
      const bulkThreshold = 200; // TODO: make configurable via system_settings
      for (const sp of specials) {
        if (Number(sp.service_price) < bulkThreshold) {
          // Find a matching daily_route draft route for this zone
          const matchingRoute = created.find((r: any) =>
            r.zone_id === sp.zone_id && r.route_type === 'daily_route'
          );
          if (matchingRoute) {
            await storage.addRouteStops(matchingRoute.id, [{
              property_id: sp.property_id,
              order_type: 'special',
              special_pickup_id: sp.id,
            }]);
          }
        } else {
          // Create standalone bulk_pickup route
          const bulkRoute = await storage.createRoute({
            title: `Bulk Pickup - ${sp.customer_name || sp.address}`,
            scheduled_date: date,
            estimated_stops: 1,
            zone_id: sp.zone_id || undefined,
            route_type: 'bulk_pickup',
            source: 'special_pickup',
            special_pickup_id: sp.id,
            base_pay: Number(sp.service_price),
            status: 'draft',
          });
          await storage.addRouteStops(bulkRoute.id, [{
            property_id: sp.property_id,
            order_type: 'special',
            special_pickup_id: sp.id,
          }]);
          created.push(bulkRoute);
        }
      }

      await audit(req, 'auto_group_routes', 'route', null as any, { date, routeCount: created.length });
      res.json({ routes: created });
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

      const zones = await storage.getAllZones(true);
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

        const properties = await storage.getPropertiesDueOnDate(dateStr);
        if (properties.length === 0) { skippedDays++; continue; }

        // Group properties by zone
        const byZone = new Map<string, typeof properties>();
        for (const prop of properties) {
          const key = prop.zone_id || 'unassigned';
          if (!byZone.has(key)) byZone.set(key, []);
          byZone.get(key)!.push(prop);
        }

        for (const [zoneId, zoneProps] of byZone) {
          const zone = zones.find((z: any) => z.id === zoneId);
          const zoneName = zone?.name || 'Unassigned Area';

          // Split into multiple routes if exceeding capacity
          const chunks: typeof zoneProps[] = [];
          if (zoneProps.length > maxStops) {
            for (let c = 0; c < zoneProps.length; c += maxStops) {
              chunks.push(zoneProps.slice(c, c + maxStops));
            }
          } else {
            chunks.push(zoneProps);
          }

          for (let ci = 0; ci < chunks.length; ci++) {
            const chunk = chunks[ci];
            const suffix = chunks.length > 1 ? ` (${String.fromCharCode(65 + ci)})` : '';
            const route = await storage.createRoute({
              title: `${zoneName}${suffix} - ${dateStr}`,
              scheduled_date: dateStr,
              estimated_stops: chunk.length,
              zone_id: zoneId === 'unassigned' ? undefined : zoneId,
              route_type: 'daily_route',
              source: 'auto_planned',
              status: 'draft',
            });
            await storage.addRouteStops(
              route.id,
              chunk.map((p: any) => ({ property_id: p.id, order_type: 'recurring' }))
            );
            routesCreated++;
          }
        }

        // Auto-bundle small special pickups
        const specials = await storage.getSpecialPickupsForDate(dateStr);
        const bulkThreshold = 200;
        for (const sp of specials) {
          if (Number(sp.service_price) >= bulkThreshold) {
            const bulkRoute = await storage.createRoute({
              title: `Bulk Pickup - ${sp.customer_name || sp.address}`,
              scheduled_date: dateStr,
              estimated_stops: 1,
              zone_id: sp.zone_id || undefined,
              route_type: 'bulk_pickup',
              source: 'special_pickup',
              special_pickup_id: sp.id,
              base_pay: Number(sp.service_price),
              status: 'draft',
            });
            await storage.addRouteStops(bulkRoute.id, [{
              property_id: sp.property_id,
              order_type: 'special',
              special_pickup_id: sp.id,
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
      const stops = await storage.getRouteStops(routeId);
      const route = (await storage.getAllRoutes()).find((r: any) => r.id === routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });

      let ordersSynced = 0;
      let ordersSkipped = 0;
      const errors: string[] = [];

      for (const stop of stops) {
        const orderNo = `ROUTE-${routeId.substring(0, 8)}-${stop.property_id.substring(0, 8)}`;
        try {
          await optimo.createOrder({
            orderNo,
            type: 'P',
            date: route.scheduled_date.split('T')[0],
            duration: 8,
            address: stop.address || '',
            locationName: stop.customer_name || '',
            notes: `Route: ${route.title}`,
          });
          // Save order number on the stop for future pull-back
          await storage.updateRouteStop(stop.id, { optimo_order_no: orderNo });
          ordersSynced++;
        } catch (err: any) {
          if (err.message?.includes('already exists')) {
            ordersSkipped++;
          } else {
            errors.push(`${stop.address}: ${err.message}`);
          }
        }
      }

      await storage.markRouteSynced(routeId);
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

        for (const stop of stops) {
          const orderNo = `ROUTE-${route.id.substring(0, 8)}-${stop.property_id.substring(0, 8)}`;
          try {
            await optimo.createOrder({
              orderNo,
              type: 'P',
              date: route.scheduled_date.split('T')[0],
              duration: 8,
              address: stop.address || '',
              locationName: stop.customer_name || '',
              notes: `Route: ${route.title}`,
            });
            await storage.updateRouteStop(stop.id, { optimo_order_no: orderNo });
            routeSynced++;
          } catch (err: any) {
            if (err.message?.includes('already exists')) {
              totalSkipped++;
            } else {
              allErrors.push(`${stop.address}: ${err.message}`);
            }
          }
        }

        totalSynced += routeSynced;
        await storage.markRouteSynced(route.id);
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
      const stopsWithOrders = stops.filter((s: any) => s.optimo_order_no);
      if (stopsWithOrders.length === 0) {
        return res.status(400).json({ error: 'No stops have OptimoRoute order numbers. Sync to Optimo first.' });
      }

      // Fetch routes from OptimoRoute for this date
      const date = route.scheduled_date.split('T')[0];
      const optimoData = await optimo.getRoutes(date);
      const optimoRoutes = optimoData.routes || [];

      // Build a map of orderNo -> { stopNumber, scheduledAt }
      const orderMap = new Map<string, { stopNumber: number; scheduledAt: string }>();
      for (const oRoute of optimoRoutes) {
        for (const oStop of (oRoute.stops || [])) {
          if (oStop.orderNo) {
            orderMap.set(oStop.orderNo, {
              stopNumber: oStop.stopNumber || 0,
              scheduledAt: oStop.scheduledAt || '',
            });
          }
        }
      }

      // Update portal stops with optimized sequence
      let updated = 0;
      for (const stop of stopsWithOrders) {
        const optimoInfo = orderMap.get(stop.optimo_order_no);
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
      const orderNos = stops.filter((s: any) => s.optimo_order_no).map((s: any) => s.optimo_order_no);
      if (orderNos.length === 0) {
        return res.status(400).json({ error: 'No stops have OptimoRoute order numbers.' });
      }

      // Fetch completion details from OptimoRoute
      const completionData = await optimo.getCompletionDetails(orderNos);
      const completionOrders = completionData?.orders || [];

      // Build a map of orderNo -> status
      const statusMap = new Map<string, string>();
      for (const order of completionOrders) {
        if (order.orderNo && order.data?.status) {
          statusMap.set(order.orderNo, order.data.status);
        }
      }

      // Update portal stops with completion status
      let updated = 0;
      for (const stop of stops) {
        if (stop.optimo_order_no) {
          const status = statusMap.get(stop.optimo_order_no);
          if (status && status !== stop.status) {
            const portalStatus = status === 'success' ? 'completed' : status === 'failed' ? 'failed' : status;
            await storage.updateRouteStop(stop.id, { status: portalStatus });
            updated++;
          }
        }
      }

      // If all stops are completed, update route status
      const updatedStops = await storage.getRouteStops(routeId);
      const allCompleted = updatedStops.length > 0 && updatedStops.every((s: any) => s.status === 'completed');
      if (allCompleted && route.status !== 'completed') {
        await storage.updateRoute(routeId, { status: 'completed', completed_at: new Date().toISOString() });
      }

      res.json({ stopsUpdated: updated, totalStops: stops.length });
    } catch (error) {
      console.error('Failed to pull completion from OptimoRoute:', error);
      res.status(500).json({ error: 'Failed to pull completion from OptimoRoute' });
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

      const [routes, cancelled, zones] = await Promise.all([
        storage.getAllRoutes({ date_from: monday, date_to: saturday }),
        storage.getCancelledPickupsForWeek(monday, saturday),
        storage.getAllZones(true),
      ]);

      // Get missing clients for each day (Mon-Sat)
      const missingByDay: Record<string, any[]> = {};
      for (let i = 0; i < 6; i++) {
        const d = new Date(monDate);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        missingByDay[dateStr] = await storage.getMissingClientsForDate(dateStr);
      }

      res.json({ routes, cancelled, missingByDay, zones });
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
      res.json({ routes: created });
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
        limit: parseInt(req.query.limit as string) || 50,
        offset: parseInt(req.query.offset as string) || 0,
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
      res.json({ route: updated });
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
              await sendPickupReminder(userId, data?.address || '', data?.date || '', data?.pickupType || 'Regular');
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
                await sendPickupReminder(uid, data?.address || '', data?.date || '', data?.pickupType || 'Regular');
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
          await storage.bulkUpdateAdminStatus(userIds, true);
          await audit(req, 'bulk_grant_admin', 'system', undefined, { count: userIds.length });
          break;
        case 'revoke_admin':
          await storage.bulkUpdateAdminStatus(userIds, false);
          await audit(req, 'bulk_revoke_admin', 'system', undefined, { count: userIds.length });
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
      const pickupDay = req.query.pickupDay as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const page = parseInt(req.query.page as string) || 1;
      const offset = (page - 1) * limit;

      const result = await roleRepo.getAllPeoplePaginated({
        role: role || undefined,
        search: search || undefined,
        sortBy,
        sortDir,
        limit,
        offset,
        pickupDay: pickupDay || undefined,
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
          propertyCount: parseInt(u.property_count) || 0,
          pickupDays: u.pickup_days || [],
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
      const properties = await storage.getPropertiesForUser(user.id);
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
        properties,
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
      res.json(drivers.map((d: any) => ({ id: d.id, name: d.name, email: d.user_email })));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch drivers' });
    }
  });

  // Special Pickup Services CRUD
  app.get('/api/admin/special-pickup-services', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await storage.query('SELECT * FROM special_pickup_services ORDER BY name');
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch special pickup services' });
    }
  });

  app.post('/api/admin/special-pickup-services', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { name, description, price, icon } = req.body;
      if (!name || price == null) return res.status(400).json({ error: 'name and price are required' });
      const result = await storage.query(
        'INSERT INTO special_pickup_services (name, description, price, icon) VALUES ($1, $2, $3, $4) RETURNING *',
        [name, description || '', Math.round(price * 100) / 100, icon || null]
      );
      await audit(req, 'create_special_service', 'special_pickup_service', result.rows[0].id, { name, price });
      res.status(201).json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create special pickup service' });
    }
  });

  app.put('/api/admin/special-pickup-services/:id', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { name, description, price, active, icon } = req.body;
      if (!name || price == null) return res.status(400).json({ error: 'name and price are required' });
      const result = await storage.query(
        'UPDATE special_pickup_services SET name=$1, description=$2, price=$3, active=$4, icon=$5 WHERE id=$6 RETURNING *',
        [name, description || '', Math.round(price * 100) / 100, active !== false, icon || null, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Service not found' });
      await audit(req, 'update_special_service', 'special_pickup_service', req.params.id, { name, price, active });
      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update special pickup service' });
    }
  });

  app.delete('/api/admin/special-pickup-services/:id', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const result = await storage.query('DELETE FROM special_pickup_services WHERE id=$1 RETURNING id', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Service not found' });
      await audit(req, 'delete_special_service', 'special_pickup_service', req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete special pickup service' });
    }
  });

  // ── Address Serviceability Review ──

  app.get('/api/admin/address-reviews', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const properties = await storage.getPendingReviewProperties();
      res.json({
        properties: properties.map(p => ({
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
        })),
      });
    } catch (error) {
      console.error('Get address reviews error:', error);
      res.status(500).json({ error: 'Failed to fetch pending reviews' });
    }
  });

  // Bulk approve/deny multiple pending addresses in one request.
  // Each property is processed in its own transaction with row-level locking.
  // On approval: creates Stripe subscriptions + notifies customer.
  app.post('/api/admin/address-reviews/bulk-decision', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { propertyIds, decision, notes } = req.body;
      if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
        return res.status(400).json({ error: 'propertyIds must be a non-empty array' });
      }
      if (!decision || !['approved', 'denied'].includes(decision)) {
        return res.status(400).json({ error: 'decision must be approved or denied' });
      }

      const results: { id: string; success: boolean; error?: string }[] = [];
      for (const propertyId of propertyIds) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const lockResult = await client.query('SELECT * FROM properties WHERE id = $1 FOR UPDATE', [propertyId]);
          const property = lockResult.rows[0];
          if (!property) {
            await client.query('ROLLBACK');
            results.push({ id: propertyId, success: false, error: 'Not found' });
            continue;
          }
          if (property.service_status === 'approved' || property.service_status === 'denied') {
            await client.query('ROLLBACK');
            results.push({ id: propertyId, success: false, error: `Already ${property.service_status}` });
            continue;
          }

          await client.query(
            `UPDATE properties SET service_status = $1, service_status_notes = $2, service_status_updated_at = NOW(), updated_at = NOW() WHERE id = $3`,
            [decision, notes || null, propertyId]
          );
          const selResult = await client.query('SELECT * FROM pending_service_selections WHERE property_id = $1', [propertyId]);
          const pendingSelections: DbPendingSelection[] = selResult.rows;
          await client.query('DELETE FROM pending_service_selections WHERE property_id = $1', [propertyId]);
          await client.query('COMMIT');

          await audit(req, `address_review_${decision}`, 'property', propertyId, { notes, bulk: true });

          // Activate subscriptions on approval
          if (decision === 'approved' && pendingSelections.length > 0) {
            activatePendingSelections(propertyId, property.user_id, {
              source: 'bulk_approval',
              preloadedSelections: pendingSelections,
            }).catch(err => {
              console.error(`Bulk: Failed to activate subscriptions for ${propertyId}:`, err);
            });
          }

          // Notify customer of decision
          const msg = decision === 'approved'
            ? approvalMessage(property.address)
            : denialMessage(property.address, notes);
          sendServiceUpdate(property.user_id, msg.subject, msg.body).catch(() => {});

          results.push({ id: propertyId, success: true });
        } catch (txErr) {
          await client.query('ROLLBACK');
          results.push({ id: propertyId, success: false, error: 'Transaction failed' });
        } finally {
          client.release();
        }
      }

      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      res.json({ results, succeeded, failed });
    } catch (error) {
      console.error('Bulk address review error:', error);
      res.status(500).json({ error: 'Failed to process bulk review' });
    }
  });

  app.post('/api/admin/address-reviews/:propertyId/check-feasibility', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const propertyId = req.params.propertyId as string;
      const property = await storage.getPropertyById(propertyId);
      if (!property) return res.status(404).json({ error: 'Property not found' });

      const feasibilityResult = await checkRouteFeasibility(property.address, property.id);

      await audit(req, 'check_feasibility', 'property', property.id, feasibilityResult);
      res.json(feasibilityResult);
    } catch (error) {
      console.error('Feasibility check error:', error);
      res.status(500).json({ error: 'Failed to check route feasibility' });
    }
  });

  // Route suggestion for a property (geocode → nearest zone → day detection)
  app.get('/api/admin/address-reviews/:propertyId/route-suggestion', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const suggestion = await suggestRoute(req.params.propertyId as string);
      res.json({ suggestion });
    } catch (error) {
      console.error('Route suggestion error:', error);
      res.status(500).json({ error: 'Failed to get route suggestion' });
    }
  });

  app.put('/api/admin/address-reviews/:propertyId/decision', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const propertyId = req.params.propertyId as string;
      const { decision, notes } = req.body;
      if (!decision || !['approved', 'denied'].includes(decision)) {
        return res.status(400).json({ error: 'decision must be approved or denied' });
      }

      // Pre-compute optimal pickup day before acquiring lock (geocoding is slow)
      let optimizationResult: Awaited<ReturnType<typeof findOptimalPickupDay>> = null;
      if (decision === 'approved') {
        try {
          optimizationResult = await findOptimalPickupDay(propertyId);
        } catch (e) {
          console.error('Pickup day optimization failed (non-blocking):', e);
        }
      }

      // Hoist for notification after connection is released
      let notifyUserId: string | undefined;
      let notifyAddress: string | undefined;

      // Use a dedicated connection with FOR UPDATE to prevent double-approval race condition
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const lockResult = await client.query('SELECT * FROM properties WHERE id = $1 FOR UPDATE', [propertyId]);
        const property = lockResult.rows[0];
        if (!property) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Property not found' });
        }
        notifyUserId = property.user_id;
        notifyAddress = property.address;

        // Prevent re-processing if already decided
        if (property.service_status === 'approved' || property.service_status === 'denied') {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: `Property already ${property.service_status}` });
        }

        await client.query(
          `UPDATE properties SET service_status = $1, service_status_notes = $2, service_status_updated_at = NOW(), updated_at = NOW() WHERE id = $3`,
          [decision, notes || null, propertyId]
        );

        // Auto-assign zone + pickup day from route insertion optimization
        if (optimizationResult) {
          await client.query(
            `UPDATE properties SET zone_id = $1, pickup_day = $2, pickup_day_source = 'route_optimized', pickup_day_detected_at = NOW() WHERE id = $3`,
            [optimizationResult.zone_id, optimizationResult.pickup_day, propertyId]
          );
        }

        // Fetch and delete pending selections atomically within the transaction
        const selResult = await client.query('SELECT * FROM pending_service_selections WHERE property_id = $1', [propertyId]);
        const pendingSelections: DbPendingSelection[] = selResult.rows;
        await client.query('DELETE FROM pending_service_selections WHERE property_id = $1', [propertyId]);
        await client.query('COMMIT');

        await audit(req, `address_review_${decision}`, 'property', propertyId, { notes });

        // Activate subscriptions on approval (outside transaction — Stripe is external)
        if (decision === 'approved' && pendingSelections.length > 0) {
          activatePendingSelections(propertyId, property.user_id, {
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
        const msg = decision === 'approved'
          ? approvalMessage(notifyAddress!)
          : denialMessage(notifyAddress!, notes);
        sendServiceUpdate(notifyUserId, msg.subject, msg.body).catch(err => {
          console.error('Failed to send address review notification:', err);
        });
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
    // Pickup Day Optimization
    PICKUP_OPTIMIZATION_WINDOW_DAYS: { category: 'optimoroute', isSecret: false, label: 'Optimization Window (days)', displayType: 'text' },
    PICKUP_OPTIMIZATION_METRIC:      { category: 'optimoroute', isSecret: false, label: 'Optimize By (distance/time/both)', displayType: 'text' },
    PICKUP_AUTO_ASSIGN:              { category: 'optimoroute', isSecret: false, label: 'Auto-Assign Pickup Day at Signup', displayType: 'toggle' },
    PICKUP_AUTO_APPROVE:             { category: 'optimoroute', isSecret: false, label: 'Auto-Approve Addresses in Zone', displayType: 'toggle' },
    PICKUP_AUTO_APPROVE_MAX_MILES:   { category: 'optimoroute', isSecret: false, label: 'Auto-Approve Max Distance (miles)', displayType: 'text' },
    PICKUP_AUTO_APPROVE_MAX_MINUTES: { category: 'optimoroute', isSecret: false, label: 'Auto-Approve Max Time (minutes)', displayType: 'text' },
    PICKUP_AUTO_APPROVE_USE_FEASIBILITY: { category: 'optimoroute', isSecret: false, label: 'Use Route Feasibility Check', displayType: 'toggle' },
    // App Config
    APP_DOMAIN:                 { category: 'app', isSecret: false, label: 'App Domain',                   displayType: 'text' },
    CORS_ORIGIN:                { category: 'app', isSecret: false, label: 'CORS Origin',                  displayType: 'text' },
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
        return res.redirect('/admin?tab=system&subtab=integrations&gmail_auth=denied');
      }

      const expectedState = req.session.gmailOAuthState;
      delete req.session.gmailOAuthState;

      if (!expectedState || state !== expectedState) {
        return res.redirect('/admin?tab=system&subtab=integrations&gmail_auth=state_mismatch');
      }

      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return res.redirect('/admin?tab=system&subtab=integrations&gmail_auth=missing_credentials');
      }

      const redirectUri = getGmailRedirectUri(req);
      const oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUri);

      const { tokens } = await oauth2Client.getToken(code);
      if (!tokens.refresh_token) {
        return res.redirect('/admin/settings/?tab=system&subtab=integrations&gmail_auth=no_refresh_token');
      }

      // Save the refresh token via settings system
      const userId = req.session.userId!;
      await saveSetting('GMAIL_REFRESH_TOKEN', tokens.refresh_token, 'gmail', true, userId);

      req.session.save(() => {
        res.redirect('/admin/settings/?tab=system&subtab=integrations&gmail_auth=success');
      });
    } catch (error) {
      console.error('Gmail callback error:', error);
      res.redirect('/admin/settings/?tab=system&subtab=integrations&gmail_auth=error');
    }
  });
}
