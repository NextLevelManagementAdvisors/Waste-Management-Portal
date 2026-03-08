import * as optimo from './optimoRouteClient';

const OPTIMO_ID_RE = /^[0-9a-f]{20,}$/i;
const OMITTED_STOP_TYPES = new Set(['break', 'depot', 'start', 'end']);

export const OPTIMO_STATUS_MAP: Record<string, string> = {
  success: 'completed',
  complete: 'completed',
  completed: 'completed',
  failed: 'failed',
  rejected: 'failed',
  cancelled: 'cancelled',
  on_route: 'in_progress',
  servicing: 'in_progress',
  scheduled: 'scheduled',
  unscheduled: 'pending',
};

export function isOptimoId(identifier?: string | null): boolean {
  if (!identifier) return false;
  return OPTIMO_ID_RE.test(identifier.trim());
}

export function getStoredOptimoOrderNo(routeOrder: any): string | undefined {
  const rawIdentifier = [
    routeOrder?.optimo_order_no,
    routeOrder?.optimoOrderNo,
  ].find(value => typeof value === 'string' && value.trim().length > 0);

  return typeof rawIdentifier === 'string' ? rawIdentifier.trim() : undefined;
}

export function getOptimoApiOrderIdentifier(order: any): string | undefined {
  const rawIdentifier = [
    order?.orderNo,
    order?.id,
  ].find(value => typeof value === 'string' && value.trim().length > 0);

  return typeof rawIdentifier === 'string' ? rawIdentifier.trim() : undefined;
}

export function normalizeOptimoStatus(rawStatus?: string | null): string | null {
  if (!rawStatus) return null;
  const normalized = rawStatus.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return OPTIMO_STATUS_MAP[normalized] ?? normalized;
}

export function extractCompletionPayload(order: any): any | null {
  const nested = order?.data && typeof order.data === 'object' ? order.data : {};
  const form = nested.form ?? nested.completionForm ?? order?.form ?? order?.completionForm;
  const status = nested.status ?? order?.status;

  const payload = {
    ...nested,
    status,
    ...(form ? { form } : {}),
  };

  return Object.keys(payload).length > 0 ? payload : null;
}

export async function fetchCompletionPayloadsByOrderId(identifiers: string[]): Promise<Map<string, any>> {
  const uniqueIdentifiers = Array.from(new Set(
    identifiers
      .map(identifier => identifier?.trim())
      .filter((identifier): identifier is string => Boolean(identifier))
  ));
  const byId = uniqueIdentifiers.filter(isOptimoId);
  const byOrderNo = uniqueIdentifiers.filter(identifier => !isOptimoId(identifier));

  const results = new Map<string, any>();
  const responses = await Promise.all([
    byOrderNo.length > 0 ? optimo.getCompletionDetailsFull(byOrderNo, false) : Promise.resolve(null),
    byId.length > 0 ? optimo.getCompletionDetailsFull(byId, true) : Promise.resolve(null),
  ]);

  const consume = (orders: any[] | undefined, preferId: boolean) => {
    for (const order of orders || []) {
      const identifier = preferId
        ? getOptimoApiOrderIdentifier({ id: order?.id, orderNo: order?.orderNo })
        : getOptimoApiOrderIdentifier({ orderNo: order?.orderNo, id: order?.id });
      const payload = extractCompletionPayload(order);
      if (!identifier || !payload) continue;
      results.set(identifier, payload);
    }
  };

  consume(responses[0]?.orders, false);
  consume(responses[1]?.orders, true);

  return results;
}

