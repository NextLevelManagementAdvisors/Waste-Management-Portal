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

  /** Dispatch customer-facing notifications based on Stripe event type */
  private static async handleNotifications(event: any): Promise<void> {
    const invoice = event?.data?.object;
    if (!invoice?.customer) return;

    // Look up internal user by Stripe customer ID
    const userResult = await pool.query(
      'SELECT id FROM users WHERE stripe_customer_id = $1',
      [invoice.customer]
    );
    const userId = userResult.rows[0]?.id;
    if (!userId) return;

    switch (event.type) {
      case 'invoice.payment_succeeded': {
        if (invoice.amount_paid > 0) {
          const amount = invoice.amount_paid / 100;
          sendPaymentConfirmation(userId, amount, invoice.number || invoice.id).catch(err => {
            console.error('Failed to send payment confirmation:', err);
          });
        }
        break;
      }
      case 'invoice.payment_failed': {
        const amount = (invoice.amount_due || 0) / 100;
        const dueDate = invoice.due_date
          ? new Date(invoice.due_date * 1000).toLocaleDateString()
          : 'Immediately';
        sendBillingAlert(userId, invoice.number || invoice.id, amount, dueDate).catch(err => {
          console.error('Failed to send billing alert:', err);
        });
        break;
      }
    }
  }
}
