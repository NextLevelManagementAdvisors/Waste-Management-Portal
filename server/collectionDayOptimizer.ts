import { storage } from './storage.ts';
import { geocodeAddress, haversineDistanceMiles } from './routeSuggestionService.ts';
import { zoneService, type DriverCustomZone } from '../services/zoneService.js';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Average rural speed in mph — used to estimate time impact from distance
const AVG_SPEED_MPH = 25;

export interface OptimizationResult {
  collection_day: string;
  zone_name?: string;
  driver_name?: string;
  insertion_cost_miles: number;
  best_route_id?: string;
  confidence: number;
  source?: 'route_optimized' | 'zone_default';
}

interface StopWithCoords {
  stop_number: number | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Calculate the minimum insertion cost (in miles) to add a new point into an
 * ordered sequence of stops.  For each adjacent pair (Si, Si+1) the cost of
 * inserting X between them is:
 *   dist(Si, X) + dist(X, Si+1) - dist(Si, Si+1)
 *
 * Returns the minimum extra distance across all possible insertion positions.
 */
function minInsertionCost(
  stops: StopWithCoords[],
  newLat: number,
  newLng: number,
): number {
  // Filter to stops that actually have coordinates
  const ordered = stops
    .filter(s => s.latitude != null && s.longitude != null)
    .sort((a, b) => (a.stop_number ?? 999) - (b.stop_number ?? 999));

  if (ordered.length === 0) return Infinity;

  // If only one stop, cost = distance to that stop
  if (ordered.length === 1) {
    return haversineDistanceMiles(
      newLat, newLng,
      ordered[0].latitude!, ordered[0].longitude!,
    );
  }

  let minCost = Infinity;

  // Try inserting before the first stop
  const first = ordered[0];
  const costBefore = haversineDistanceMiles(newLat, newLng, first.latitude!, first.longitude!);
  if (costBefore < minCost) minCost = costBefore;

  // Try inserting between each pair
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];
    const dAX = haversineDistanceMiles(a.latitude!, a.longitude!, newLat, newLng);
    const dXB = haversineDistanceMiles(newLat, newLng, b.latitude!, b.longitude!);
    const dAB = haversineDistanceMiles(a.latitude!, a.longitude!, b.latitude!, b.longitude!);
    const cost = dAX + dXB - dAB;
    if (cost < minCost) minCost = cost;
  }

  // Try inserting after the last stop
  const last = ordered[ordered.length - 1];
  const costAfter = haversineDistanceMiles(last.latitude!, last.longitude!, newLat, newLng);
  if (costAfter < minCost) minCost = costAfter;

  return minCost;
}

/**
 * Fallback: when route optimization has no data, check if the address is inside
 * an active zone with a configured pickup_day.
 */
async function zoneFallback(containingZones: DriverCustomZone[]): Promise<OptimizationResult | null> {
  const zoneWithDay = containingZones.find(z => z.pickup_day);
  if (zoneWithDay) {
    return {
      collection_day: zoneWithDay.pickup_day!,
      zone_name: zoneWithDay.name,
      // driver_name is not available on the zone object from zoneService, so we omit it
      insertion_cost_miles: 0,
      confidence: 0.5,
      source: 'zone_default',
    };
  }
  return null;
}

/**
 * Find the optimal collection day for a location by simulating insertion into
 * recent routes and picking the day with the lowest average additional mileage
 * (or estimated time). Falls back to zone pickup_day when no route data exists.
 */
