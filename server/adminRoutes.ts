import { type Express, type Request, type Response } from 'express';
import { storage } from './storage';
import { getUncachableStripeClient } from './stripeClient';
import { sendPickupReminder, sendBillingAlert, sendServiceUpdate } from './notificationService';
import { requireAdmin } from './middleware';

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
          const customer = await stripe.customers.retrieve(user.stripe_customer_id);
          const subscriptions = await stripe.subscriptions.list({ customer: user.stripe_customer_id });
          const invoices = await stripe.invoices.list({ customer: user.stripe_customer_id, limit: 10 });
          const paymentMethods = await stripe.paymentMethods.list({
            customer: user.stripe_customer_id,
            type: 'card',
          });

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
  app.put('/api/admin/customers/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { firstName, lastName, phone, email, isAdmin } = req.body;
      const user = await storage.getUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const updateData: any = {};
      if (firstName !== undefined) updateData.first_name = firstName;
      if (lastName !== undefined) updateData.last_name = lastName;
      if (phone !== undefined) updateData.phone = phone;
      if (email !== undefined) updateData.email = email;
      if (isAdmin !== undefined) updateData.is_admin = isAdmin;

      await storage.updateUserAdmin(req.params.id, updateData);
      await audit(req, 'edit_customer', 'user', req.params.id as string, updateData);
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

  app.post('/api/admin/customers/:id/notes', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { note, tags } = req.body;
      if (!note) return res.status(400).json({ error: 'Note is required' });
      await storage.createAdminNote(req.params.id, getAdminId(req), note, tags || []);
      await audit(req, 'add_note', 'user', req.params.id as string, { note: note.substring(0, 100) });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create note' });
    }
  });

  app.delete('/api/admin/notes/:noteId', requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteAdminNote(parseInt(req.params.noteId as string), getAdminId(req));
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

  app.put('/api/admin/missed-pickups/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status, resolutionNotes } = req.body;
      await storage.updateMissedPickupStatus(req.params.id, status, resolutionNotes);
      await audit(req, 'resolve_missed_pickup', 'missed_pickup', req.params.id as string, { status, resolutionNotes });
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

  // Bulk notifications
  app.post('/api/admin/bulk-notify', requireAdmin, async (req: Request, res: Response) => {
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
  app.post('/api/admin/billing/create-invoice', requireAdmin, async (req: Request, res: Response) => {
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

  app.post('/api/admin/billing/apply-credit', requireAdmin, async (req: Request, res: Response) => {
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

  app.post('/api/admin/billing/cancel-subscription', requireAdmin, async (req: Request, res: Response) => {
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

  app.post('/api/admin/billing/pause-subscription', requireAdmin, async (req: Request, res: Response) => {
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

  app.post('/api/admin/billing/resume-subscription', requireAdmin, async (req: Request, res: Response) => {
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

  app.post('/api/admin/notify', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { userId, type, data } = req.body;
      if (!userId || !type) {
        return res.status(400).json({ error: 'userId and type are required' });
      }

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
        default:
          return res.status(400).json({ error: 'Invalid notification type' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Admin notify error:', error);
      res.status(500).json({ error: 'Failed to send notification' });
    }
  });

  app.post('/api/admin/impersonate/:userId', requireAdmin, async (req: Request, res: Response) => {
    try {
      const targetUserId = req.params.userId as string;
      const targetUser = await storage.getUserById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const adminUserId = req.session.originalAdminUserId || req.session.userId;
      req.session.originalAdminUserId = adminUserId;
      req.session.impersonatingUserId = targetUserId;
      req.session.userId = targetUserId;

      res.json({ success: true, user: { firstName: targetUser.first_name, lastName: targetUser.last_name, email: targetUser.email } });
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

      res.json({ success: true });
    } catch (error) {
      console.error('Stop impersonation error:', error);
      res.status(500).json({ error: 'Failed to stop impersonation' });
    }
  });
}
