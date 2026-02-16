import { type Express, type Request, type Response, type NextFunction } from 'express';
import { storage } from './storage';
import { getUncachableStripeClient } from './stripeClient';
import { sendPickupReminder, sendBillingAlert, sendServiceUpdate } from './notificationService';

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  storage.getUserById(req.session.userId).then(user => {
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  }).catch(() => res.status(500).json({ error: 'Server error' }));
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

  app.get('/api/admin/customers', requireAdmin, async (req: Request, res: Response) => {
    try {
      const search = (req.query.search as string) || '';
      const users = search ? await storage.searchUsers(search) : await storage.getAllUsers();

      const customers = users.map(u => ({
        id: u.id,
        name: `${u.first_name} ${u.last_name}`,
        email: u.email,
        phone: u.phone,
        memberSince: u.member_since,
        stripeCustomerId: u.stripe_customer_id,
        isAdmin: u.is_admin,
        createdAt: u.created_at,
      }));

      res.json(customers);
    } catch (error) {
      console.error('Admin customers error:', error);
      res.status(500).json({ error: 'Failed to fetch customers' });
    }
  });

  app.get('/api/admin/customers/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const properties = await storage.getPropertiesByUserId(user.id);

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

          stripeData = {
            balance: typeof (customer as any).balance === 'number' ? (customer as any).balance / 100 : 0,
            subscriptions: subscriptions.data.map((s: any) => ({
              id: s.id,
              status: s.status,
              currentPeriodEnd: new Date(s.current_period_end * 1000).toISOString(),
              items: s.items.data.map((i: any) => ({
                priceId: i.price.id,
                productName: i.price.nickname || i.price.id,
                amount: i.price.unit_amount / 100,
                interval: i.price.recurring?.interval,
              })),
            })),
            invoices: invoices.data.map((inv: any) => ({
              id: inv.id,
              number: inv.number,
              amount: (inv.amount_due || inv.total || 0) / 100,
              status: inv.status,
              created: new Date(inv.created * 1000).toISOString(),
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
}
