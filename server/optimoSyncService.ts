/**
 * OptimoRoute Automated Sync Service
 *
 * Maintains a rolling 4-week window of pickup orders in OptimoRoute:
 *  1. Detect/refresh pickup days from completion history (pickupDayDetector)
 *  2. Generate future pickup dates per property based on day + frequency
 *  3. Create orders in OptimoRoute with deterministic naming (SYNC-{id}-{date})
 *  4. Track every order in a local ledger (optimo_sync_orders) for dedup
 *  5. Clean up orphaned orders when subscriptions are cancelled/paused
 *
 * Runs automatically once per day via the scheduler in index.ts, and can be
 * triggered manually from the admin UI.
 */
import { pool } from './db';
import { storage } from './storage';
import * as optimo from './optimoRouteClient';
import { detectAndStorePickupDays } from './pickupDayDetector';
import { findOptimalPickupDay } from './pickupDayOptimizer';

// ── Types ──

interface DriverInfo {
  serial: string;
  name: string;
  externalId?: string;
  vehicleRegistration?: string | null;
  vehicleLabel?: string | null;
  totalRoutes: number;
  totalStops: number;
  totalDistanceKm: number;
  totalDurationMin: number;
  lastRouteDate: string;
  recentStopAddresses: string[];
}

export interface SyncRunResult {
  logId: string;
  propertiesProcessed: number;
  ordersCreated: number;
  ordersSkipped: number;
  ordersErrored: number;
  ordersDeleted: number;
  detectionUpdates: number;
}

// ── Configuration ──
// Read dynamically so admin UI changes take effect without restart
function getSyncWindowDays(): number {
  return parseInt(process.env.OPTIMO_SYNC_WINDOW_DAYS || '28', 10);
}

// ── Pickup date generation ──

const DAY_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

/**
 * Generate all future pickup dates within the rolling window based on day + frequency.
 */
export function generatePickupDates(
  pickupDay: string,
  frequency: string,
  windowDays: number = getSyncWindowDays(),
  anchorDate?: string
): string[] {
  const targetDow = DAY_MAP[pickupDay.toLowerCase()];
  if (targetDow === undefined) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + windowDays);

  // Find next occurrence of the target day (starting from tomorrow)
  const next = new Date(today);
  next.setDate(next.getDate() + 1);
  while (next.getDay() !== targetDow) next.setDate(next.getDate() + 1);

  const interval = frequency === 'bi-weekly' ? 14 : frequency === 'monthly' ? 28 : 7;

  // For bi-weekly/monthly: align to anchor date if provided
  if (interval > 7 && anchorDate) {
    const anchor = new Date(anchorDate + 'T00:00:00');
    if (!isNaN(anchor.getTime())) {
      // Calculate weeks between anchor and next occurrence
      const diffMs = next.getTime() - anchor.getTime();
      const diffDays = Math.round(diffMs / 86400000);
      const remainder = ((diffDays % interval) + interval) % interval;
      if (remainder !== 0) {
        next.setDate(next.getDate() + (interval - remainder));
      }
    }
  }

  const dates: string[] = [];
  const cursor = new Date(next);
  while (cursor <= endDate) {
    dates.push(cursor.toISOString().split('T')[0]);
    cursor.setDate(cursor.getDate() + interval);
  }
  return dates;
}

/**
 * Generate deterministic order number for a property + date.
 */
function syncOrderNo(propertyId: string, date: string): string {
  return `SYNC-${propertyId.substring(0, 8).toUpperCase()}-${date.replace(/-/g, '')}`;
}

// ── Per-property sync ──

async function syncPropertyOrders(property: any): Promise<{ created: number; skipped: number; errors: string[] }> {
  if (!property.pickup_day) {
    return { created: 0, skipped: 1, errors: [] };
  }

  const dates = generatePickupDates(
    property.pickup_day,
    property.pickup_frequency || 'weekly'
  );

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const date of dates) {
    const orderNo = syncOrderNo(property.id, date);

    // Check local ledger for existing active order
    const existing = await storage.getSyncOrderByOrderNo(orderNo);
    if (existing && existing.status === 'active') {
      skipped++;
      continue;
    }

    // Check customer skip intent
    const skipCheck = await pool.query(
      `SELECT 1 FROM collection_intents WHERE property_id = $1 AND pickup_date = $2 AND intent = 'skip'`,
      [property.id, date]
    );
    if (skipCheck.rows.length > 0) {
      skipped++;
      continue;
    }

    try {
      const customerName = `${property.first_name} ${property.last_name}`;
      await optimo.createOrder({
        orderNo,
        type: 'P',
        date,
        address: property.address,
        locationName: customerName,
        duration: 10,
        notes: `Auto-synced | ${property.pickup_frequency || 'weekly'} pickup`,
      });
      await storage.createSyncOrder({
        propertyId: property.id,
        orderNo,
        scheduledDate: date,
      });
      created++;
    } catch (err: any) {
      errors.push(`${orderNo}: ${err.message || 'Unknown error'}`);
    }
  }

  return { created, skipped, errors };
}

