import express, { type Express, type Request, type Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { storage } from './storage';
import { getUncachableStripeClient, getStripePublishableKey } from './stripeClient';
import * as optimoRoute from './optimoRouteClient';
import { requireAuth } from './middleware';
import { sendPauseResumeConfirmation } from './notificationService';

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

const REFERRAL_CREDIT_AMOUNT = 1000;

/** Look up or create a Stripe customer for the given user, persisting the ID. */
async function ensureStripeCustomerId(user: { id: string; email: string; first_name: string; last_name: string; phone: string | null; stripe_customer_id: string | null }, stripe: any): Promise<string> {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const existing = await stripe.customers.list({ email: user.email, limit: 1 });
  let customerId: string;
  if (existing.data.length > 0) {
    customerId = existing.data[0].id;
  } else {
    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      phone: user.phone || undefined,
    });
    customerId = customer.id;
  }
  await storage.updateUser(user.id, { stripe_customer_id: customerId });
  return customerId;
}

async function processReferralCredits(userId: string, stripe: any) {
  const user = await storage.getUserById(userId);
  if (!user) return;

  const referral = await storage.getPendingReferralForEmail(user.email);
  if (!referral) return;

  const referrer = await storage.getUserById(referral.referrer_user_id);
  if (!referrer) return;

  if (user.stripe_customer_id) {
    await stripe.customers.update(user.stripe_customer_id, {
      balance: -REFERRAL_CREDIT_AMOUNT,
    });
  }

  if (referrer.stripe_customer_id) {
    // Use customer balance transaction for atomic credit — avoids read-then-write race
    await stripe.customers.createBalanceTransaction(referrer.stripe_customer_id, {
      amount: -REFERRAL_CREDIT_AMOUNT,
      currency: 'usd',
      description: `Referral credit for ${user.email}`,
    });
  }

  await storage.completeReferral(referral.referrer_user_id, user.email, REFERRAL_CREDIT_AMOUNT / 100);
}