export async function findOptimalCollectionDay(locationId: string): Promise<OptimizationResult | null> {
  const location = await storage.getLocationById(locationId);
  if (!location) return null;

  // 1. Geocode if needed
  let lat = location.latitude ? Number(location.latitude) : null;
  let lng = location.longitude ? Number(location.longitude) : null;

  if (lat == null || lng == null) {
    const geo = await geocodeAddress(location.address);
    if (!geo) return null;
    lat = geo.lat;
    lng = geo.lng;
    await storage.updateLocation(locationId, { latitude: lat, longitude: lng });
  }

  // 2. Find all zones containing the location
  const containingZones = await zoneService.findZonesForLocation(lat, lng);

  // 3. Get routes from the analysis window, filtered by the location's zones
  const windowDays = parseInt(process.env.PICKUP_OPTIMIZATION_WINDOW_DAYS || '7') || 7;
  const metric = (process.env.PICKUP_OPTIMIZATION_METRIC || 'distance') as 'distance' | 'time' | 'both';
  const today = new Date();
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - windowDays);

  const routes = await storage.getAllRoutes({
    date_from: windowStart.toISOString().split('T')[0],
    date_to: today.toISOString().split('T')[0],
    zoneIds: containingZones.map(z => z.id),
  });

  const activeStatuses = new Set(['open', 'assigned', 'in_progress', 'completed']);
  const activeRoutes = routes.filter(r => activeStatuses.has(r.status));

  if (activeRoutes.length === 0) {
    // Fallback: check if address is inside a zone with a configured pickup_day
    const fallback = await zoneFallback(containingZones);
    if (fallback) return fallback;
    return null;
  }

  // 4. For each route, calculate minimum insertion cost
  interface RouteResult {
    routeId: string;
    dayOfWeek: string;
    insertionCostMiles: number;
    insertionCostMinutes: number;
  }

  const routeResults: RouteResult[] = [];

  for (const route of activeRoutes) {
    const stops = await storage.getRouteStops(route.id);
    const cost = minInsertionCost(stops as StopWithCoords[], lat, lng);

    if (cost === Infinity) continue;

    const d = new Date(route.scheduled_date + 'T12:00:00');
    const dayName = DAY_NAMES[d.getDay()];

    routeResults.push({
      routeId: route.id,
      dayOfWeek: dayName,
      insertionCostMiles: cost,
      insertionCostMinutes: (cost / AVG_SPEED_MPH) * 60,
    });
  }

  if (routeResults.length === 0) {
    const fallback = await zoneFallback(containingZones);
    if (fallback) return fallback;
    return null;
  }

  // 5. Group by day of week, average the insertion cost
  const dayGroups: Record<string, { totalCost: number; count: number; bestRouteId: string; bestCost: number }> = {};

  for (const r of routeResults) {
    const costValue = metric === 'time' ? r.insertionCostMinutes
      : metric === 'both' ? (r.insertionCostMiles + r.insertionCostMinutes / 60)
      : r.insertionCostMiles;

    if (!dayGroups[r.dayOfWeek]) {
      dayGroups[r.dayOfWeek] = { totalCost: 0, count: 0, bestRouteId: r.routeId, bestCost: costValue };
    }
    const group = dayGroups[r.dayOfWeek];
    group.totalCost += costValue;
    group.count++;
    if (costValue < group.bestCost) {
      group.bestCost = costValue;
      group.bestRouteId = r.routeId;
    }
  }

  // 6. Pick the day with the lowest average cost
  let bestDay = '';
  let bestAvg = Infinity;
  let bestRouteId: string | undefined;

  for (const [day, group] of Object.entries(dayGroups)) {
    const avg = group.totalCost / group.count;
    if (avg < bestAvg) {
      bestAvg = avg;
      bestDay = day;
      bestRouteId = group.bestRouteId;
    }
  }

  if (!bestDay) return null;

  // Confidence: higher when we have more routes to compare
  const confidence = Math.min(routeResults.length / (windowDays * 0.7), 1);
  const bestZone = containingZones.length > 0 ? containingZones[0] : null;

  return {
    collection_day: bestDay,
    zone_name: bestZone?.name,
    // driver_name is not available here
    insertion_cost_miles: bestAvg,
    best_route_id: bestRouteId,
    confidence,
    source: 'route_optimized',
  };
}
