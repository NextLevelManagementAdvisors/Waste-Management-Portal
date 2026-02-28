import * as optimo from './optimoRouteClient';
import { storage } from './storage';
import { activatePendingSelections } from './activateSelections';
import { sendServiceUpdate } from './notificationService';
import { approvalMessage } from './addressReviewMessages';

export interface FeasibilityResult {
  feasible: boolean;
  reason: 'scheduled' | 'not_schedulable' | 'invalid_address' | 'planning_timeout' | 'unknown';
  scheduledDay?: string;   // Day of week the order was scheduled on (e.g., "tuesday")
  driverName?: string;     // Driver assigned by OptimoRoute
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Find the next occurrence of a specific day of week (e.g., "tuesday").
 * Returns the date string in YYYY-MM-DD format.
 */
function nextOccurrenceOf(dayName: string): string {
  const targetDay = DAY_NAMES.indexOf(dayName.toLowerCase());
  const d = new Date();
  d.setDate(d.getDate() + 1); // start from tomorrow
  if (targetDay >= 1 && targetDay <= 5) {
    // Find the next occurrence of the target weekday
    while (d.getDay() !== targetDay) {
      d.setDate(d.getDate() + 1);
    }
  } else {
    // Fallback: next weekday
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
  }
  return d.toISOString().split('T')[0];
}

/**
 * Run the full OptimoRoute feasibility probe for an address.
 *
 * Creates a temporary order, runs route planning, checks if the order
 * gets scheduled, then cleans up. Takes up to ~60s due to polling.
 *
 * @param optimalDay Optional day of week (e.g., "tuesday") to test — if provided,
 *                   the probe targets that specific day instead of an arbitrary weekday.
 */
export async function checkRouteFeasibility(address: string, propertyId: string, optimalDay?: string): Promise<FeasibilityResult> {
  const tempOrderNo = `FEASIBILITY-${propertyId.substring(0, 8).toUpperCase()}-${Date.now()}`;

  const dateStr = optimalDay ? nextOccurrenceOf(optimalDay) : (() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
      tomorrow.setDate(tomorrow.getDate() + 1);
    }
    return tomorrow.toISOString().split('T')[0];
  })();

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
        // Step 4: Check if order got scheduled and extract route info
        const schedInfo = await optimo.getSchedulingInfo(tempOrderNo);
        if (schedInfo.orderScheduled) {
          // Extract the scheduled day from the date we tested
          const testDate = new Date(dateStr + 'T12:00:00');
          const scheduledDay = DAY_NAMES[testDate.getDay()];
          result = {
            feasible: true,
            reason: 'scheduled',
            scheduledDay,
            driverName: schedInfo.scheduleInformation?.driverName,
          };
        } else {
          result = { feasible: false, reason: 'not_schedulable' };
        }
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
 *
 * @param optimalDay Optional day of week from route optimization (e.g., "tuesday").
 *                   If provided, the feasibility check tests that specific day and
 *                   the confirmed day is stored as the property's pickup_day.
 */
export async function runFeasibilityAndApprove(
  propertyId: string,
  userId: string,
  address: string,
  optimalDay?: string,
): Promise<void> {
  const result = await checkRouteFeasibility(address, propertyId, optimalDay);

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

  // Store feasibility-confirmed pickup day (overrides haversine estimate)
  const confirmedDay = result.scheduledDay || optimalDay;
  if (confirmedDay) {
    try {
      await storage.updateProperty(propertyId, {
        pickup_day: confirmedDay,
        pickup_day_source: 'feasibility_confirmed',
        pickup_day_detected_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Failed to store feasibility-confirmed pickup day:', e);
    }
  }

  // Activate pending selections, then notify based on outcome
  try {
    const activation = await activatePendingSelections(propertyId, userId, {
      source: 'auto_approval',
    });

    // Notify customer if activation succeeded or there were simply no selections yet
    if (activation.activated > 0 || activation.failed === 0) {
      const msg = approvalMessage(address, confirmedDay, activation.rentalDeliveries > 0);
      sendServiceUpdate(userId, msg.subject, msg.body).catch(err => {
        console.error('Auto-approval notification failed:', err);
      });
    } else {
      console.error(`Auto-activation failed for all ${activation.failed} selections on property ${propertyId} — notification withheld`);
    }
  } catch (err) {
    console.error('Auto-activation after feasibility failed:', err);
  }
}