// ── Cleanup ──

/**
 * Delete all future OptimoRoute orders for a property (e.g., after subscription cancellation).
 */
export async function cleanupFutureOrdersForProperty(propertyId: string): Promise<{ deleted: number; errors: number }> {
  const futureOrders = await storage.getFutureSyncOrdersForProperty(propertyId);
  let deleted = 0;
  let errors = 0;

  for (const order of futureOrders) {
    try {
      await optimo.deleteOrder(order.order_no, true);
    } catch (err: any) {
      // Order may already be deleted in OptimoRoute — still mark locally
      console.warn(`[OptimoSync] Could not delete ${order.order_no} from OptimoRoute:`, err.message);
    }
    try {
      await storage.markSyncOrderDeleted(order.order_no);
      deleted++;
    } catch {
      errors++;
    }
  }

  console.log(`[OptimoSync] Cleanup for property ${propertyId}: ${deleted} deleted, ${errors} errors`);
  return { deleted, errors };
}

/**
 * Find and clean up orders for properties that no longer have active subscriptions.
 */
async function cleanupOrphanedOrders(): Promise<{ deleted: number; errors: number }> {
  const orphanedIds = await storage.getOrphanedSyncPropertyIds();
  let totalDeleted = 0;
  let totalErrors = 0;

  for (const propertyId of orphanedIds) {
    const result = await cleanupFutureOrdersForProperty(propertyId);
    totalDeleted += result.deleted;
    totalErrors += result.errors;
  }

  if (orphanedIds.length > 0) {
    console.log(`[OptimoSync] Orphan cleanup: ${orphanedIds.length} properties, ${totalDeleted} orders deleted`);
  }
  return { deleted: totalDeleted, errors: totalErrors };
}

// ── Main orchestrator ──

/**
 * Run the full automated sync: detect pickup days, create orders, clean up orphans.
 */
export async function runAutomatedSync(runType: 'scheduled' | 'manual' = 'scheduled'): Promise<SyncRunResult> {
  const logId = await storage.createSyncLogEntry(runType);

  try {
    // Step 1: Detect/update pickup days
    const detection = await detectAndStorePickupDays();

    // Step 1.5: Retry optimization for approved properties still missing pickup_day
    let routeAssignments = 0;
    try {
      const unassigned = await storage.getApprovedPropertiesWithoutPickupDay();
      for (const prop of unassigned) {
        try {
          const result = await findOptimalPickupDay(prop.id);
          if (result) {
            await storage.updatePropertyPickupSchedule(prop.id, {
              pickup_day: result.pickup_day,
              pickup_day_source: 'route_optimized',
              pickup_day_detected_at: new Date().toISOString(),
            });
            routeAssignments++;
          }
        } catch (e: any) {
          console.error(`[OptimoSync] Pickup day optimization failed for property ${prop.id}:`, e.message);
        }
      }
      if (routeAssignments > 0) {
        console.log(`[OptimoSync] Auto-assigned pickup day to ${routeAssignments} properties`);
      }
    } catch (e: any) {
      console.error('[OptimoSync] Failed to retry pickup day assignments:', e.message);
    }

    // Step 2: Get eligible properties
    const properties = await storage.getPropertiesForSync();

    // Step 3: Sync orders per property
    let totalCreated = 0;
    let totalSkipped = 0;
    let totalErrored = 0;

    for (const prop of properties) {
      try {
        const result = await syncPropertyOrders(prop);
        totalCreated += result.created;
        totalSkipped += result.skipped;
        totalErrored += result.errors.length;
      } catch (err: any) {
        totalErrored++;
        console.error(`[OptimoSync] Error syncing property ${prop.id}:`, err.message);
      }
    }

    // Step 4: Clean up orphaned orders
    const cleanup = await cleanupOrphanedOrders();

    const result: SyncRunResult = {
      logId,
      propertiesProcessed: properties.length,
      ordersCreated: totalCreated,
      ordersSkipped: totalSkipped,
      ordersErrored: totalErrored,
      ordersDeleted: cleanup.deleted,
      detectionUpdates: detection.updated,
    };

    await storage.updateSyncLogEntry(logId, {
      finished_at: new Date().toISOString(),
      status: 'completed',
      properties_processed: result.propertiesProcessed,
      orders_created: result.ordersCreated,
      orders_skipped: result.ordersSkipped,
      orders_errored: result.ordersErrored,
      orders_deleted: result.ordersDeleted,
      detection_updates: result.detectionUpdates,
    });

    return result;
  } catch (error: any) {
    await storage.updateSyncLogEntry(logId, {
      finished_at: new Date().toISOString(),
      status: 'failed',
      error_message: error.message || 'Unknown error',
    });
    throw error;
  }
}

