import { storage } from './storage';
import { getUncachableStripeClient } from './stripeClient';

interface ActivateOptions {
  /** Identifies the caller for audit logging: 'auto_approval' | 'admin_approval' | 'bulk_approval' */
  source?: string;
  /** Use already-fetched selections instead of claiming from DB (caller already deleted in its own transaction) */
  preloadedSelections?: any[];
}

/**
 * Activate pending service selections into Stripe subscriptions.
 *
 * When no `preloadedSelections` are provided, uses an atomic DELETE...RETURNING
 * to claim the rows — this prevents duplicate activations if two callers race.
 *
 * Callers are responsible for sending customer notifications.
 *
 * Shared by:
 *  - Auto-approval flow (feasibilityCheck.ts, authRoutes pending-selections endpoint)
 *  - Admin individual approval (adminRoutes decision endpoint)
 *  - Admin bulk approval (adminRoutes bulk-decision endpoint)
 */
export async function activatePendingSelections(
  propertyId: string,
  userId: string,
  options: ActivateOptions = {},
): Promise<{ activated: number; failed: number }> {
  const { source = 'unknown', preloadedSelections } = options;

  // Atomic claim: DELETE...RETURNING ensures only one concurrent caller gets the rows
  const selections = preloadedSelections ?? await storage.claimPendingSelections(propertyId);
  if (selections.length === 0) {
    return { activated: 0, failed: 0 };
  }

  let activated = 0;
  let failed = 0;

  try {
    const stripe = await getUncachableStripeClient();
    const user = await storage.getUserById(userId);
    if (!user?.stripe_customer_id) {
      console.error(`activatePendingSelections: user ${userId} has no stripe_customer_id`);
      return { activated: 0, failed: selections.length };
    }

    const products = await stripe.products.list({ limit: 100, active: true, expand: ['data.default_price'] });
    const productMap = new Map(products.data.map((p: any) => [p.id, p]));

    for (const sel of selections) {
      try {
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
          activated++;
        } else {
          console.error(`activatePendingSelections: no default price for product ${sel.service_id}`);
          failed++;
        }
      } catch (subErr: any) {
        console.error(`activatePendingSelections: subscription creation failed for selection ${sel.id}:`, subErr);
        failed++;
      }
    }
  } catch (err: any) {
    console.error('activatePendingSelections: Stripe error:', err);
    failed = selections.length;
  }

  // Audit trail
  try {
    await storage.createAuditLog(userId, 'subscriptions_activated', 'property', propertyId, {
      source,
      automated: source === 'auto_approval',
      activated,
      failed,
      totalSelections: selections.length,
    });
  } catch (err) {
    console.error('activatePendingSelections: audit log failed:', err);
  }

  return { activated, failed };
}
