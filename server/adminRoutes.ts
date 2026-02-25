import { type Express, type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import { google } from 'googleapis';
import { storage } from './storage';
import { pool } from './db';
import { roleRepo } from './repositories/RoleRepository';
import { getUncachableStripeClient } from './stripeClient';
import { sendPickupReminder, sendBillingAlert, sendServiceUpdate, sendCustomNotification } from './notificationService';
import * as optimo from './optimoRouteClient';
import { getAllSettings, saveSetting } from './settings';
import { testAllIntegrations, testSingleIntegration } from './integrationTests';
import { expenseRepo } from './repositories/ExpenseRepository';

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
        const stripe = await getUncachableStripeClient();

        const balanceTransactions = await stripe.balanceTransactions.list({
          limit: 100,
          created: { gte: Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60 },
          type: 'charge',
        });
        stripeStats.revenue = balanceTransactions.data.reduce((sum: number, t: any) => sum + t.net, 0) / 100;

        const subs = await stripe.subscriptions.list({ status: 'active', limit: 1 });
        stripeStats.activeSubscriptions = subs.data.length > 0 ? (subs as any).total_count || subs.data.length : 0;

        const invoices = await stripe.invoices.list({ status: 'open', limit: 1 });
        stripeStats.openInvoices = invoices.data.length > 0 ? (invoices as any).total_count || invoices.data.length : 0;
      } catch (e) {
        console.error('Error fetching Stripe stats:', e);
      }

      res.json({ ...stats, ...stripeStats });
    } catch (error) {
      console.error('Admin stats error:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
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
        ownerName: p.user_name,
        ownerEmail: p.user_email,
        transferStatus: p.transfer_status,
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
      const options = {
        status: (req.query.status as string) || undefined,
        limit: parseInt(req.query.limit as string) || 50,
        offset: parseInt(req.query.offset as string) || 0,
      };
      const result = await storage.getMissedPickupReports(options);
      res.json({
        reports: result.reports.map((r: any) => ({
          id: r.id,
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
      const result = await storage.getSpecialPickupRequests(options);
      res.json({
        requests: result.requests.map((r: any) => ({
          id: r.id,
          customerName: `${r.first_name} ${r.last_name}`,
          customerEmail: r.email,
          address: r.address,
          serviceName: r.service_name,
          servicePrice: r.service_price,
          pickupDate: r.pickup_date,
          status: r.status,
          createdAt: r.created_at,
        })),
        total: result.total,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch pickup schedule' });
    }
  });

  // Update Special Pickup Request status
  app.put('/api/admin/pickup-schedule/:id', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const validStatuses = ['pending', 'scheduled', 'completed', 'cancelled'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
      }
      const result = await storage.query(
        'UPDATE special_pickup_requests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status',
        [status, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Pickup request not found' });
      }
      res.json({ success: true, id: result.rows[0].id, status: result.rows[0].status });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update pickup request' });
    }
  });

  // Route Jobs
  app.get('/api/admin/jobs', requireAdmin, async (req: Request, res: Response) => {
    try {
      const jobs = await storage.getAllRouteJobs();
      res.json({ jobs });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch jobs' });
    }
  });

  app.get('/api/admin/jobs/:id/bids', requireAdmin, async (req: Request, res: Response) => {
    try {
      const bids = await storage.getJobBids(req.params.id);
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
      console.error('Failed to fetch job bids:', error);
      res.status(500).json({ error: 'Failed to fetch bids' });
    }
  });

  app.post('/api/admin/jobs', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { title, scheduled_date, ...rest } = req.body;
      if (!title || !scheduled_date) {
        return res.status(400).json({ error: 'title and scheduled_date are required' });
      }
      const job = await storage.createRouteJob({ title, scheduled_date, ...rest });
      await audit(req, 'create_job', 'route_job', job.id, { title, scheduled_date });
      res.status(201).json({ job });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create job' });
    }
  });

  app.put('/api/admin/jobs/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const existing = await storage.getJobById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Job not found' });
      }
      const { title, description, area, scheduled_date, start_time, end_time, estimated_stops, estimated_hours, base_pay, status, assigned_driver_id, notes } = req.body;
      if (!title || !scheduled_date) {
        return res.status(400).json({ error: 'title and scheduled_date are required' });
      }
      const updated = await storage.updateJob(req.params.id, {
        title, description, area, scheduled_date, start_time, end_time,
        estimated_stops, estimated_hours, base_pay, status, assigned_driver_id, notes,
      });
      await audit(req, 'update_job', 'route_job', req.params.id, req.body);

      // Auto-sync driver pay expense when job is marked completed
      if (status === 'completed' && existing.status !== 'completed' && base_pay && parseFloat(base_pay) > 0) {
        try {
          await expenseRepo.create({
            category: 'driver_pay',
            description: `Driver pay for: ${title}`,
            amount: parseFloat(base_pay),
            expenseDate: scheduled_date || new Date().toISOString().split('T')[0],
            referenceId: req.params.id as string,
            referenceType: 'route_job',
            createdBy: getAdminId(req),
          });
        } catch (e) {
          console.error('Failed to auto-sync driver pay expense:', e);
        }
      }

      res.json({ job: updated });
    } catch (error) {
      console.error('Failed to update job:', error);
      res.status(500).json({ error: 'Failed to update job' });
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
        jobStatus: (req.query.jobStatus as string) || undefined,
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
          jobId: b.job_id,
          jobTitle: b.job_title,
          jobStatus: b.job_status,
          jobScheduledDate: b.job_scheduled_date,
          jobArea: b.job_area,
          jobBasePay: b.job_base_pay ? Number(b.job_base_pay) : null,
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
        // Unlink route_jobs assigned to this user's driver profile
        await client.query(
          `UPDATE route_jobs SET assigned_driver_id = NULL WHERE assigned_driver_id IN (SELECT id FROM driver_profiles WHERE user_id = $1)`,
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

  app.post('/api/admin/address-reviews/:propertyId/check-feasibility', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const propertyId = req.params.propertyId as string;
      const property = await storage.getPropertyById(propertyId);
      if (!property) return res.status(404).json({ error: 'Property not found' });

      const tempOrderNo = `FEASIBILITY-${property.id.substring(0, 8).toUpperCase()}-${Date.now()}`;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      // Skip weekends
      while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
        tomorrow.setDate(tomorrow.getDate() + 1);
      }
      const dateStr = tomorrow.toISOString().split('T')[0];

      // Step 1: Create temporary order
      await optimo.createOrder({
        orderNo: tempOrderNo,
        type: 'P',
        date: dateStr,
        address: property.address,
        locationName: 'Feasibility Check',
        duration: 10,
        notes: 'Temporary order for address feasibility check',
      });

      // Step 2: Start planning with this order
      const planResult = await optimo.startPlanning({
        date: dateStr,
        useOrders: [tempOrderNo],
        startWith: 'CURRENT',
      });

      let feasibilityResult: { feasible: boolean; reason: string } = { feasible: false, reason: 'unknown' };

      if (planResult.ordersWithInvalidLocation?.includes(tempOrderNo)) {
        feasibilityResult = { feasible: false, reason: 'invalid_address' };
      } else if (planResult.planningId) {
        // Step 3: Poll planning status until complete
        let status = await optimo.getPlanningStatus(planResult.planningId);
        let attempts = 0;
        while (status.status === 'R' && attempts < 30) {
          await new Promise(r => setTimeout(r, 2000));
          status = await optimo.getPlanningStatus(planResult.planningId);
          attempts++;
        }

        if (status.status === 'F') {
          // Step 4: Check if order got scheduled
          const schedInfo = await optimo.getSchedulingInfo(tempOrderNo);
          feasibilityResult = schedInfo.orderScheduled
            ? { feasible: true, reason: 'scheduled' }
            : { feasible: false, reason: 'not_schedulable' };
        } else {
          feasibilityResult = { feasible: false, reason: 'planning_timeout' };
        }
      }

      // Step 5: Cleanup
      try {
        await optimo.deleteOrder(tempOrderNo, true);
      } catch (e) {
        console.error('Failed to cleanup feasibility check order:', e);
      }

      await audit(req, 'check_feasibility', 'property', property.id, feasibilityResult);
      res.json(feasibilityResult);
    } catch (error) {
      console.error('Feasibility check error:', error);
      res.status(500).json({ error: 'Failed to check route feasibility' });
    }
  });

  app.put('/api/admin/address-reviews/:propertyId/decision', requireAdmin, requirePermission('operations'), async (req: Request, res: Response) => {
    try {
      const propertyId = req.params.propertyId as string;
      const { decision, notes } = req.body;
      if (!decision || !['approved', 'denied'].includes(decision)) {
        return res.status(400).json({ error: 'decision must be approved or denied' });
      }

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
        // Prevent re-processing if already decided
        if (property.service_status === 'approved' || property.service_status === 'denied') {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: `Property already ${property.service_status}` });
        }

        await client.query(
          `UPDATE properties SET service_status = $1, service_status_notes = $2, service_status_updated_at = NOW(), updated_at = NOW() WHERE id = $3`,
          [decision, notes || null, propertyId]
        );

        // Fetch and delete pending selections atomically within the transaction
        const selResult = await client.query('SELECT * FROM pending_service_selections WHERE property_id = $1', [propertyId]);
        const pendingSelections = selResult.rows;
        await client.query('DELETE FROM pending_service_selections WHERE property_id = $1', [propertyId]);
        await client.query('COMMIT');

        await audit(req, `address_review_${decision}`, 'property', propertyId, { notes });

        // Activate deferred subscriptions on approval (outside transaction — Stripe is external)
        if (decision === 'approved' && pendingSelections.length > 0) {
          try {
            const stripe = await getUncachableStripeClient();
            const user = await storage.getUserById(property.user_id);
            if (user?.stripe_customer_id) {
              const products = await stripe.products.list({ limit: 100, active: true, expand: ['data.default_price'] });
              const productMap = new Map(products.data.map((p: any) => [p.id, p]));

              for (const sel of pendingSelections) {
                const product = productMap.get(sel.service_id);
                if (product?.default_price?.id) {
                  await stripe.subscriptions.create({
                    customer: user.stripe_customer_id,
                    items: [{ price: product.default_price.id, quantity: sel.quantity }],
                    metadata: {
                      propertyId,
                      equipmentType: sel.use_sticker ? 'own_can' : 'rental',
                    },
                    payment_behavior: 'allow_incomplete',
                  });
                }
              }
            }
          } catch (subError) {
            console.error('Failed to create subscriptions on approval:', subError);
            // Don't fail the approval — subscriptions can be manually created
          }
        }
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      // TODO: Send notification to customer when notification system is ready
      // await sendServiceUpdate(property.user_id, 'Address Review Update',
      //   `Your address at ${property.address} has been ${decision}.`);

      res.json({ success: true });
    } catch (error) {
      console.error('Address review decision error:', error);
      res.status(500).json({ error: 'Failed to update address review' });
    }
  });

  // ── System Settings (Integrations) ─────────────────────────────────

  // Allowed setting keys and their metadata
  const SETTING_DEFINITIONS: Record<string, { category: string; isSecret: boolean; label: string }> = {
    TWILIO_ACCOUNT_SID:       { category: 'twilio', isSecret: false, label: 'Account SID' },
    TWILIO_AUTH_TOKEN:        { category: 'twilio', isSecret: true,  label: 'Auth Token' },
    TWILIO_PHONE_NUMBER:      { category: 'twilio', isSecret: false, label: 'Phone Number' },
    STRIPE_SECRET_KEY:        { category: 'stripe', isSecret: true,  label: 'Secret Key' },
    STRIPE_PUBLISHABLE_KEY:   { category: 'stripe', isSecret: false, label: 'Publishable Key' },
    STRIPE_WEBHOOK_SECRET:    { category: 'stripe', isSecret: true,  label: 'Webhook Secret' },
    GMAIL_SERVICE_ACCOUNT_JSON: { category: 'gmail', isSecret: true,  label: 'Service Account JSON' },
    GMAIL_SENDER_EMAIL:       { category: 'gmail', isSecret: false, label: 'Sender Email (Service Acct)' },
    GOOGLE_OAUTH_CLIENT_ID:   { category: 'gmail', isSecret: false, label: 'OAuth Client ID' },
    GOOGLE_OAUTH_CLIENT_SECRET: { category: 'gmail', isSecret: true,  label: 'OAuth Client Secret' },
    GMAIL_REFRESH_TOKEN:      { category: 'gmail', isSecret: true,  label: 'OAuth Refresh Token' },
    GMAIL_AUTH_MODE:          { category: 'gmail', isSecret: false, label: 'Auth Mode' },
    GOOGLE_MAPS_API_KEY:      { category: 'google_maps', isSecret: true,  label: 'API Key' },
    OPTIMOROUTE_API_KEY:      { category: 'optimoroute', isSecret: true,  label: 'API Key' },
    GEMINI_API_KEY:           { category: 'gemini', isSecret: true,  label: 'API Key' },
    APP_DOMAIN:               { category: 'app', isSecret: false, label: 'App Domain' },
    CORS_ORIGIN:              { category: 'app', isSecret: false, label: 'CORS Origin' },
  };

  app.get('/api/admin/settings', requireAdmin, async (req: Request, res: Response) => {
    try {
      const dbSettings = await getAllSettings();
      const dbMap = new Map(dbSettings.map(s => [s.key, s]));

      // Build full list: DB values first, then fill in env-only values
      const settings = Object.entries(SETTING_DEFINITIONS).map(([key, def]) => {
        const db = dbMap.get(key);
        if (db) {
          return { ...db, label: def.label };
        }
        // Not in DB — show env var value (masked if secret)
        const envVal = process.env[key] || '';
        return {
          key,
          value: def.isSecret && envVal ? '••••••' + envVal.slice(-4) : envVal,
          category: def.category,
          is_secret: def.isSecret,
          label: def.label,
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
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

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
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

      const { tokens } = await oauth2Client.getToken(code);
      if (!tokens.refresh_token) {
        return res.redirect('/admin?tab=system&subtab=integrations&gmail_auth=no_refresh_token');
      }

      // Save the refresh token via settings system
      const userId = req.session.userId!;
      await saveSetting('GMAIL_REFRESH_TOKEN', tokens.refresh_token, 'gmail', true, userId);

      req.session.save(() => {
        res.redirect('/admin?tab=system&subtab=integrations&gmail_auth=success');
      });
    } catch (error) {
      console.error('Gmail callback error:', error);
      res.redirect('/admin?tab=system&subtab=integrations&gmail_auth=error');
    }
  });
}
