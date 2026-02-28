import { storage } from './storage.ts';
import * as optimo from './optimoRouteClient.ts';

export interface ImportResult {
  date: string;
  routesImported: number;
  routesSkipped: number;
  stopsImported: number;
  stopsMatched: number;
  stopsUnmatched: number;
  errors: string[];
}

export async function importRoutesFromOptimo(date: string): Promise<ImportResult> {
  const result: ImportResult = {
    date,
    routesImported: 0,
    routesSkipped: 0,
    stopsImported: 0,
    stopsMatched: 0,
    stopsUnmatched: 0,
    errors: [],
  };

  // Fetch routes from OptimoRoute API
  const apiResult = await optimo.getRoutes(date);
  const routes = apiResult.routes || [];

  for (const optimoRoute of routes) {
    const driverSerial = optimoRoute.driverSerial || optimoRoute.driverName || '';
    if (!driverSerial) {
      result.errors.push('Route with no driver serial/name skipped');
      continue;
    }

    // Dedup key: one route per driver per day
    const optimoRouteKey = `${date}_${driverSerial}`;

    // Skip if already imported
    const existing = await storage.getRouteByOptimoKey(optimoRouteKey);
    if (existing) {
      result.routesSkipped++;
      continue;
    }

    // Match driver to local driver_profiles
    let assignedDriverId: string | undefined;
    if (driverSerial) {
      const localDriver = await storage.getDriverByOptimoSerial(driverSerial);
      if (localDriver) assignedDriverId = localDriver.id;
    }

    // Filter out break/depot stops
    const realStops = (optimoRoute.stops || []).filter(
      (s: any) => s.type !== 'break' && s.type !== 'depot'
    );

    // Create local route
    const title = `${optimoRoute.driverName || driverSerial} - ${date}`;
    const localRoute = await storage.createRoute({
      title,
      scheduled_date: date,
      estimated_stops: realStops.length,
      estimated_hours: optimoRoute.duration ? Math.round((optimoRoute.duration / 60) * 10) / 10 : undefined,
      assigned_driver_id: assignedDriverId,
      route_type: 'daily_route',
      source: 'optimo_import',
      status: assignedDriverId ? 'assigned' : 'open',
    });

    // Set the dedup key and mark synced
    await storage.updateRoute(localRoute.id, { optimo_route_key: optimoRouteKey });
    await storage.markRouteSynced(localRoute.id);

    // Build stop records with property matching
    const stopData: Array<{
      property_id?: string | null;
      address?: string;
      location_name?: string;
      optimo_order_no?: string;
      stop_number?: number;
      order_type?: string;
    }> = [];

    for (const stop of realStops) {
      const stopAddress = stop.address || stop.location?.address || '';
      const stopLocationName = stop.locationName || stop.location?.locationName || '';

      let propertyId: string | null = null;
      if (stopAddress) {
        const matched = await storage.findPropertyByAddress(stopAddress);
        if (matched) {
          propertyId = matched.id;
          result.stopsMatched++;
        } else {
          result.stopsUnmatched++;
        }
      } else {
        result.stopsUnmatched++;
      }

      stopData.push({
        property_id: propertyId,
        address: stopAddress || undefined,
        location_name: stopLocationName || undefined,
        optimo_order_no: stop.orderNo || undefined,
        stop_number: stop.stopNumber,
        order_type: 'recurring',
      });
    }

    await storage.addRouteStops(localRoute.id, stopData);
    result.stopsImported += stopData.length;
    result.routesImported++;
  }

  return result;
}

export interface BatchImportResult {
  from: string;
  to: string;
  totalRoutesImported: number;
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
