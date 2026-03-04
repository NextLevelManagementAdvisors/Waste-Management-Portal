/**
 * OptimoRoute Automated Sync Service
 *
 * Maintains a rolling 4-week window of collection orders in OptimoRoute:
 *  1. Detect/refresh collection days from completion history (collectionDayDetector)
 *  2. Generate future collection dates per location based on day + frequency
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
import { detectAndStoreCollectionDays } from './collectionDayDetector';
import { findOptimalCollectionDay } from './collectionDayOptimizer';
import { sendCollectionCompleteNotification } from './notificationService';

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
  locationsProcessed: number;
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

// ── Collection date generation ──

const DAY_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

/**
 * Generate all future collection dates within the rolling window based on day + frequency.
 */
export function generateCollectionDates(
  collectionDay: string,
  frequency: string,
  windowDays: number = getSyncWindowDays(),
  anchorDate?: string
): string[] {
  const targetDow = DAY_MAP[collectionDay.toLowerCase()];
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
 * Generate deterministic order number for a location + date.
 */
function syncOrderNo(locationId: string, date: string): string {
  return `SYNC-${locationId.substring(0, 8).toUpperCase()}-${date.replace(/-/g, '')}`;
}

// ── Per-location order collection (batch-friendly) ──

interface CollectedOrder {
  orderNo: string;
  locationId: string;
  scheduledDate: string;
  bulkInput: optimo.BulkOrderInput;
}

/**
 * Collect orders that need to be created for a location (does NOT call the API).
 * Returns the orders to batch-submit later.
 */
async function collectLocationOrders(location: any): Promise<{ orders: CollectedOrder[]; skipped: number; errors: string[] }> {
  if (!location.collection_day) {
    return { orders: [], skipped: 1, errors: [] };
  }

  const dates = generateCollectionDates(
    location.collection_day,
    location.collection_frequency || 'weekly'
  );

  const orders: CollectedOrder[] = [];
  let skipped = 0;
  const errors: string[] = [];

  for (const date of dates) {
    const orderNo = syncOrderNo(location.id, date);

    // Check local ledger for existing active order
    const existing = await storage.getSyncOrderByOrderNo(orderNo);
    if (existing && existing.status === 'active') {
      skipped++;
      continue;
    }

    // Check customer skip intent
    const skipCheck = await pool.query(
      `SELECT 1 FROM collection_intents WHERE location_id = $1 AND collection_date = $2 AND intent = 'skip'`,
      [location.id, date]
    );
    if (skipCheck.rows.length > 0) {
      skipped++;
      continue;
    }

    const customerName = `${location.first_name} ${location.last_name}`;
    orders.push({
      orderNo,
      locationId: location.id,
      scheduledDate: date,
      bulkInput: {
        orderNo,
        type: 'P',
        date,
        location: {
          address: location.address,
          locationName: customerName,
        },
        duration: 10,
        notes: `Auto-synced | ${location.collection_frequency || 'weekly'} collection`,
        ...(location.email && { email: location.email }),
        ...(location.zone_driver_serial && { assignedTo: { serial: location.zone_driver_serial } }),
      },
    });
  }

  return { orders, skipped, errors };
}

/**
 * Legacy single-order sync (used by optimizeRoute and other callers).
 */
async function syncLocationOrders(location: any): Promise<{ created: number; skipped: number; errors: string[] }> {
  const { orders, skipped, errors } = await collectLocationOrders(location);

  let created = 0;
  for (const order of orders) {
    try {
      await optimo.createOrder({
        orderNo: order.orderNo,
        type: 'P',
        date: order.scheduledDate,
        address: order.bulkInput.location.address,
        locationName: order.bulkInput.location.locationName,
        duration: order.bulkInput.duration || 10,
        notes: order.bulkInput.notes || '',
        ...(order.bulkInput.email && { email: order.bulkInput.email }),
        ...(order.bulkInput.assignedTo && { assignedTo: order.bulkInput.assignedTo }),
      });
      await storage.createSyncOrder({
        locationId: order.locationId,
        orderNo: order.orderNo,
        scheduledDate: order.scheduledDate,
      });
      created++;
    } catch (err: any) {
      errors.push(`${order.orderNo}: ${err.message || 'Unknown error'}`);
    }
  }

  return { created, skipped, errors };
}

// ── Cleanup ──

/**
 * Delete all future OptimoRoute orders for a location (e.g., after subscription cancellation).
 */
export async function cleanupFutureOrdersForLocation(locationId: string): Promise<{ deleted: number; errors: number }> {
  const futureOrders = await storage.getFutureSyncOrdersForLocation(locationId);
  if (futureOrders.length === 0) return { deleted: 0, errors: 0 };

  // Batch delete from OptimoRoute
  const orderNos = futureOrders.map(o => o.order_no);
  try {
    await optimo.deleteOrders(orderNos, true);
  } catch (err: any) {
    console.warn(`[OptimoSync] Batch delete from OptimoRoute failed for location ${locationId}:`, err.message);
  }

  // Mark all as deleted locally
  let deleted = 0;
  let errors = 0;
  for (const order of futureOrders) {
    try {
      await storage.markSyncOrderDeleted(order.order_no);
      deleted++;
    } catch {
      errors++;
    }
  }

  console.log(`[OptimoSync] Cleanup for location ${locationId}: ${deleted} deleted, ${errors} errors`);
  return { deleted, errors };
}

/**
 * Find and clean up orders for locations that no longer have active subscriptions.
 */
async function cleanupOrphanedOrders(): Promise<{ deleted: number; errors: number }> {
  const orphanedIds = await storage.getOrphanedSyncLocationIds();
  let totalDeleted = 0;
  let totalErrors = 0;

  for (const locationId of orphanedIds) {
    const result = await cleanupFutureOrdersForLocation(locationId);
    totalDeleted += result.deleted;
    totalErrors += result.errors;
  }

  if (orphanedIds.length > 0) {
    console.log(`[OptimoSync] Orphan cleanup: ${orphanedIds.length} locations, ${totalDeleted} orders deleted`);
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
    // Step 1: Detect/update collection days
    const detection = await detectAndStoreCollectionDays();

    // Step 1.5: Retry optimization for approved locations still missing collection_day
    let routeAssignments = 0;
    try {
      const unassigned = await storage.getApprovedLocationsWithoutCollectionDay();
      for (const loc of unassigned) {
        try {
          const result = await findOptimalCollectionDay(loc.id);
          if (result) {
            await storage.updateLocationCollectionSchedule(loc.id, {
              collection_day: result.collection_day,
              collection_day_source: 'route_optimized',
              collection_day_detected_at: new Date().toISOString(),
            });
            routeAssignments++;
          }
        } catch (e: any) {
          console.error(`[OptimoSync] Collection day optimization failed for location ${loc.id}:`, e.message);
        }
      }
      if (routeAssignments > 0) {
        console.log(`[OptimoSync] Auto-assigned collection day to ${routeAssignments} locations`);
      }
    } catch (e: any) {
      console.error('[OptimoSync] Failed to retry collection day assignments:', e.message);
    }

    // Step 2: Get eligible locations
    const locations = await storage.getLocationsForSync();

    // Step 3: Collect orders across all locations, then batch-submit
    let totalCreated = 0;
    let totalSkipped = 0;
    let totalErrored = 0;
    const allCollected: CollectedOrder[] = [];

    for (const loc of locations) {
      try {
        const result = await collectLocationOrders(loc);
        allCollected.push(...result.orders);
        totalSkipped += result.skipped;
        totalErrored += result.errors.length;
      } catch (err: any) {
        totalErrored++;
        console.error(`[OptimoSync] Error collecting orders for location ${loc.id}:`, err.message);
      }
    }

    // Batch-submit to OptimoRoute
    if (allCollected.length > 0) {
      try {
        const bulkInputs = allCollected.map(o => o.bulkInput);
        const batchResults = await optimo.createOrUpdateOrders(bulkInputs);

        // Build a set of successfully created order numbers
        const successSet = new Set<string>();
        for (const batch of batchResults) {
          if (batch.orders) {
            for (const r of batch.orders) {
              if (r.success !== false) successSet.add(r.orderNo);
              else totalErrored++;
            }
          } else if (batch.success !== false) {
            // Whole batch succeeded — mark all in this batch as successful
            for (const input of bulkInputs) successSet.add(input.orderNo);
          }
        }

        // Record successful orders in local ledger
        for (const order of allCollected) {
          if (successSet.has(order.orderNo)) {
            try {
              await storage.createSyncOrder({
                locationId: order.locationId,
                orderNo: order.orderNo,
                scheduledDate: order.scheduledDate,
              });
              totalCreated++;
            } catch (err: any) {
              totalErrored++;
              console.error(`[OptimoSync] Failed to record ledger entry for ${order.orderNo}:`, err.message);
            }
          }
        }
      } catch (err: any) {
        console.error('[OptimoSync] Batch order creation failed, falling back to individual:', err.message);
        // Fallback: create one at a time
        for (const order of allCollected) {
          try {
            await optimo.createOrder({
              orderNo: order.orderNo,
              type: 'P',
              date: order.scheduledDate,
              address: order.bulkInput.location.address,
              locationName: order.bulkInput.location.locationName,
              duration: order.bulkInput.duration || 10,
              notes: order.bulkInput.notes || '',
            });
            await storage.createSyncOrder({
              locationId: order.locationId,
              orderNo: order.orderNo,
              scheduledDate: order.scheduledDate,
            });
            totalCreated++;
          } catch (fallbackErr: any) {
            totalErrored++;
          }
        }
      }
    }

    // Step 4: Clean up orphaned orders
    const cleanup = await cleanupOrphanedOrders();

    // Step 5: Send collection-complete notifications for past orders not yet notified
    try {
      const unnotified = await storage.query(
        `SELECT o.id, o.location_id, o.order_no, o.scheduled_date,
                l.address, l.user_id
         FROM optimo_sync_orders o
         JOIN locations l ON l.id = o.location_id
         WHERE o.status = 'active'
           AND o.scheduled_date < CURRENT_DATE
           AND (o.customer_notified = FALSE OR o.customer_notified IS NULL)
         ORDER BY o.scheduled_date DESC
         LIMIT 50`
      );
      for (const row of unnotified.rows) {
        try {
          await sendCollectionCompleteNotification(
            row.user_id,
            row.address,
            new Date(row.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          );
          await storage.query(
            `UPDATE optimo_sync_orders SET customer_notified = TRUE WHERE id = $1`,
            [row.id]
          );
        } catch (e: any) {
          console.error(`[OptimoSync] Failed to notify for order ${row.order_no}:`, e.message);
        }
      }
      if (unnotified.rows.length > 0) {
        console.log(`[OptimoSync] Sent collection-complete notifications for ${unnotified.rows.length} orders`);
      }
    } catch (e: any) {
      console.error('[OptimoSync] Collection notification step failed:', e.message);
    }

    const result: SyncRunResult = {
      logId,
      locationsProcessed: locations.length,
      ordersCreated: totalCreated,
      ordersSkipped: totalSkipped,
      ordersErrored: totalErrored,
      ordersDeleted: cleanup.deleted,
      detectionUpdates: detection.updated,
    };

    await storage.updateSyncLogEntry(logId, {
      finished_at: new Date().toISOString(),
      status: 'completed',
      locations_processed: result.locationsProcessed,
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
  const locations = await storage.getLocationsForSync();
  const preview: any[] = [];
  let totalWouldCreate = 0;
  let totalWouldSkip = 0;

  for (const loc of locations) {
    if (!loc.collection_day) {
      preview.push({
        location: { id: loc.id, address: loc.address, customer: `${loc.first_name} ${loc.last_name}` },
        collectionDay: null,
        frequency: loc.collection_frequency,
        dates: [],
        status: 'no_collection_day',
      });
      totalWouldSkip++;
      continue;
    }

    const dates = generateCollectionDates(loc.collection_day, loc.collection_frequency || 'weekly');
    const wouldCreate: string[] = [];
    const alreadyExists: string[] = [];

    for (const date of dates) {
      const orderNo = syncOrderNo(loc.id, date);
      const existing = await storage.getSyncOrderByOrderNo(orderNo);
      if (existing && existing.status === 'active') {
        alreadyExists.push(date);
      } else {
        wouldCreate.push(date);
      }
    }

    preview.push({
      location: { id: loc.id, address: loc.address, customer: `${loc.first_name} ${loc.last_name}` },
      collectionDay: loc.collection_day,
      frequency: loc.collection_frequency,
      dates: wouldCreate,
      existing: alreadyExists,
      status: wouldCreate.length > 0 ? 'will_create' : 'up_to_date',
    });

    totalWouldCreate += wouldCreate.length;
  }

  return { total: locations.length, wouldCreate: totalWouldCreate, wouldSkip: totalWouldSkip, preview };
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
