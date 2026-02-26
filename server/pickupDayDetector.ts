/**
 * Pickup Day Detector — analyzes OptimoRoute completion history to determine
 * the most likely recurring pickup day for each property address.
 *
 * Uses a simple frequency-counting algorithm: count completed pickups per
 * day-of-week over the last 12 weeks, require a minimum sample size (3) and
 * confidence threshold (50%) before committing a detection result.
 *
 * The batch variant (`detectAndStorePickupDays`) minimizes API calls by
 * fetching all orders in a single searchOrders call, then batch-fetching
 * completion details in groups of 50.
 */
import * as optimo from './optimoRouteClient';
import { storage } from './storage';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const MIN_PICKUPS = parseInt(process.env.OPTIMO_DETECTION_MIN_PICKUPS || '3', 10);
const MIN_CONFIDENCE = parseFloat(process.env.OPTIMO_DETECTION_MIN_CONFIDENCE || '0.5');

export interface DetectionResult {
  day: string;
  confidence: number;
}

/**
 * Detect the most common pickup day for a single address from OptimoRoute history.
 */
export function detectPickupDayFromHistory(
  completionHistory: Array<{ date: string; status: string }>
): DetectionResult | null {
  const completed = completionHistory.filter(h => h.status === 'completed');
  if (completed.length < MIN_PICKUPS) return null;

  const dayCounts: Record<string, number> = {};
  for (const entry of completed) {
    const d = new Date(entry.date + 'T00:00:00Z');
    const dayName = DAY_NAMES[d.getUTCDay()];
    dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
  }

  let bestDay = '';
  let bestCount = 0;
  for (const [day, count] of Object.entries(dayCounts)) {
    if (count > bestCount) {
      bestDay = day;
      bestCount = count;
    }
  }

  const confidence = bestCount / completed.length;
  if (confidence < MIN_CONFIDENCE) return null;

  return { day: bestDay, confidence };
}

/**
 * Detect pickup day for a single address by fetching its OptimoRoute history.
 */
export async function detectPickupDay(address: string): Promise<DetectionResult | null> {
  const history = await optimo.getCompletionHistoryForAddress(address, 12);
  return detectPickupDayFromHistory(history);
}

/**
 * Batch detect and store pickup days for all properties needing detection.
 * Uses optimized batch API calls: one searchOrders + batch getCompletionDetails.
 */
export async function detectAndStorePickupDays(): Promise<{ updated: number; skipped: number; noData: number }> {
  const properties = await storage.getPropertiesNeedingDayDetection();
  if (properties.length === 0) return { updated: 0, skipped: 0, noData: 0 };

  // Fetch all orders from last 12 weeks in one API call
  const today = new Date();
  const pastDate = new Date();
  pastDate.setDate(today.getDate() - 84); // 12 weeks
  const fromStr = pastDate.toISOString().split('T')[0];
  const toStr = today.toISOString().split('T')[0];

  let allOrders: any[] = [];
  try {
    const searchResult = await optimo.searchOrders(fromStr, toStr, true);
    allOrders = searchResult?.orders || [];
  } catch (err) {
    console.error('[PickupDayDetector] Failed to fetch orders:', err);
    return { updated: 0, skipped: 0, noData: properties.length };
  }

  // Fetch completion details in batches of 50
  const orderNos = allOrders.map((o: any) => o.orderNo).filter(Boolean);
  const completionMap = new Map<string, string>();
  for (let i = 0; i < orderNos.length; i += 50) {
    const batch = orderNos.slice(i, i + 50);
    try {
      const completionData = await optimo.getCompletionDetails(batch);
      if (completionData?.orders) {
        for (const c of completionData.orders) {
          const status = c.data?.status;
          if (status === 'success' || status === 'completed') {
            completionMap.set(c.orderNo, 'completed');
          } else if (status === 'failed' || status === 'rejected') {
            completionMap.set(c.orderNo, 'missed');
          }
        }
      }
    } catch {}
  }

  // For orders without explicit completion data that are in the past, assume completed
  for (const order of allOrders) {
    if (!completionMap.has(order.orderNo) && new Date(order.date) < today) {
      completionMap.set(order.orderNo, 'completed');
    }
  }

  let updated = 0;
  let skipped = 0;
  let noData = 0;

  for (const prop of properties) {
    const addr = prop.address.toLowerCase().trim();
    // Filter orders for this property's address (same fuzzy matching as optimoRouteClient)
    const matchingOrders = allOrders.filter((o: any) => {
      const orderAddr = (o.location?.address || '').toLowerCase().trim();
      return orderAddr.includes(addr) || addr.includes(orderAddr);
    });

    const history = matchingOrders.map((o: any) => ({
      date: o.date,
      status: completionMap.get(o.orderNo) || 'scheduled',
    }));

    const result = detectPickupDayFromHistory(history);
    if (result) {
      await storage.updatePropertyPickupSchedule(prop.id, {
        pickup_day: result.day,
        pickup_day_detected_at: new Date().toISOString(),
        pickup_day_source: 'auto_detected',
      });
      updated++;
    } else {
      noData++;
    }
  }

  skipped = properties.length - updated - noData;
  console.log(`[PickupDayDetector] Updated: ${updated}, No data: ${noData}, Skipped: ${skipped}`);
  return { updated, skipped, noData };
}
