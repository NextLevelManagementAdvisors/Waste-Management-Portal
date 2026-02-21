import express, { type Express, type Request, type Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { storage } from './storage';
import { getUncachableStripeClient, getStripePublishableKey } from './stripeClient';
import * as optimoRoute from './optimoRouteClient';
import { requireAuth } from './authRoutes';

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

const REFERRAL_CREDIT_AMOUNT = 1000;

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
    const referrerCustomer = await stripe.customers.retrieve(referrer.stripe_customer_id);
    const currentBalance = referrerCustomer.balance || 0;
    await stripe.customers.update(referrer.stripe_customer_id, {
      balance: currentBalance - REFERRAL_CREDIT_AMOUNT,
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
      res.status(500).json({ error: 'Internal server error' });
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
      res.status(500).json({ error: 'Internal server error' });
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
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/customers', async (req: Request, res: Response) => {
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
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/customers/:customerId', async (req: Request, res: Response) => {
    try {
      const customerId = paramStr(req.params.customerId);
      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      res.json({ data: customer });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/customers/:customerId/payment-methods', async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const customerId = paramStr(req.params.customerId);
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });
      res.json({ data: paymentMethods.data });
    } catch (error: any) {
      console.error('Error listing payment methods:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/customers/:customerId/payment-methods', async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const customerId = paramStr(req.params.customerId);
      const { paymentMethodId } = req.body;
      const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
      res.json({ data: paymentMethod });
    } catch (error: any) {
      console.error('Error attaching payment method:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/payment-methods/:paymentMethodId', async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const pmId = paramStr(req.params.paymentMethodId);
      const detached = await stripe.paymentMethods.detach(pmId);
      res.json({ data: detached });
    } catch (error: any) {
      console.error('Error detaching payment method:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/customers/:customerId/default-payment-method', async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const customerId = paramStr(req.params.customerId);
      const { paymentMethodId } = req.body;
      const customer = await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
      res.json({ data: customer });
    } catch (error: any) {
      console.error('Error setting default payment method:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/setup-intent', async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const { customerId } = req.body;
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
      });
      res.json({ data: { clientSecret: setupIntent.client_secret } });
    } catch (error: any) {
      console.error('Error creating setup intent:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/subscriptions', async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const { customerId, priceId, quantity, paymentMethodId, metadata } = req.body;

      const createParams: any = {
        customer: customerId,
        items: [{ price: priceId, quantity: quantity || 1 }],
        metadata: metadata || {},
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
      };
      if (paymentMethodId) {
        createParams.default_payment_method = paymentMethodId;
      }
      const subscription = await stripe.subscriptions.create(createParams);

      if (req.session?.userId) {
        processReferralCredits(req.session.userId, stripe).catch(err =>
          console.error('Referral credit processing failed (non-blocking):', err)
        );
      }

      res.json({ data: subscription });
    } catch (error: any) {
      console.error('Error creating subscription:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/customers/:customerId/subscriptions', async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const customerId = paramStr(req.params.customerId);
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
      console.error('Error listing subscriptions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.patch('/api/subscriptions/:subscriptionId', async (req: Request, res: Response) => {
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
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/subscriptions/:subscriptionId/cancel', async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const subId = paramStr(req.params.subscriptionId);
      const subscription = await stripe.subscriptions.cancel(subId);
      res.json({ data: subscription });
    } catch (error: any) {
      console.error('Error canceling subscription:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/subscriptions/:subscriptionId/pause', async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const subId = paramStr(req.params.subscriptionId);
      const subscription = await stripe.subscriptions.update(subId, {
        pause_collection: { behavior: 'void' },
      });
      res.json({ data: subscription });
    } catch (error: any) {
      console.error('Error pausing subscription:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/subscriptions/:subscriptionId/resume', async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const subId = paramStr(req.params.subscriptionId);
      const subscription = await stripe.subscriptions.update(subId, {
        pause_collection: '',
      } as any);
      res.json({ data: subscription });
    } catch (error: any) {
      console.error('Error resuming subscription:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/customers/:customerId/invoices', async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const customerId = paramStr(req.params.customerId);
      const invoices = await stripe.invoices.list({
        customer: customerId,
        limit: 50,
      });
      res.json({ data: invoices.data });
    } catch (error: any) {
      console.error('Error listing invoices:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/invoices/:invoiceId/pay', async (req: Request, res: Response) => {
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
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/checkout', async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const { customerId, priceId, quantity, successUrl, cancelUrl, metadata } = req.body;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: quantity || 1 }],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: metadata || {},
      });
      res.json({ data: { url: session.url, id: session.id } });
    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/invoices', requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const userId = req.session.userId!;
      const user = await storage.getUserById(userId);
      if (!user?.stripe_customer_id) {
        return res.status(400).json({ error: 'No Stripe customer associated with your account' });
      }
      const customerId = user.stripe_customer_id;
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
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/customer-portal', async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const { customerId, returnUrl } = req.body;
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      res.json({ data: { url: session.url } });
    } catch (error: any) {
      console.error('Error creating portal session:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  async function verifyUserOwnsAddress(req: Request, res: Response, address: string): Promise<boolean> {
    const userId = req.session?.userId;
    if (!userId) return false;
    const properties = await storage.getPropertiesForUser(userId);
    return properties.some(p => p.address.toLowerCase().trim() === address.toLowerCase().trim());
  }

  app.get('/api/optimoroute/next-pickup', requireAuth, async (req: Request, res: Response) => {
    try {
      const address = req.query.address as string;
      if (!address) return res.status(400).json({ error: 'address is required' });
      if (!(await verifyUserOwnsAddress(req, res, address))) {
        return res.status(403).json({ error: 'Address not found in your properties' });
      }
      const result = await optimoRoute.getNextPickupForAddress(address);
      res.json({ data: result });
    } catch (error: any) {
      console.error('OptimoRoute next-pickup error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/optimoroute/history', requireAuth, async (req: Request, res: Response) => {
    try {
      const address = req.query.address as string;
      const weeks = parseInt(req.query.weeks as string) || 12;
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
      const { prompt, userContext } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'prompt is required' });
      }
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: 'AI service not configured' });
      }
      const ai = new GoogleGenAI({ apiKey });
      const contextString = userContext ? `
    User Details:
    - Name: ${userContext.user?.firstName} ${userContext.user?.lastName}
    - Current Focus Address: ${userContext.user?.address}

    Account Status:
    - Subscriptions: ${userContext.subscriptions?.filter((s: any) => s.status === 'active').map((s: any) => s.serviceName).join(', ')}
    - Outstanding Balance: $${userContext.invoices?.filter((i: any) => i.status !== 'Paid').reduce((acc: number, inv: any) => acc + inv.amount, 0).toFixed(2)}
  ` : '';

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
}