function normalizeAddress(address?: string | null): string {
  return (address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getRouteDate(route: any): string {
  const raw = route?.scheduled_date ?? route?.scheduledDate ?? '';
  if (!raw) return '';
  if (raw instanceof Date) return raw.toISOString().split('T')[0];
  if (typeof raw === 'string') return raw.split('T')[0];

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return String(raw).split('T')[0];
}

function getLocalOptimoRouteKey(route: any): string | null {
  const routeKey = route?.optimo_route_key ?? route?.optimoRouteKey;
  if (typeof routeKey === 'string' && routeKey.trim()) return routeKey.trim();

  const date = getRouteDate(route);
  const title = typeof route?.title === 'string' ? route.title.trim() : '';
  if (!date || !title) return null;
  return `${date}_${title.replace(new RegExp(`\\s+-\\s+${date}$`), '')}`;
}

function getOptimoRouteKey(route: any, date: string): string | null {
  const driverKey = route?.driverSerial || route?.driverName || '';
  return driverKey ? `${date}_${driverKey}` : null;
}

export function findMatchingOptimoRoute(localRoute: any, optimoRoutes: any[]): any | null {
  const date = getRouteDate(localRoute);
  const localKey = getLocalOptimoRouteKey(localRoute);
  if (localKey) {
    const keyMatch = optimoRoutes.find(route => getOptimoRouteKey(route, date) === localKey);
    if (keyMatch) return keyMatch;
  }

  const title = typeof localRoute?.title === 'string' ? localRoute.title.trim() : '';
  if (!title) return null;
  return optimoRoutes.find(route => `${route?.driverName || route?.driverSerial || ''} - ${date}` === title) || null;
}

export interface OrderIdentifierBackfill {
  orderId: string;
  identifier: string;
  orderNumber?: number;
  scheduledAt?: string;
}

export function buildOrderIdentifierBackfill(route: any, orders: any[], optimoRoutes: any[]): OrderIdentifierBackfill[] {
  const optimoRoute = findMatchingOptimoRoute(route, optimoRoutes);
  if (!optimoRoute) return [];

  // optimoRoute.stops is the OptimoRoute API field name — each stop is an order on a route
  const optimoOrders = (optimoRoute.stops || []).filter((o: any) => !OMITTED_STOP_TYPES.has(String(o?.type || '').toLowerCase()));
  const byOrderNumber = new Map<number, any>();
  const byAddress = new Map<string, any[]>();

  for (const optimoOrder of optimoOrders) {
    const identifier = getOptimoApiOrderIdentifier(optimoOrder);
    if (!identifier) continue;

    if (optimoOrder.stopNumber != null && !byOrderNumber.has(Number(optimoOrder.stopNumber))) {
      byOrderNumber.set(Number(optimoOrder.stopNumber), optimoOrder);
    }

    const addressKey = normalizeAddress(optimoOrder.address || optimoOrder.location?.address);
    if (addressKey) {
      const existing = byAddress.get(addressKey) || [];
      existing.push(optimoOrder);
      byAddress.set(addressKey, existing);
    }
  }

  const usedIdentifiers = new Set(
    orders
      .map(order => getStoredOptimoOrderNo(order))
      .filter((identifier): identifier is string => Boolean(identifier))
  );
  const updates: OrderIdentifierBackfill[] = [];

  for (const order of orders) {
    if (!order?.id || getStoredOptimoOrderNo(order)) continue;

    const localOrderNumber = order?.order_number ?? order?.orderNumber;
    let match = localOrderNumber != null ? byOrderNumber.get(Number(localOrderNumber)) : null;
    let identifier = getOptimoApiOrderIdentifier(match);

    if (!identifier || usedIdentifiers.has(identifier)) {
      const addressKey = normalizeAddress(order?.address);
      const candidates = addressKey ? byAddress.get(addressKey) || [] : [];
      match = candidates.find(candidate => {
        const candidateIdentifier = getOptimoApiOrderIdentifier(candidate);
        return candidateIdentifier && !usedIdentifiers.has(candidateIdentifier);
      }) || null;
      identifier = getOptimoApiOrderIdentifier(match);
    }

    if (!match || !identifier) continue;

    usedIdentifiers.add(identifier);
    updates.push({
      orderId: order.id,
      identifier,
      orderNumber: match.stopNumber != null ? Number(match.stopNumber) : undefined,
      scheduledAt: match.scheduledAt || undefined,
    });
  }

  return updates;
}

// ── Reconciliation: detect orders deleted/rescheduled in OptimoRoute ──

const TERMINAL_ORDER_STATUSES = new Set(['completed', 'failed', 'cancelled', 'skipped', 'deleted_in_optimo', 'rescheduled_in_optimo']);

export interface ReconciliationResult {
  deleted: number;
  rescheduled: number;
  unchanged: number;
}

export async function reconcileDeletedOrders(
  date: string,
  orders: any[],
  storage: { updateRouteOrder: (id: string, data: any) => Promise<any> },
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = { deleted: 0, rescheduled: 0, unchanged: 0 };

  // Filter to orders that were synced to OptimoRoute and aren't already terminal
  const syncedOrders = orders.filter(order => {
    const orderNo = getStoredOptimoOrderNo(order);
    return orderNo && !TERMINAL_ORDER_STATUSES.has(order.status);
  });

  if (syncedOrders.length === 0) return result;

  // Get all orders actually in OptimoRoute for this date
  let optimoOrderNos: Set<string>;
  try {
    const searchResult = await optimo.searchOrders(date, date);
    const found: any[] = searchResult?.orders || [];
    optimoOrderNos = new Set(found.map((o: any) => o.orderNo));
  } catch (err) {
    console.error('[Reconciliation] searchOrders failed, skipping reconciliation:', err);
    result.unchanged = syncedOrders.length;
    return result;
  }

  // Find orders missing from OptimoRoute
  for (const order of syncedOrders) {
    const orderNo = getStoredOptimoOrderNo(order)!;
    if (optimoOrderNos.has(orderNo)) {
      result.unchanged++;
      continue;
    }

    // Order is missing — check if it was rescheduled to a different date
    try {
      const schedInfo = await optimo.getSchedulingInfo(orderNo);
      if (schedInfo.success && schedInfo.orderScheduled && schedInfo.scheduleInformation) {
        // Order exists but on a different date — rescheduled
        const newDate = schedInfo.scheduleInformation.scheduledAtDt?.split('T')[0] || '';
        await storage.updateRouteOrder(order.id, {
          status: 'rescheduled_in_optimo',
          notes: `Rescheduled in OptimoRoute to ${newDate}`,
        });
        result.rescheduled++;
      } else {
        // Order doesn't exist at all — deleted
        await storage.updateRouteOrder(order.id, {
          status: 'deleted_in_optimo',
          notes: 'Deleted from OptimoRoute externally',
        });
        result.deleted++;
      }
    } catch (err) {
      // getSchedulingInfo failed — assume deleted
      console.error(`[Reconciliation] getSchedulingInfo failed for ${orderNo}:`, err);
      await storage.updateRouteOrder(order.id, {
        status: 'deleted_in_optimo',
        notes: 'Deleted from OptimoRoute (scheduling info unavailable)',
      });
      result.deleted++;
    }
  }

  return result;
}
