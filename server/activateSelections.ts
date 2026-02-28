import { storage, DbPendingSelection } from './storage';
import { getUncachableStripeClient } from './stripeClient';
import * as optimoRoute from './optimoRouteClient';

interface ActivateOptions {
  /** Identifies the caller for audit logging: 'auto_approval' | 'admin_approval' | 'bulk_approval' | 'deferred_activation' */
  source?: string;
  /** Use already-fetched selections instead of claiming from DB (caller already deleted in its own transaction) */
  preloadedSelections?: DbPendingSelection[];
}

/**
 * Activate pending service selections into Stripe subscriptions.
 *
 * When no `preloadedSelections` are provided, uses an atomic DELETE...RETURNING
 * to claim the rows — this prevents duplicate activations if two callers race.
 *
 * Validates that the user has a stripe_customer_id BEFORE claiming rows to
 * prevent data loss. If preloadedSelections were provided (already deleted by
 * caller) and the user lacks a Stripe ID, selections are restored to the DB.
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
): Promise<{ activated: number; failed: number; rentalDeliveries: number }> {
  const { source = 'unknown', preloadedSelections } = options;

  // Validate user BEFORE claiming (deleting) rows — prevents data loss
  const stripe = await getUncachableStripeClient();
  const user = await storage.getUserById(userId);
  if (!user?.stripe_customer_id) {
    console.error(`activatePendingSelections: user ${userId} has no stripe_customer_id`);
    // If caller pre-deleted selections, restore them so they aren't lost
    if (preloadedSelections && preloadedSelections.length > 0) {
      try {
        await storage.savePendingSelections(propertyId, userId, preloadedSelections.map(sel => ({
          serviceId: sel.service_id,
          quantity: sel.quantity,
          useSticker: sel.use_sticker,
        })));
        console.log(`activatePendingSelections: restored ${preloadedSelections.length} preloaded selections for property ${propertyId}`);
      } catch (restoreErr) {
        console.error('activatePendingSelections: failed to restore preloaded selections:', restoreErr);
      }
    }
    return { activated: 0, failed: preloadedSelections?.length ?? 0, rentalDeliveries: 0 };
  }

  // Atomic claim: DELETE...RETURNING ensures only one concurrent caller gets the rows
  const selections = preloadedSelections ?? await storage.claimPendingSelections(propertyId);
  if (selections.length === 0) {
    return { activated: 0, failed: 0, rentalDeliveries: 0 };
  }

  let activated = 0;
  let failed = 0;
  const rentalDeliveries: string[] = []; // Track rental equipment for delivery scheduling

  try {
    const products = await stripe.products.list({ limit: 100, active: true, expand: ['data.default_price'] });
    const productMap = new Map(products.data.map((p: any) => [p.id, p]));

    for (const sel of selections) {
      try {
        const product = productMap.get(sel.service_id);
        if (product?.default_price?.id) {
          const equipmentType = sel.use_sticker ? 'own_can' : 'rental';
          await stripe.subscriptions.create({
            customer: user.stripe_customer_id,
            items: [{ price: product.default_price.id, quantity: sel.quantity }],
            metadata: {
              propertyId,
              equipmentType,
            },
            payment_behavior: 'allow_incomplete',
          });
          activated++;
          if (equipmentType === 'rental') {
            rentalDeliveries.push(product.name || sel.service_id);
          }
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

  // Schedule equipment delivery orders for rental subscriptions
  if (rentalDeliveries.length > 0 && process.env.OPTIMOROUTE_API_KEY) {
    try {
      const property = await storage.getPropertyById(propertyId);
      if (property) {
        const deliveryDate = new Date();
        deliveryDate.setDate(deliveryDate.getDate() + 3); // Target 3 days out
        const dateStr = deliveryDate.toISOString().split('T')[0];

        await optimoRoute.createOrder({
          orderNo: `DEL-${propertyId.slice(0, 8)}-${Date.now()}`,
          type: 'D',
          date: dateStr,
          address: property.address,
          locationName: `${user.first_name} ${user.last_name}`,
          duration: 10,
          notes: `Equipment delivery: ${rentalDeliveries.join(', ')}`,
        });
        console.log(`[EquipmentDelivery] Scheduled delivery for property ${propertyId} on ${dateStr}`);
      }
    } catch (err) {
      console.error('[EquipmentDelivery] Failed to schedule delivery order (non-blocking):', err);
    }
  }

  // Audit trail
  try {
    await storage.createAuditLog(userId, 'subscriptions_activated', 'property', propertyId, {
      source,
      automated: source === 'auto_approval',
      activated,
      failed,
      totalSelections: selections.length,
      rentalDeliveries: rentalDeliveries.length,
    });
  } catch (err) {
    console.error('activatePendingSelections: audit log failed:', err);
  }

  return { activated, failed, rentalDeliveries: rentalDeliveries.length };
}