// ── Preview (dry-run) ──

/**
 * Preview what the sync would do without creating any orders.
 */
export async function previewCustomerOrderSync() {
  const properties = await storage.getPropertiesForSync();
  const preview: any[] = [];
  let totalWouldCreate = 0;
  let totalWouldSkip = 0;

  for (const prop of properties) {
    if (!prop.pickup_day) {
      preview.push({
        property: { id: prop.id, address: prop.address, customer: `${prop.first_name} ${prop.last_name}` },
        pickupDay: null,
        frequency: prop.pickup_frequency,
        dates: [],
        status: 'no_pickup_day',
      });
      totalWouldSkip++;
      continue;
    }

    const dates = generatePickupDates(prop.pickup_day, prop.pickup_frequency || 'weekly');
    const wouldCreate: string[] = [];
    const alreadyExists: string[] = [];

    for (const date of dates) {
      const orderNo = syncOrderNo(prop.id, date);
      const existing = await storage.getSyncOrderByOrderNo(orderNo);
      if (existing && existing.status === 'active') {
        alreadyExists.push(date);
      } else {
        wouldCreate.push(date);
      }
    }

    preview.push({
      property: { id: prop.id, address: prop.address, customer: `${prop.first_name} ${prop.last_name}` },
      pickupDay: prop.pickup_day,
      frequency: prop.pickup_frequency,
      dates: wouldCreate,
      existing: alreadyExists,
      status: wouldCreate.length > 0 ? 'will_create' : 'up_to_date',
    });

    totalWouldCreate += wouldCreate.length;
  }

  return { total: properties.length, wouldCreate: totalWouldCreate, wouldSkip: totalWouldSkip, preview };
}

/**
 * Execute customer order sync (calls the full automated sync).
 */
export async function executeCustomerOrderSync() {
  return runAutomatedSync('manual');
}

// ═══════════════════════════════════════════════════════
// Driver Sync (unchanged)
// ═══════════════════════════════════════════════════════

/** Fetch 7 days of OptimoRoute routes and match against local driver_profiles. */
export async function previewDriverSync() {
  const driverMap = new Map<string, DriverInfo>();
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    try {
      const routeResult = await optimo.getRoutes(dateStr);
      const routes = routeResult.routes || (routeResult as any).data || [];
      for (const route of routes) {
        const serial = route.driverSerial || route.driverName || '';
        if (!serial) continue;
        const existing = driverMap.get(serial);
        const stopCount = (route.stops || []).length;
        const distKm = route.distance || 0;
        const durMin = route.duration || 0;
        if (existing) {
          existing.totalRoutes++;
          existing.totalStops += stopCount;
          existing.totalDistanceKm += distKm;
          existing.totalDurationMin += durMin;
          if (dateStr > existing.lastRouteDate) existing.lastRouteDate = dateStr;
          if (!existing.vehicleRegistration && route.vehicleRegistration) existing.vehicleRegistration = route.vehicleRegistration;
          if (!existing.vehicleLabel && route.vehicleLabel) existing.vehicleLabel = route.vehicleLabel;
        } else {
          const sampleAddresses = (route.stops || [])
            .slice(0, 5)
            .map((s: any) => s.address || s.location?.address || '')
            .filter(Boolean);
          driverMap.set(serial, {
            serial,
            name: route.driverName || `Driver ${serial}`,
            externalId: route.driverExternalId,
            vehicleRegistration: route.vehicleRegistration,
            vehicleLabel: route.vehicleLabel,
            totalRoutes: 1,
            totalStops: stopCount,
            totalDistanceKm: distKm,
            totalDurationMin: durMin,
            lastRouteDate: dateStr,
            recentStopAddresses: sampleAddresses,
          });
        }
      }
    } catch {}
  }

  const localResult = await pool.query(
    `SELECT dp.id, dp.user_id, dp.name, dp.optimoroute_driver_id, dp.status,
            u.first_name, u.last_name, u.email
     FROM driver_profiles dp
     LEFT JOIN users u ON u.id = dp.user_id
     ORDER BY dp.name`
  );

  const localDrivers = localResult.rows;
  const matched: any[] = [];
  const unmatchedOptimo: any[] = [];
  const unmatchedLocal: any[] = [];

  for (const [, optimoDriver] of driverMap) {
    const localMatch = localDrivers.find((d: any) => d.optimoroute_driver_id === optimoDriver.serial);
    if (localMatch) {
      matched.push({ optimoDriver, localDriver: localMatch });
    } else {
      unmatchedOptimo.push(optimoDriver);
    }
  }

  for (const local of localDrivers) {
    if (!local.optimoroute_driver_id || !driverMap.has(local.optimoroute_driver_id)) {
      unmatchedLocal.push(local);
    }
  }

  return { matched, unmatchedOptimo, unmatchedLocal };
}

