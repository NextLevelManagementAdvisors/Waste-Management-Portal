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
      polyline: optimoRoute.routePolyline || undefined,
    });

    // Set the dedup key and mark synced
    await storage.updateRoute(localRoute.id, { optimo_route_key: optimoRouteKey });
    await storage.markRouteSynced(localRoute.id);

    // Build stop records with property matching
    const stopData: Array<{
      location_id?: string | null;
      address?: string;
      location_name?: string;
      optimo_order_no?: string;
      stop_number?: number;
      order_type?: string;
    }> = [];

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
        optimo_order_no: stop.orderNo || undefined,
        stop_number: stop.stopNumber,
        order_type: 'recurring',
      });
    }

    const insertedStops = await storage.addRouteStops(localRoute.id, stopData);
    result.stopsImported += stopData.length;
    result.routesImported++;

    // Pull completion statuses for imported stops so they don't stay as 'pending'
    const orderNos = insertedStops
      .filter((s: any) => s.optimo_order_no)
      .map((s: any) => s.optimo_order_no);
    if (orderNos.length > 0) {
      try {
        const completionData = await optimo.getCompletionDetails(orderNos);
        const completionOrders = completionData?.orders || [];
        const STATUS_MAP: Record<string, string> = {
          success: 'completed', failed: 'failed', rejected: 'failed',
          cancelled: 'cancelled', on_route: 'in_progress', servicing: 'in_progress',
          scheduled: 'scheduled', unscheduled: 'pending',
        };
        let allTerminal = insertedStops.length > 0;
        for (const order of completionOrders) {
          if (!order.orderNo || !order.data?.status) continue;
          const portalStatus = STATUS_MAP[order.data.status] ?? order.data.status;
          const stop = insertedStops.find((s: any) => s.optimo_order_no === order.orderNo);
          if (stop) {
            const updateFields: any = { status: portalStatus };
            if (order.data.completionForm) updateFields.pod_data = JSON.stringify(order.data.completionForm);
            await storage.updateRouteStop(stop.id, updateFields);
            if (!['completed', 'failed', 'cancelled'].includes(portalStatus)) allTerminal = false;
          }
        }
        // If all stops are terminal, mark route completed
        if (allTerminal && insertedStops.length > 0) {
          await storage.updateRoute(localRoute.id, { status: 'completed', completed_at: new Date().toISOString() });
        }
      } catch {
        // Non-fatal: completion pull failed, stops stay as pending
      }
    }
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
