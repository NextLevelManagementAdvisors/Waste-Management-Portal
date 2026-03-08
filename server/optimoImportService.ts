import { storage } from './storage.ts';
import * as optimo from './optimoRouteClient.ts';
import {
  fetchCompletionPayloadsByOrderId,
  getOptimoApiOrderIdentifier,
  normalizeOptimoStatus,
} from './optimoOrderHelpers.ts';

const OMITTED_STOP_TYPES = new Set(['break', 'depot', 'start', 'end']);
const TERMINAL_STOP_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export interface ImportResult {
  date: string;
  routesImported: number;
  routesUpdated: number;
  routesSkipped: number;
  stopsImported: number;
  stopsMatched: number;
  stopsUnmatched: number;
  errors: string[];
}

interface ImportedStopData {
  location_id?: string | null;
  address?: string;
  location_name?: string;
  optimo_order_no?: string;
  stop_number?: number;
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

async function findExistingImportedRoute(date: string, optimoRouteKey: string, stopIdentifiers: string[]): Promise<any | null> {
  const byKey = await storage.getRouteByOptimoKey(optimoRouteKey);
  if (byKey) return byKey;

  if (stopIdentifiers.length === 0) return null;

  // Driver assignment can change between imports, so fall back to stop overlap before creating a duplicate route.
  const overlap = await storage.query(
    `SELECT r.id, COUNT(*)::int AS matched_stop_count
     FROM routes r
     JOIN route_stops rs ON rs.route_id = r.id
     WHERE r.scheduled_date = $1
       AND r.source = 'optimo_import'
       AND rs.optimo_order_no = ANY($2::text[])
     GROUP BY r.id
     ORDER BY COUNT(*) DESC
     LIMIT 1`,
    [date, stopIdentifiers]
  );

  const routeId = overlap.rows[0]?.id;
  return routeId ? storage.getRouteById(routeId) : null;
}

async function buildImportedStops(realStops: any[], result: ImportResult): Promise<ImportedStopData[]> {
  const stopData: ImportedStopData[] = [];

  for (const stop of realStops) {
    const stopAddress = stop.address || stop.location?.address || '';
    const stopLocationName = stop.locationName || stop.location?.locationName || '';

    let locationId: string | null = null;
    if (stopAddress) {
      const matched = await storage.findLocationByAddress(stopAddress);
      if (matched) {
        locationId = matched.id;
        result.stopsMatched++;
      } else {
        result.stopsUnmatched++;
      }
    } else {
      result.stopsUnmatched++;
    }

    stopData.push({
      location_id: locationId,
      address: stopAddress || undefined,
      location_name: stopLocationName || undefined,
      optimo_order_no: getOptimoApiOrderIdentifier(stop),
      stop_number: stop.stopNumber != null ? Number(stop.stopNumber) : undefined,
      scheduled_at: stop.scheduledAt || undefined,
      order_type: 'recurring',
    });
  }

  return stopData;
}

function buildRouteStatus(assignedDriverId: string | undefined, stops: any[]): { status: string; completedAt: string | null } {
  if (stops.length > 0 && stops.every((stop: any) => TERMINAL_STOP_STATUSES.has(String(stop.status || '').toLowerCase()))) {
    return { status: 'completed', completedAt: new Date().toISOString() };
  }

  if (stops.some((stop: any) => String(stop.status || '').toLowerCase() === 'in_progress')) {
    return { status: 'in_progress', completedAt: null };
  }

  return {
    status: assignedDriverId ? 'assigned' : 'open',
    completedAt: null,
  };
}

function selectExistingStop(existingStops: any[], incoming: ImportedStopData, usedStopIds: Set<string>) {
  return existingStops.find((stop: any) => {
    if (!stop?.id || usedStopIds.has(stop.id)) return false;

    if (incoming.optimo_order_no && stop.optimo_order_no === incoming.optimo_order_no) return true;
    if (incoming.location_id && stop.location_id === incoming.location_id) return true;

    const incomingAddress = normalizeAddress(incoming.address);
    if (incomingAddress && normalizeAddress(stop.address) === incomingAddress) return true;

    return false;
  }) || null;
}

async function syncRouteStops(routeId: string, stopData: ImportedStopData[]): Promise<any[]> {
  const existingStops = await storage.getRouteStops(routeId);
  const usedStopIds = new Set<string>();
  const stopsToInsert: ImportedStopData[] = [];

  for (const incoming of stopData) {
    const existingStop = selectExistingStop(existingStops, incoming, usedStopIds);
    if (!existingStop) {
      stopsToInsert.push(incoming);
      continue;
    }

    usedStopIds.add(existingStop.id);

    const updateFields: any = {};
    if (incoming.optimo_order_no && incoming.optimo_order_no !== existingStop.optimo_order_no) {
      updateFields.optimo_order_no = incoming.optimo_order_no;
    }
    if (incoming.stop_number != null && Number(existingStop.stop_number) !== Number(incoming.stop_number)) {
      updateFields.stop_number = incoming.stop_number;
    }
    if (incoming.scheduled_at && incoming.scheduled_at !== existingStop.scheduled_at) {
      updateFields.scheduled_at = incoming.scheduled_at;
    }
    if (incoming.location_name && incoming.location_name !== existingStop.location_name) {
      updateFields.location_name = incoming.location_name;
    }

    if (Object.keys(updateFields).length > 0) {
      await storage.updateRouteStop(existingStop.id, updateFields);
    }
  }

  if (stopsToInsert.length > 0) {
    await storage.addRouteStops(routeId, stopsToInsert);
  }

  for (const stop of existingStops) {
    // Keep portal-only on-demand stops even when Optimo no longer returns them for the imported route.
    if (usedStopIds.has(stop.id) || stop.on_demand_request_id) continue;
    await storage.removeRouteStop(stop.id);
  }

  return storage.getRouteStops(routeId);
}

async function syncCompletionStatuses(routeId: string): Promise<any[]> {
  const stops = await storage.getRouteStops(routeId);
  const identifiers = stops
    .map((stop: any) => stop.optimo_order_no)
    .filter((identifier: any): identifier is string => typeof identifier === 'string' && identifier.length > 0);

  if (identifiers.length === 0) return stops;

  try {
    const completionMap = await fetchCompletionPayloadsByOrderId(identifiers);

    for (const stop of stops) {
      if (!stop.optimo_order_no) continue;

      const data = completionMap.get(stop.optimo_order_no);
      const portalStatus = normalizeOptimoStatus(data?.status) || 'pending';
      const updateFields: any = {};

      if (portalStatus !== stop.status) {
        updateFields.status = portalStatus;
      }

      if (data?.form) {
        updateFields.pod_data = JSON.stringify(data.form);
      }

      if (Object.keys(updateFields).length > 0) {
        await storage.updateRouteStop(stop.id, updateFields);
      }
    }

    return storage.getRouteStops(routeId);
  } catch {
    return stops;
  }
}

export async function importRoutesFromOptimo(date: string): Promise<ImportResult> {
  const result: ImportResult = {
    date,
    routesImported: 0,
    routesUpdated: 0,
    routesSkipped: 0,
    stopsImported: 0,
    stopsMatched: 0,
    stopsUnmatched: 0,
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

    // Filter out break/depot stops
    // Optimo can include depot start/end placeholders that are not real customer stops.
    const realStops = (optimoRoute.stops || []).filter(
      (stop: any) => !OMITTED_STOP_TYPES.has(String(stop.type || '').toLowerCase())
    );
    const stopIdentifiers = realStops
      .map((stop: any) => getOptimoApiOrderIdentifier(stop))
      .filter((identifier: any): identifier is string => typeof identifier === 'string' && identifier.length > 0);

    const title = `${optimoRoute.driverName || driverSerial} - ${date}`;
    const assignedDriverId = await resolveAssignedDriverId(optimoRoute);
    const nextRouteFields = {
      title,
      scheduled_date: date,
      start_time: formatOptimoTime(optimoRoute.startTime),
      end_time: formatOptimoTime(optimoRoute.endTime),
      estimated_stops: realStops.length,
      estimated_hours: optimoRoute.duration ? Math.round((optimoRoute.duration / 60) * 10) / 10 : undefined,
      assigned_driver_id: assignedDriverId ?? null,
      route_type: 'daily_route',
      source: 'optimo_import',
      status: assignedDriverId ? 'assigned' : 'open',
      polyline: optimoRoute.routePolyline || null,
    };

    const existing = await findExistingImportedRoute(date, optimoRouteKey, stopIdentifiers);
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

    const stopData = await buildImportedStops(realStops, result);
    await syncRouteStops(routeId, stopData);
    result.stopsImported += stopData.length;

    const syncedStops = await syncCompletionStatuses(routeId);
    const routeStatus = buildRouteStatus(assignedDriverId, syncedStops);
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
  totalStopsImported: number;
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
    totalStopsImported: 0,
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
      result.totalStopsImported += dayResult.stopsImported;
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
