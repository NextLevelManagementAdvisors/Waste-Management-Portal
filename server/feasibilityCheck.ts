import * as optimo from './optimoRouteClient';
import { storage } from './storage';
import { activatePendingSelections } from './activateSelections';
import { sendServiceUpdate } from './notificationService';

export interface FeasibilityResult {
  feasible: boolean;
  reason: 'scheduled' | 'not_schedulable' | 'invalid_address' | 'planning_timeout' | 'unknown';
}

/**
 * Run the full OptimoRoute feasibility probe for an address.
 *
 * Creates a temporary order, runs route planning, checks if the order
 * gets scheduled, then cleans up. Takes up to ~60s due to polling.
 */
export async function checkRouteFeasibility(address: string, propertyId: string): Promise<FeasibilityResult> {
  const tempOrderNo = `FEASIBILITY-${propertyId.substring(0, 8).toUpperCase()}-${Date.now()}`;

  // Next weekday
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
    tomorrow.setDate(tomorrow.getDate() + 1);
  }
  const dateStr = tomorrow.toISOString().split('T')[0];

  let result: FeasibilityResult = { feasible: false, reason: 'unknown' };

  try {
    // Step 1: Create temporary order
    await optimo.createOrder({
      orderNo: tempOrderNo,
      type: 'P',
      date: dateStr,
      address,
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

    if (planResult.ordersWithInvalidLocation?.includes(tempOrderNo)) {
      result = { feasible: false, reason: 'invalid_address' };
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
        result = schedInfo.orderScheduled
          ? { feasible: true, reason: 'scheduled' }
          : { feasible: false, reason: 'not_schedulable' };
      } else {
        result = { feasible: false, reason: 'planning_timeout' };
      }
    }
  } catch (err) {
    console.error('checkRouteFeasibility error:', err);
    result = { feasible: false, reason: 'unknown' };
  } finally {
    // Step 5: Always cleanup
    try {
      await optimo.deleteOrder(tempOrderNo, true);
    } catch (e) {
      console.error('Failed to cleanup feasibility check order:', e);
    }
  }

  return result;
}

/**
 * Background handler: run feasibility check, then approve + activate if feasible.
 *
 * Called fire-and-forget from property creation when auto-approve is enabled
 * and the zone pre-filter passes.
 */
export async function runFeasibilityAndApprove(
  propertyId: string,
  userId: string,
  address: string,
): Promise<void> {
  const result = await checkRouteFeasibility(address, propertyId);

  // Audit the check result
  try {
    await storage.createAuditLog(userId, 'auto_feasibility_check', 'property', propertyId, {
      ...result,
      automated: true,
    });
  } catch (e) {
    console.error('Feasibility audit log failed:', e);
  }

  if (!result.feasible) {
    console.log(`Auto-feasibility failed for property ${propertyId}: ${result.reason}`);
    return;
  }

  // Conditionally approve — only if still pending_review (admin may have already decided)
  const approved = await storage.approveIfPending(propertyId);
  if (!approved) {
    console.log(`Property ${propertyId} already decided, skipping auto-approval`);
    return;
  }

  // Activate any pending selections into Stripe subscriptions
  activatePendingSelections(propertyId, userId, {
    source: 'auto_approval',
  }).catch(err => {
    console.error('Auto-activation after feasibility failed:', err);
  });

  // Notify customer
  sendServiceUpdate(
    userId,
    'Address Approved',
    `Great news! Your address at ${address} has been approved. Your waste collection service is now being set up and you will be billed according to your selected plan.`,
  ).catch(err => {
    console.error('Auto-approval notification failed:', err);
  });
}
