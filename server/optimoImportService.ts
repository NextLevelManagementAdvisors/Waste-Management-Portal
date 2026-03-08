import { storage } from './storage.ts';
import * as optimo from './optimoRouteClient.ts';
import {
  fetchCompletionPayloadsByOrderId,
  getOptimoApiOrderIdentifier,
  normalizeOptimoStatus,
} from './optimoOrderHelpers.ts';

const OMITTED_STOP_TYPES = new Set(['break', 'depot', 'start', 'end']);
const TERMINAL_ORDER_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export interface ImportResult {
  date: string;
  routesImported: number;
  routesUpdated: number;
  routesSkipped: number;
  ordersImported: number;
  ordersMatched: number;
  ordersUnmatched: number;
  errors: string[];
}

interface ImportedOrderData {
  location_id?: string | null;
  address?: string;
  location_name?: string;
  optimo_order_no?: string;
  order_number?: number;
  scheduled_at?: string;
  order_type?: string;
}

function normalizeAddress(address?: string | null): string {
  return (address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function formatOptimoTime(timeObject?: { localTime?: string; utcTime?: string } | null): string | undefined {
  const raw = timeObject?.localTime || timeObject?.utcTime;
  if (!raw) return undefined;

  const simpleMatch = raw.match(/^(\d{1,2}:\d{2})/);
  if (simpleMatch) return simpleMatch[1];

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(11, 16);
  }

  return raw;
}

async function resolveAssignedDriverId(optimoRoute: any): Promise<string | undefined> {
  for (const identity of [optimoRoute.driverSerial, optimoRoute.driverName]) {
    if (!identity || typeof identity !== 'string') continue;
    const localDriver = await storage.getDriverByOptimoSerial(identity.trim());
    if (localDriver) return localDriver.id;
  }

  const driverName = typeof optimoRoute.driverName === 'string' ? optimoRoute.driverName.trim() : '';
  if (!driverName) return undefined;

  const byName = await storage.query(
    `SELECT id
     FROM driver_profiles
     WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`,
    [driverName]
  );

  return byName.rows.length === 1 ? byName.rows[0].id : undefined;
}

async function findExistingImportedRoute(date: string, optimoRouteKey: string, orderIdentifiers: string[]): Promise<any | null> {
  const byKey = await storage.getRouteByOptimoKey(optimoRouteKey);
  if (byKey) return byKey;

  if (orderIdentifiers.length === 0) return null;

  // Driver assignment can change between imports, so fall back to order overlap before creating a duplicate route.
  const overlap = await storage.query(
    `SELECT r.id, COUNT(*)::int AS matched_order_count
     FROM routes r
     JOIN route_orders ro ON ro.route_id = r.id
     WHERE r.scheduled_date = $1
       AND r.source = 'optimo_import'
       AND ro.optimo_order_no = ANY($2::text[])
     GROUP BY r.id
     ORDER BY COUNT(*) DESC
     LIMIT 1`,
    [date, orderIdentifiers]
  );

  const routeId = overlap.rows[0]?.id;
  return routeId ? storage.getRouteById(routeId) : null;
}

async function buildImportedOrders(realOrders: any[], result: ImportResult): Promise<ImportedOrderData[]> {
  const orderData: ImportedOrderData[] = [];

  for (const order of realOrders) {
    const orderAddress = order.address || order.location?.address || '';
    const orderLocationName = order.locationName || order.location?.locationName || '';

    let locationId: string | null = null;
    if (orderAddress) {
      const matched = await storage.findLocationByAddress(orderAddress);
      if (matched) {
        locationId = matched.id;
        result.ordersMatched++;
      } else {
        result.ordersUnmatched++;
      }
    } else {
      result.ordersUnmatched++;
    }

    orderData.push({
      location_id: locationId,
      address: orderAddress || undefined,
      location_name: orderLocationName || undefined,
      optimo_order_no: getOptimoApiOrderIdentifier(order),
      order_number: order.stopNumber != null ? Number(order.stopNumber) : undefined,
      scheduled_at: order.scheduledAt || undefined,
      order_type: 'recurring',
    });
  }

  return orderData;
}

function buildRouteStatus(assignedDriverId: string | undefined, orders: any[]): { status: string; completedAt: string | null } {
  if (orders.length > 0 && orders.every((order: any) => TERMINAL_ORDER_STATUSES.has(String(order.status || '').toLowerCase()))) {
    return { status: 'completed', completedAt: new Date().toISOString() };
  }

  if (orders.some((order: any) => String(order.status || '').toLowerCase() === 'in_progress')) {
    return { status: 'in_progress', completedAt: null };
  }

  return {
    status: assignedDriverId ? 'assigned' : 'open',
    completedAt: null,
  };
}

function selectExistingOrder(existingOrders: any[], incoming: ImportedOrderData, usedOrderIds: Set<string>) {
  return existingOrders.find((order: any) => {
    if (!order?.id || usedOrderIds.has(order.id)) return false;

    if (incoming.optimo_order_no && order.optimo_order_no === incoming.optimo_order_no) return true;
    if (incoming.location_id && order.location_id === incoming.location_id) return true;

    const incomingAddress = normalizeAddress(incoming.address);
    if (incomingAddress && normalizeAddress(order.address) === incomingAddress) return true;

    return false;
  }) || null;
}

async function syncRouteOrders(routeId: string, orderData: ImportedOrderData[]): Promise<any[]> {
  const existingOrders = await storage.getRouteOrders(routeId);
  const usedOrderIds = new Set<string>();
  const ordersToInsert: ImportedOrderData[] = [];

  for (const incoming of orderData) {
    const existingOrder = selectExistingOrder(existingOrders, incoming, usedOrderIds);
    if (!existingOrder) {
      ordersToInsert.push(incoming);
      continue;
    }

    usedOrderIds.add(existingOrder.id);

    const updateFields: any = {};
    if (incoming.optimo_order_no && incoming.optimo_order_no !== existingOrder.optimo_order_no) {
      updateFields.optimo_order_no = incoming.optimo_order_no;
    }
    if (incoming.order_number != null && Number(existingOrder.order_number) !== Number(incoming.order_number)) {
      updateFields.order_number = incoming.order_number;
    }
    if (incoming.scheduled_at && incoming.scheduled_at !== existingOrder.scheduled_at) {
      updateFields.scheduled_at = incoming.scheduled_at;
    }
    if (incoming.location_name && incoming.location_name !== existingOrder.location_name) {
      updateFields.location_name = incoming.location_name;
    }

    if (Object.keys(updateFields).length > 0) {
      await storage.updateRouteOrder(existingOrder.id, updateFields);
    }
  }

  if (ordersToInsert.length > 0) {
    await storage.addRouteOrders(routeId, ordersToInsert);
  }

  for (const order of existingOrders) {
    // Keep portal-only on-demand orders even when Optimo no longer returns them for the imported route.
    if (usedOrderIds.has(order.id) || order.on_demand_request_id) continue;
    await storage.removeRouteOrder(order.id);
  }

  return storage.getRouteOrders(routeId);
}

async function syncCompletionStatuses(routeId: string): Promise<any[]> {
  const orders = await storage.getRouteOrders(routeId);
  const identifiers = orders
    .map((order: any) => order.optimo_order_no)
    .filter((identifier: any): identifier is string => typeof identifier === 'string' && identifier.length > 0);

  if (identifiers.length === 0) return orders;

  try {
    const completionMap = await fetchCompletionPayloadsByOrderId(identifiers);

    for (const order of orders) {
      if (!order.optimo_order_no) continue;

      const data = completionMap.get(order.optimo_order_no);
      const portalStatus = normalizeOptimoStatus(data?.status) || 'pending';
      const updateFields: any = {};

      if (portalStatus !== order.status) {
        updateFields.status = portalStatus;
      }

      if (data?.form) {
        updateFields.pod_data = JSON.stringify(data.form);
      }

      if (Object.keys(updateFields).length > 0) {
        await storage.updateRouteOrder(order.id, updateFields);
      }
    }

    return storage.getRouteOrders(routeId);
  } catch {
    return orders;
  }
}

export async function importRoutesFromOptimo(date: string): Promise<ImportResult> {
  const result: ImportResult = {
    date,
    routesImported: 0,
    routesUpdated: 0,
    routesSkipped: 0,
    ordersImported: 0,
    ordersMatched: 0,
    ordersUnmatched: 0,
    errors: [],
  };

  // Fetch routes from OptimoRoute API (with polyline data for map display)
  const apiResult = await optimo.getRoutes({
    date,
    includeRoutePolyline: true,
    includeRouteStartEnd: true,
  });
  const routes = apiResult.routes || [];

  for (const optimoRoute of routes) {
    const driverSerial = optimoRoute.driverSerial || optimoRoute.driverName || '';
    if (!driverSerial) {
      result.errors.push('Route with no driver serial/name skipped');
      continue;
    }

    // Dedup key: one route per driver per day
    const optimoRouteKey = `${date}_${driverSerial}`;

    // Filter out break/depot stop types from OptimoRoute API response.
    // Optimo can include depot start/end placeholders that are not real customer orders.
    const realOrders = (optimoRoute.stops || []).filter(
      (order: any) => !OMITTED_STOP_TYPES.has(String(order.type || '').toLowerCase())
    );
    const orderIdentifiers = realOrders
      .map((order: any) => getOptimoApiOrderIdentifier(order))
      .filter((identifier: any): identifier is string => typeof identifier === 'string' && identifier.length > 0);

    const title = `${optimoRoute.driverName || driverSerial} - ${date}`;
    const assignedDriverId = await resolveAssignedDriverId(optimoRoute);
    const nextRouteFields = {
      title,
      scheduled_date: date,
      start_time: formatOptimoTime(optimoRoute.startTime),
      end_time: formatOptimoTime(optimoRoute.endTime),
      estimated_orders: realOrders.length,
      estimated_hours: optimoRoute.duration ? Math.round((optimoRoute.duration / 60) * 10) / 10 : undefined,
      assigned_driver_id: assignedDriverId ?? null,
      route_type: 'daily_route',
      source: 'optimo_import',
      status: assignedDriverId ? 'assigned' : 'open',
      polyline: optimoRoute.routePolyline || null,
    };

    const existing = await findExistingImportedRoute(date, optimoRouteKey, orderIdentifiers);
    let routeId: string;
    if (existing) {
      routeId = existing.id;
      await storage.updateRoute(routeId, {
        ...nextRouteFields,
        optimo_route_key: optimoRouteKey,
      });
      result.routesUpdated++;
    } else {
      const localRoute = await storage.createRoute(nextRouteFields);
      routeId = localRoute.id;
      await storage.updateRoute(routeId, { optimo_route_key: optimoRouteKey });
      result.routesImported++;
    }

    await storage.markRouteSynced(routeId);

    const orderData = await buildImportedOrders(realOrders, result);
    await syncRouteOrders(routeId, orderData);
    result.ordersImported += orderData.length;

    const syncedOrders = await syncCompletionStatuses(routeId);
    const routeStatus = buildRouteStatus(assignedDriverId, syncedOrders);
    await storage.updateRoute(routeId, {
      status: routeStatus.status,
      completed_at: routeStatus.completedAt,
    });
  }

  return result;
}

export interface BatchImportResult {
  from: string;
  to: string;
  totalRoutesImported: number;
  totalRoutesUpdated: number;
  totalRoutesSkipped: number;
  totalOrdersImported: number;
  datesProcessed: number;
  errors: string[];
}

export async function importRoutesForRange(from: string, to: string): Promise<BatchImportResult> {
  const result: BatchImportResult = {
    from,
    to,
    totalRoutesImported: 0,
    totalRoutesUpdated: 0,
    totalRoutesSkipped: 0,
    totalOrdersImported: 0,
    datesProcessed: 0,
    errors: [],
  };

  // Generate each date in the range
  const start = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    try {
      const dayResult = await importRoutesFromOptimo(dateStr);
      result.totalRoutesImported += dayResult.routesImported;
      result.totalRoutesUpdated += dayResult.routesUpdated;
      result.totalRoutesSkipped += dayResult.routesSkipped;
      result.totalOrdersImported += dayResult.ordersImported;
      result.datesProcessed++;
      if (dayResult.errors.length > 0) {
        result.errors.push(...dayResult.errors.map(e => `${dateStr}: ${e}`));
      }
    } catch (e: any) {
      result.errors.push(`${dateStr}: ${e.message}`);
    }
  }

  return result;
}
