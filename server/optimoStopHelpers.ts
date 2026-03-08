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

export function getStoredOptimoIdentifier(stop: any): string | undefined {
  const rawIdentifier = [
    stop?.optimo_order_no,
    stop?.optimoOrderNo,
  ].find(value => typeof value === 'string' && value.trim().length > 0);

  return typeof rawIdentifier === 'string' ? rawIdentifier.trim() : undefined;
}

export function getOptimoApiStopIdentifier(stop: any): string | undefined {
  const rawIdentifier = [
    stop?.orderNo,
    stop?.id,
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

export async function fetchCompletionPayloadsByIdentifier(identifiers: string[]): Promise<Map<string, any>> {
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
        ? getOptimoApiStopIdentifier({ id: order?.id, orderNo: order?.orderNo })
        : getOptimoApiStopIdentifier({ orderNo: order?.orderNo, id: order?.id });
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

export interface RouteStopIdentifierBackfill {
  stopId: string;
  identifier: string;
  stopNumber?: number;
  scheduledAt?: string;
}

export function buildRouteStopIdentifierBackfill(route: any, stops: any[], optimoRoutes: any[]): RouteStopIdentifierBackfill[] {
  const optimoRoute = findMatchingOptimoRoute(route, optimoRoutes);
  if (!optimoRoute) return [];

  const optimoStops = (optimoRoute.stops || []).filter((stop: any) => !OMITTED_STOP_TYPES.has(String(stop?.type || '').toLowerCase()));
  const byStopNumber = new Map<number, any>();
  const byAddress = new Map<string, any[]>();

  for (const optimoStop of optimoStops) {
    const identifier = getOptimoApiStopIdentifier(optimoStop);
    if (!identifier) continue;

    if (optimoStop.stopNumber != null && !byStopNumber.has(Number(optimoStop.stopNumber))) {
      byStopNumber.set(Number(optimoStop.stopNumber), optimoStop);
    }

    const addressKey = normalizeAddress(optimoStop.address || optimoStop.location?.address);
    if (addressKey) {
      const existing = byAddress.get(addressKey) || [];
      existing.push(optimoStop);
      byAddress.set(addressKey, existing);
    }
  }

  const usedIdentifiers = new Set(
    stops
      .map(stop => getStoredOptimoIdentifier(stop))
      .filter((identifier): identifier is string => Boolean(identifier))
  );
  const updates: RouteStopIdentifierBackfill[] = [];

  for (const stop of stops) {
    if (!stop?.id || getStoredOptimoIdentifier(stop)) continue;

    const localStopNumber = stop?.stop_number ?? stop?.stopNumber;
    let match = localStopNumber != null ? byStopNumber.get(Number(localStopNumber)) : null;
    let identifier = getOptimoApiStopIdentifier(match);

    if (!identifier || usedIdentifiers.has(identifier)) {
      const addressKey = normalizeAddress(stop?.address);
      const candidates = addressKey ? byAddress.get(addressKey) || [] : [];
      match = candidates.find(candidate => {
        const candidateIdentifier = getOptimoApiStopIdentifier(candidate);
        return candidateIdentifier && !usedIdentifiers.has(candidateIdentifier);
      }) || null;
      identifier = getOptimoApiStopIdentifier(match);
    }

    if (!match || !identifier) continue;

    usedIdentifiers.add(identifier);
    updates.push({
      stopId: stop.id,
      identifier,
      stopNumber: match.stopNumber != null ? Number(match.stopNumber) : undefined,
      scheduledAt: match.scheduledAt || undefined,
    });
  }

  return updates;
}