export function registerRoutes(app: Express) {

  app.get('/api/google-maps-key', (_req: Request, res: Response) => {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }
    res.json({ apiKey: key });
  });

  app.get('/api/stripe/publishable-key', async (_req: Request, res: Response) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error: any) {
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.get('/api/products', async (_req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const products = await stripe.products.list({
        active: true,
        expand: ['data.default_price'],
        limit: 100,
      });

      const data = products.data.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        active: p.active,
        metadata: p.metadata,
        default_price: p.default_price ? {
          id: p.default_price.id,
          unit_amount: p.default_price.unit_amount,
          currency: p.default_price.currency,
          recurring: p.default_price.recurring,
          active: p.default_price.active,
        } : null,
      }));

      res.json({ data });
    } catch (error: any) {
      console.error('Error listing products:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.get('/api/products/:productId/prices', async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const productId = paramStr(req.params.productId);
      const prices = await stripe.prices.list({
        product: productId,
        active: true,
        limit: 100,
      });
      res.json({ data: prices.data.map((p: any) => ({
        id: p.id,
        unit_amount: p.unit_amount,
        currency: p.currency,
        recurring: p.recurring,
        active: p.active,
        metadata: p.metadata,
      })) });
    } catch (error: any) {
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  // Helper: verify the authenticated user owns the given Stripe customer ID
  async function verifyCustomerOwnership(req: Request, res: Response, customerId: string): Promise<boolean> {
    const user = await storage.getUserById(req.session.userId!);
    if (!user || user.stripe_customer_id !== customerId) {
      res.status(403).json({ error: 'Forbidden' });
      return false;
    }
    return true;
  }

  app.post('/api/customers', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const { email, name, metadata } = req.body;
      const customer = await stripe.customers.create({
        email,
        name,
        metadata: metadata || {},
      });
      res.json({ data: customer });
    } catch (error: any) {
      console.error('Error creating customer:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.get('/api/customers/:customerId', requireAuth, async (req: Request, res: Response) => {
    try {
      const customerId = paramStr(req.params.customerId);
      if (!(await verifyCustomerOwnership(req, res, customerId))) return;
      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      res.json({ data: customer });
    } catch (error: any) {
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.get('/api/customers/:customerId/payment-methods', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const customerId = paramStr(req.params.customerId);
      if (!(await verifyCustomerOwnership(req, res, customerId))) return;
      const [cards, bankAccounts, customer] = await Promise.all([
        stripe.paymentMethods.list({ customer: customerId, type: 'card' }),
        stripe.paymentMethods.list({ customer: customerId, type: 'us_bank_account' }),
        stripe.customers.retrieve(customerId),
      ]);
      const defaultPmId = !customer.deleted ? customer.invoice_settings?.default_payment_method : null;
      res.json({ data: [...cards.data, ...bankAccounts.data], defaultPaymentMethodId: defaultPmId });
    } catch (error: any) {
      if (error?.code === 'resource_missing') {
        return res.json({ data: [] });
      }
      console.error('Error listing payment methods:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.post('/api/customers/:customerId/payment-methods', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const customerId = paramStr(req.params.customerId);
      if (!(await verifyCustomerOwnership(req, res, customerId))) return;
      const { paymentMethodId } = req.body;
      const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
      res.json({ data: paymentMethod });
    } catch (error: any) {
      console.error('Error attaching payment method:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Failed to attach payment method';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.delete('/api/payment-methods/:paymentMethodId', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const pmId = paramStr(req.params.paymentMethodId);
      const detached = await stripe.paymentMethods.detach(pmId);
      res.json({ data: detached });
    } catch (error: any) {
      console.error('Error detaching payment method:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Failed to remove payment method';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.post('/api/customers/:customerId/default-payment-method', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const customerId = paramStr(req.params.customerId);
      if (!(await verifyCustomerOwnership(req, res, customerId))) return;
      const { paymentMethodId } = req.body;
      const customer = await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
      res.json({ data: customer });
    } catch (error: any) {
      console.error('Error setting default payment method:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Failed to set default payment method';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.post('/api/setup-intent', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const user = await storage.getUserById(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      const customerId = await ensureStripeCustomerId(user, stripe);
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        automatic_payment_methods: { enabled: true },
      });
      res.json({ data: { clientSecret: setupIntent.client_secret, customerId } });
    } catch (error: any) {
      console.error('Error creating setup intent:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Failed to create setup intent';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.post('/api/subscriptions', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const userId = req.session.userId!;
      const { customerId, priceId, quantity, paymentMethodId, metadata } = req.body;
      if (!(await verifyCustomerOwnership(req, res, customerId))) return;

      // Validate propertyId exists, belongs to authenticated user, and is approved
      const propertyId = metadata?.propertyId;
      if (propertyId) {
        const property = await storage.getLocationById(propertyId);
        if (!property) {
          return res.status(400).json({ error: 'Property not found' });
        }
        if (property.user_id !== userId) {
          return res.status(403).json({ error: 'Property does not belong to this user' });
        }
        if (property.service_status && property.service_status !== 'approved') {
          return res.status(400).json({ error: 'Cannot create subscription: address has not been approved yet' });
        }
      }

      const createParams: any = {
        customer: customerId,
        items: [{ price: priceId, quantity: quantity || 1 }],
        metadata: metadata || {},
        payment_behavior: 'allow_incomplete',
      };
      if (paymentMethodId) {
        createParams.default_payment_method = paymentMethodId;
      }
      const subscription = await stripe.subscriptions.create(createParams);

      try {
        await processReferralCredits(userId, stripe);
      } catch (err) {
        console.error('Referral credit processing failed:', err);
      }

      res.json({ data: subscription });
    } catch (error: any) {
      console.error('Error creating subscription:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.get('/api/customers/:customerId/subscriptions', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const customerId = paramStr(req.params.customerId);
      if (!(await verifyCustomerOwnership(req, res, customerId))) return;
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        expand: ['data.items.data.price'],
      });

      const subsWithProducts = await Promise.all(
        subscriptions.data.map(async (sub: any) => {
          const items = await Promise.all(
            sub.items.data.map(async (item: any) => {
              const price = item.price;
              if (price && typeof price.product === 'string') {
                try {
                  const product = await stripe.products.retrieve(price.product);
                  return { ...item, price: { ...price, product } };
                } catch {
                  return item;
                }
              }
              return item;
            })
          );
          return { ...sub, items: { ...sub.items, data: items } };
        })
      );

      res.json({ data: subsWithProducts });
    } catch (error: any) {
      if (error?.code === 'resource_missing') {
        return res.json({ data: [] });
      }
      console.error('Error listing subscriptions:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.patch('/api/subscriptions/:subscriptionId', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const subId = paramStr(req.params.subscriptionId);
      const { quantity, paymentMethodId, metadata } = req.body;
      const updateParams: any = {};

      if (paymentMethodId) {
        updateParams.default_payment_method = paymentMethodId;
      }
      if (metadata) {
        updateParams.metadata = metadata;
      }
      if (quantity !== undefined) {
        const sub = await stripe.subscriptions.retrieve(subId);
        updateParams.items = [{
          id: sub.items.data[0].id,
          quantity,
        }];
        updateParams.proration_behavior = 'create_prorations';
      }

      const subscription = await stripe.subscriptions.update(subId, updateParams);
      res.json({ data: subscription });
    } catch (error: any) {
      console.error('Error updating subscription:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.post('/api/subscriptions/:subscriptionId/cancel', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const subId = paramStr(req.params.subscriptionId);
      const subscription = await stripe.subscriptions.cancel(subId);

      // Clean up future OptimoRoute orders for this property
      const propertyId = (subscription as any).metadata?.propertyId;
      if (propertyId) {
        // Update location status and cancel future route stops
        storage.query(
          `UPDATE locations SET service_status = 'cancelled' WHERE id = $1`,
          [propertyId]
        ).catch(err => console.error(`[Cascade] Failed to update location status:`, err));

        storage.cancelFutureStopsForLocation(propertyId, new Date().toISOString().split('T')[0])
          .then(count => { if (count > 0) console.log(`[Cascade] Cancelled ${count} future stops for location ${propertyId}`); })
          .catch(err => console.error(`[Cascade] Failed to cancel future stops:`, err));

        import('./optimoSyncService').then(({ cleanupFutureOrdersForLocation }) => {
          cleanupFutureOrdersForLocation(propertyId).catch(err =>
            console.error(`[OptimoSync] Cancellation cleanup failed for property ${propertyId}:`, err)
          );
        });
      }

      res.json({ data: subscription });
    } catch (error: any) {
      console.error('Error canceling subscription:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.post('/api/subscriptions/:subscriptionId/pause', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const subId = paramStr(req.params.subscriptionId);
      const resumesAt = req.body?.resumesAt;
      const pauseConfig: any = { behavior: 'void' };
      if (resumesAt) {
        pauseConfig.resumes_at = Math.floor(new Date(resumesAt).getTime() / 1000);
      }
      const subscription = await stripe.subscriptions.update(subId, {
        pause_collection: pauseConfig,
      });

      // Clean up future OptimoRoute orders while paused
      const propertyId = (subscription as any).metadata?.propertyId;
      if (propertyId) {
        // Update location status and cancel future route stops
        storage.query(
          `UPDATE locations SET service_status = 'paused' WHERE id = $1 AND service_status = 'approved'`,
          [propertyId]
        ).catch(err => console.error(`[Cascade] Failed to pause location:`, err));

        storage.cancelFutureStopsForLocation(propertyId, new Date().toISOString().split('T')[0])
          .then(count => { if (count > 0) console.log(`[Cascade] Cancelled ${count} future stops for paused location ${propertyId}`); })
          .catch(err => console.error(`[Cascade] Failed to cancel future stops:`, err));

        import('./optimoSyncService').then(({ cleanupFutureOrdersForLocation }) => {
          cleanupFutureOrdersForLocation(propertyId).catch(err =>
            console.error(`[OptimoSync] Pause cleanup failed for property ${propertyId}:`, err)
          );
        });
      }

      // Notify customer of pause
      if (propertyId) {
        storage.query(`SELECT user_id, address FROM locations WHERE id = $1`, [propertyId]).then(r => {
          const loc = r.rows[0];
          if (loc?.user_id) sendPauseResumeConfirmation(loc.user_id, loc.address, 'paused').catch(() => {});
        }).catch(() => {});
      }

      res.json({ data: subscription });
    } catch (error: any) {
      console.error('Error pausing subscription:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.post('/api/subscriptions/:subscriptionId/resume', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const subId = paramStr(req.params.subscriptionId);
      const subscription = await stripe.subscriptions.update(subId, {
        pause_collection: '',
      } as any);

      // Restore location status to approved
      const propertyId = (subscription as any).metadata?.propertyId;
      if (propertyId) {
        storage.query(
          `UPDATE locations SET service_status = 'approved' WHERE id = $1 AND service_status = 'paused'`,
          [propertyId]
        ).catch(err => console.error(`[Cascade] Failed to restore location status on resume:`, err));

        // Notify customer of resume
        storage.query(`SELECT user_id, address FROM locations WHERE id = $1`, [propertyId]).then(r => {
          const loc = r.rows[0];
          if (loc?.user_id) sendPauseResumeConfirmation(loc.user_id, loc.address, 'resumed').catch(() => {});
        }).catch(() => {});
      }

      res.json({ data: subscription });
    } catch (error: any) {
      console.error('Error resuming subscription:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.get('/api/customers/:customerId/invoices', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const customerId = paramStr(req.params.customerId);
      if (!(await verifyCustomerOwnership(req, res, customerId))) return;
      const invoices = await stripe.invoices.list({
        customer: customerId,
        limit: 50,
      });
      res.json({ data: invoices.data });
    } catch (error: any) {
      if (error?.code === 'resource_missing') {
        return res.json({ data: [] });
      }
      console.error('Error listing invoices:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.post('/api/invoices/:invoiceId/pay', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const invoiceId = paramStr(req.params.invoiceId);
      const { paymentMethodId } = req.body;
      const invoice = await stripe.invoices.pay(invoiceId, {
        payment_method: paymentMethodId,
      });
      res.json({ data: invoice });
    } catch (error: any) {
      console.error('Error paying invoice:', error);
      const status = error?.statusCode || 500;
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/checkout', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const { customerId, priceId, quantity, successUrl, cancelUrl, metadata } = req.body;
      if (!(await verifyCustomerOwnership(req, res, customerId))) return;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [{ price: priceId, quantity: quantity || 1 }],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: metadata || {},
      });
      res.json({ data: { url: session.url, id: session.id } });
    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.post('/api/invoices', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const userId = req.session.userId!;
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      const customerId = await ensureStripeCustomerId(user, stripe);
      const { amount, description, metadata } = req.body;
      if (!amount || !description) {
        return res.status(400).json({ error: 'amount and description are required' });
      }
      const invoice = await stripe.invoices.create({
        customer: customerId,
        auto_advance: true,
        metadata: metadata || {},
      });
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        amount: amount,
        currency: 'usd',
        description: description,
      });
      const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
      res.json({ data: finalizedInvoice });
    } catch (error: any) {
      console.error('Error creating invoice:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  app.post('/api/customer-portal', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const { customerId, returnUrl } = req.body;
      if (!(await verifyCustomerOwnership(req, res, customerId))) return;
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      res.json({ data: { url: session.url } });
    } catch (error: any) {
      console.error('Error creating portal session:', error);
      const message = error?.type?.startsWith('Stripe') ? error.message : 'Internal server error';
      res.status(error?.statusCode || 500).json({ error: message });
    }
  });

  async function verifyUserOwnsAddress(req: Request, res: Response, address: string): Promise<boolean> {
    const userId = req.session?.userId;
    if (!userId) return false;
    const locations = await storage.getLocationsForUser(userId);
    return locations.some(p => p.address.toLowerCase().trim() === address.toLowerCase().trim());
  }

  app.get('/api/optimoroute/next-pickup', requireAuth, async (req: Request, res: Response) => {
    try {
      const address = req.query.address as string;
      if (!address) return res.status(400).json({ error: 'address is required' });
      if (!(await verifyUserOwnsAddress(req, res, address))) {
        return res.status(403).json({ error: 'Address not found in your properties' });
      }
      const result = await optimoRoute.getNextPickupForAddress(address);
      if (result) {
        return res.json({ data: result });
      }

      // Fallback: use internal route_stops / collection_day data
      const userId = req.session?.userId;
      if (!userId) return res.json({ data: null });

      const locations = await storage.getLocationsForUser(userId);
      const loc = locations.find((p: any) => p.address.toLowerCase().trim() === address.toLowerCase().trim());
      if (!loc) return res.json({ data: null });

      const todayStr = new Date().toISOString().split('T')[0];

      // Try next scheduled route stop first
      const nextStop = await storage.getNextRouteStopForLocation(loc.id, todayStr);
      if (nextStop) {
        const d = new Date(nextStop.scheduled_date + 'T00:00:00');
        return res.json({ data: { date: d.toISOString().split('T')[0], source: 'internal' } });
      }

      // Fall back to collection_day recurring schedule
      if (loc.collection_day) {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const targetDay = dayNames.indexOf(loc.collection_day.toLowerCase());
        if (targetDay !== -1) {
          const today = new Date();
          const currentDay = today.getDay();
          let daysUntil = (targetDay - currentDay + 7) % 7;
          if (daysUntil === 0) daysUntil = 7; // next week if today is pickup day
          const nextDate = new Date(today);
          nextDate.setDate(today.getDate() + daysUntil);
          return res.json({ data: { date: nextDate.toISOString().split('T')[0], source: 'schedule' } });
        }
      }

      res.json({ data: null });
    } catch (error: any) {
      console.error('OptimoRoute next-pickup error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/collection-intent/:locationId/:date', requireAuth, async (req: Request, res: Response) => {
    try {
      const { locationId, date } = req.params;
      const { intent } = req.body;
      const userId = req.session.userId!;

      const location = await storage.getLocationById(locationId);
      if (!location || location.user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const result = await storage.upsertCollectionIntent({
        userId,
        locationId,
        intent,
        collectionDate: date,
      });

      res.json({ data: result });
    } catch (error) {
      console.error('Error updating collection intent:', error);
      res.status(500).json({ error: 'Failed to update collection intent' });
    }
  });

  app.get('/api/optimoroute/history', requireAuth, async (req: Request, res: Response) => {
    try {
      const address = req.query.address as string;
      const weeks = Math.min(Math.max(parseInt(req.query.weeks as string) || 12, 1), 52);
      if (!address) return res.status(400).json({ error: 'address is required' });
      if (!(await verifyUserOwnsAddress(req, res, address))) {
        return res.status(403).json({ error: 'Address not found in your properties' });
      }
      const result = await optimoRoute.getCompletionHistoryForAddress(address, weeks);
      res.json({ data: result });
    } catch (error: any) {
      console.error('OptimoRoute history error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/optimoroute/routes', requireAuth, async (req: Request, res: Response) => {
    try {
      const date = req.query.date as string;
      if (!date) return res.status(400).json({ error: 'date is required' });
      const result = await optimoRoute.getRoutes(date);
      res.json({ data: result });
    } catch (error: any) {
      console.error('OptimoRoute routes error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/optimoroute/search', requireAuth, async (req: Request, res: Response) => {
    try {
      const from = req.query.from as string;
      const to = req.query.to as string;
      if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });
      const result = await optimoRoute.searchOrders(from, to);
      res.json({ data: result });
    } catch (error: any) {
      console.error('OptimoRoute search error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/optimoroute/create-order', requireAuth, async (req: Request, res: Response) => {
    try {
      const { orderNo, type, date, address, locationName, duration, notes } = req.body;
      if (!orderNo || !type || !date || !address) {
        return res.status(400).json({ error: 'orderNo, type, date, and address are required' });
      }
      if (!(await verifyUserOwnsAddress(req, res, address))) {
        return res.status(403).json({ error: 'Address not found in your properties' });
      }
      const result = await optimoRoute.createOrder({ orderNo, type, date, address, locationName, duration, notes });
      res.json({ data: result });
    } catch (error: any) {
      console.error('OptimoRoute create-order error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/ai/support', requireAuth, async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'prompt is required' });
      }
      if (prompt.length > 2000) {
        return res.status(400).json({ error: 'prompt too long' });
      }
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: 'AI service not configured' });
      }

      // Load context server-side from session — never trust client-supplied context
      const user = await storage.getUserById(req.session.userId!);
      const userLocations = user ? await storage.getLocationsForUser(user.id) : [];
      const contextString = user ? `
    User Details:
    - Name: ${user.first_name} ${user.last_name}
    - Properties: ${userLocations.length}
  ` : '';

      const ai = new GoogleGenAI({ apiKey });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-2.0-flash',
        contents: `Context:\n${contextString}\n\nQuestion: ${prompt}`,
        config: {
          systemInstruction: "You are the Waste Management AI Concierge. You are helpful, professional, and proactive. You have access to the user's account details. Always be concise and helpful.",
        },
      });

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      console.error('AI support error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'AI service error' });
      }
    }
  });

  app.post('/api/redeem-credits', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { amount, method } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      if (user.total_referral_credits < amount) {
        return res.status(400).json({ error: 'Insufficient credits' });
      }

      await storage.query('BEGIN');
      const redemption = await storage.createRedemption({
        userId,
        amount,
        method,
        status: 'pending',
      });

      await storage.updateUser(userId, {
        total_referral_credits: user.total_referral_credits - amount,
      });
      await storage.query('COMMIT');

      res.json({ success: true, redemption });
    } catch (error) {
      await storage.query('ROLLBACK');
      console.error('Error redeeming credits:', error);
      res.status(500).json({ error: 'Failed to redeem credits' });
    }
  });

  app.get('/api/referral-info', requireAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session.userId!;
        const user = await storage.getUserById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const [referralCode, referrals, redemptions] = await Promise.all([
            storage.getReferralCodeForUser(userId),
            storage.getReferralsForUser(userId),
            storage.getRedemptionsForUser(userId),
        ]);
        res.json({
            referralCode: referralCode?.code,
            shareLink: `https://www.theruralconsumer.com/register?ref=${referralCode?.code}`,
            totalRewards: user.total_referral_credits || 0,
            referrals,
            redemptions,
        });
    } catch (error) {
        console.error('Error getting referral info:', error);
        res.status(500).json({ error: 'Failed to get referral info' });
    }
  });

  // Message email opt-in for customers
  app.get('/api/profile/message-notifications', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const result = await storage.query(`SELECT message_email_notifications FROM users WHERE id = $1`, [userId]);
      const enabled = result.rows[0]?.message_email_notifications ?? false;
      res.json({ message_email_notifications: enabled });
    } catch (e) {
      res.status(500).json({ error: 'Failed to get preference' });
    }
  });

  app.put('/api/profile/message-notifications', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
      await storage.query(`UPDATE users SET message_email_notifications = $1, updated_at = NOW() WHERE id = $2`, [enabled, userId]);
      res.json({ success: true, message_email_notifications: enabled });
    } catch (e) {
      res.status(500).json({ error: 'Failed to update preference' });
    }
  });

  // ── Billing Disputes ────────────────────────────────────────────

  const VALID_DISPUTE_REASONS = ['Incorrect charge', 'Duplicate charge', 'Service not received', 'Other'];

  app.post('/api/billing/disputes', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { invoiceId, invoiceNumber, amount, reason, details } = req.body;

      if (!invoiceId || !amount || !reason) {
        return res.status(400).json({ error: 'invoiceId, amount, and reason are required' });
      }
      if (!VALID_DISPUTE_REASONS.includes(reason)) {
        return res.status(400).json({ error: 'Invalid dispute reason' });
      }

      const existing = await storage.getDisputeByInvoiceId(invoiceId);
      if (existing) {
        return res.status(409).json({ error: 'A dispute already exists for this invoice' });
      }

      const dispute = await storage.createBillingDispute({
        userId, invoiceId, invoiceNumber, amount, reason, details,
      });

      // Notify admin
      const user = await storage.getUserById(userId);
      const userName = user ? `${user.first_name} ${user.last_name}`.trim() : 'A customer';
      const admins = await storage.query(
        `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id WHERE ur.role = 'admin' LIMIT 1`
      );

      if (admins.rows.length > 0) {
        await storage.createNotification(
          admins.rows[0].id,
          'billing_dispute',
          'Billing Dispute Filed',
          `${userName} disputed invoice ${invoiceNumber || invoiceId} ($${Number(amount).toFixed(2)}) — Reason: ${reason}`,
          { disputeId: dispute.id, invoiceId, userId }
        );

        // Create support conversation
        await storage.createConversation({
          subject: `Billing Dispute: Invoice ${invoiceNumber || invoiceId}`,
          type: 'direct',
          createdById: userId,
          createdByType: 'user',
          participants: [
            { id: userId, type: 'user', role: 'customer' },
            { id: admins.rows[0].id, type: 'admin', role: 'admin' },
          ],
        }).then(async (conversation) => {
          await storage.createMessage({
            conversationId: conversation.id,
            senderId: userId,
            senderType: 'user',
            body: `I'd like to dispute invoice ${invoiceNumber || invoiceId} ($${Number(amount).toFixed(2)}).\n\nReason: ${reason}${details ? `\nDetails: ${details}` : ''}`,
          });
        });
      }

      res.json({ success: true, dispute });
    } catch (e: any) {
      console.error('Failed to create dispute:', e);
      res.status(500).json({ error: 'Failed to create dispute' });
    }
  });

  app.get('/api/billing/disputes', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const disputes = await storage.getDisputesForUser(userId);
      res.json(disputes);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch disputes' });
    }
  });
}
