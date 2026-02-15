import express, { type Express, type Request, type Response } from 'express';
import { storage } from './storage';
import { getUncachableStripeClient, getStripePublishableKey } from './stripeClient';

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

export function registerRoutes(app: Express) {

  app.get('/api/stripe/publishable-key', async (_req: Request, res: Response) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/customers/:customerId', async (req: Request, res: Response) => {
    try {
      const customerId = paramStr(req.params.customerId);
      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      res.json({ data: customer });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/subscriptions', async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const { customerId, priceId, quantity, paymentMethodId, metadata } = req.body;

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId, quantity: quantity || 1 }],
        default_payment_method: paymentMethodId,
        metadata: metadata || {},
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
      });
      res.json({ data: subscription });
    } catch (error: any) {
      console.error('Error creating subscription:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/customers/:customerId/subscriptions', async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const customerId = paramStr(req.params.customerId);
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        expand: ['data.items.data.price.product'],
      });
      res.json({ data: subscriptions.data });
    } catch (error: any) {
      console.error('Error listing subscriptions:', error);
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
    }
  });
}
