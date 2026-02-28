import { getStripeSync } from './stripeClient';
import { pool } from './db';
import { sendPaymentConfirmation, sendBillingAlert } from './notificationService';

/**
 * Stripe webhook processor: syncs events to DB via stripe-replit-sync,
 * then dispatches customer-facing notifications (payment confirmations,
 * billing alerts) based on event type.
 */
export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // After sync verifies + processes the event, dispatch custom notifications
    try {
      const event = JSON.parse(payload.toString());
      await WebhookHandlers.handleNotifications(event);
    } catch (e) {
      console.error('Error dispatching webhook notification:', e);
    }
  }

  /** Look up internal user by Stripe customer ID */
  private static async findUserByCustomer(customerId: string): Promise<string | null> {
    const userResult = await pool.query(
      'SELECT id FROM users WHERE stripe_customer_id = $1',
      [customerId]
    );
    return userResult.rows[0]?.id ?? null;
  }

  /** Dispatch customer-facing notifications based on Stripe event type */
  private static async handleNotifications(event: any): Promise<void> {
    const obj = event?.data?.object;
    if (!obj?.customer) return;

    const userId = await WebhookHandlers.findUserByCustomer(obj.customer);
    if (!userId) return;

    switch (event.type) {
      case 'invoice.payment_succeeded': {
        if (obj.amount_paid > 0) {
          const amount = obj.amount_paid / 100;
          sendPaymentConfirmation(userId, amount, obj.number || obj.id).catch(err => {
            console.error('Failed to send payment confirmation:', err);
          });
        }
        break;
      }
      case 'invoice.payment_failed': {
        const amount = (obj.amount_due || 0) / 100;
        const dueDate = obj.due_date
          ? new Date(obj.due_date * 1000).toLocaleDateString()
          : 'Immediately';
        sendBillingAlert(userId, obj.number || obj.id, amount, dueDate).catch(err => {
          console.error('Failed to send billing alert:', err);
        });
        break;
      }
      case 'customer.subscription.updated': {
        // When a subscription goes past_due after failed retries
        if (obj.status === 'past_due') {
          sendBillingAlert(
            userId,
            obj.id,
            (obj.items?.data?.[0]?.price?.unit_amount || 0) / 100,
            'Payment overdue — service at risk',
          ).catch(err => {
            console.error('Failed to send past_due alert:', err);
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        // Subscription canceled (by dunning or manually)
        sendBillingAlert(
          userId,
          obj.id,
          0,
          'Subscription canceled due to payment failure. Please update your payment method to restore service.',
        ).catch(err => {
          console.error('Failed to send subscription canceled alert:', err);
        });
        break;
      }
    }
  }
}