/** Update driver_profiles with optimoroute_driver_id mappings. */
export async function executeDriverSync(
  mappings: Array<{ optimorouteSerial: string; driverProfileId: string }>
): Promise<{ linked: number }> {
  let linked = 0;
  for (const mapping of mappings) {
    const { optimorouteSerial, driverProfileId } = mapping;
    if (optimorouteSerial == null || !driverProfileId) continue;
    await pool.query(
      `UPDATE driver_profiles SET optimoroute_driver_id = $1 WHERE id = $2`,
      [optimorouteSerial, driverProfileId]
    );
    linked++;
  }
  return { linked };
}

// ── Per-Route Optimization ──

export interface OptimizeRouteResult {
  planningId: string | undefined;
  ordersCreated: number;
}

/**
 * Create OptimoRoute orders for a route's stops and trigger route optimization.
 * Returns the planningId for status polling.
 */
export async function optimizeRoute(routeId: string): Promise<OptimizeRouteResult> {
  // 1. Load route and validate
  const route = await storage.getRouteById(routeId);
  if (!route) throw new Error('Route not found');
  if (!route.assigned_driver_id) throw new Error('Route has no assigned driver');

  // 2. Get driver's OptimoRoute serial
  const driver = await storage.getDriverById(route.assigned_driver_id);
  if (!driver) throw new Error('Assigned driver not found');
  if (!driver.optimoroute_driver_id) throw new Error('Driver has no OptimoRoute ID — sync the driver first');

  // 3. Load stops
  const stops = await storage.getRouteStops(routeId);
  if (stops.length === 0) throw new Error('Route has no stops');

  const scheduledDate = String(route.scheduled_date).split('T')[0];

  // 4. Create OptimoRoute orders for each stop
  const orderNos: string[] = [];
  const routePrefix = routeId.substring(0, 8);

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    if (!stop.address) {
      console.warn(`[optimizeRoute] Stop ${stop.id} has no address, skipping`);
      continue;
    }
    const orderNo = `RTE-${routePrefix}-${String(i + 1).padStart(3, '0')}`;

    try {
      await optimo.createOrder({
        orderNo,
        date: scheduledDate,
        type: 'P',
        address: stop.address,
        duration: 15,
      });

      await storage.updateRouteStop(stop.id, { optimo_order_no: orderNo, status: 'optimized' });
      orderNos.push(orderNo);
    } catch (err) {
      console.error(`Failed to create OptimoRoute order for stop ${stop.id}:`, err);
    }
  }

  if (orderNos.length === 0) throw new Error('No OptimoRoute orders could be created');

  // 5. Start route planning scoped to this route's orders and driver
  const planning = await optimo.startPlanning({
    date: scheduledDate,
    balancing: 'OFF',
    balanceBy: 'WT',
    useOrders: orderNos,
    useDrivers: [{ driverSerial: driver.optimoroute_driver_id }],
  });

  // 6. Store planning ID on the route
  const planId = planning.planningId != null ? String(planning.planningId) : undefined;
  await storage.updateRoute(routeId, { optimo_planning_id: planId });

  return {
    planningId: planId,
    ordersCreated: orderNos.length,
  };
}

/**
 * Check the optimization status for a route and update stop sequence when done.
 */
export async function checkRouteOptimizationStatus(routeId: string): Promise<{ status: string; progress?: number }> {
  const route = await storage.getRouteById(routeId);
  if (!route?.optimo_planning_id) throw new Error('No active optimization for this route');

  const result = await optimo.getPlanningStatus(Number(route.optimo_planning_id));

  // If finished, update stop sequence numbers from the optimized route
  if (result.status === 'F') {
    try {
      const routeData = await optimo.getRoutes(route.scheduled_date);
      const stops = await storage.getRouteStops(routeId);
      const stopsByOrder = new Map(stops.map(s => [s.optimo_order_no, s]));

      for (const optimoRoute of routeData.routes) {
        if (!optimoRoute.stops) continue;
        for (const optimoStop of optimoRoute.stops) {
          const stop = stopsByOrder.get(optimoStop.orderNo);
          if (stop) {
            await storage.updateRouteStop(stop.id, { stop_number: optimoStop.stopNumber });
          }
        }
      }
    } catch (err) {
      console.error('Failed to update stop sequences after optimization:', err);
    }
  }

  return {
    status: result.status || 'unknown',
    progress: result.percentageComplete,
  };
}

// Backward-compatible aliases
export const optimizeRouteJob = optimizeRoute;
