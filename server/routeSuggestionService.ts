import { storage } from './storage.ts';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon as turfPolygon } from '@turf/helpers';

export interface RouteSuggestion {
  zone_name: string;
  driver_name?: string;
  collection_day: string;
  confidence: number;
  distance_miles: number;
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK' || !data.results?.length) return null;
    const { lat, lng } = data.results[0].geometry.location;
    return { lat, lng };
  } catch {
    return null;
  }
}

export function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function findNearestZone(lat: number, lng: number): Promise<{ zone_id: string; zone_name: string; driver_name?: string; distance_miles: number } | null> {
  const zones = await storage.getAllDriverCustomZones();
  let best: { zone_id: string; zone_name: string; driver_name?: string; distance_miles: number } | null = null;

  for (const zone of zones) {
    if (zone.status !== 'active') continue;

    // Circle zones: check distance to center within radius
    if (zone.zone_type === 'circle' && zone.center_lat != null && zone.center_lng != null) {
      const dist = haversineDistanceMiles(lat, lng, Number(zone.center_lat), Number(zone.center_lng));
      const radius = zone.radius_miles ? Number(zone.radius_miles) : Infinity;
      if (dist > radius) continue;
      if (!best || dist < best.distance_miles) {
        best = { zone_id: zone.id, zone_name: zone.name, driver_name: zone.driver_name, distance_miles: dist };
      }
    }

    // Polygon/zip zones: point-in-polygon check (distance 0 if inside)
    if ((zone.zone_type === 'polygon' || zone.zone_type === 'zip') && zone.polygon_coords) {
      const coords = typeof zone.polygon_coords === 'string'
        ? JSON.parse(zone.polygon_coords)
        : zone.polygon_coords;
      if (!coords || coords.length < 3) continue;
      const ring = coords.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
      ring.push(ring[0]);
      const poly = turfPolygon([ring]);
      const pt = point([lng, lat]);
      if (booleanPointInPolygon(pt, poly)) {
        if (!best || 0 < best.distance_miles) {
          best = { zone_id: zone.id, zone_name: zone.name, driver_name: zone.driver_name, distance_miles: 0 };
        }
      }
    }
  }

  return best;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export async function suggestRoute(locationId: string): Promise<RouteSuggestion | null> {
  const location = await storage.getLocationById(locationId);
  if (!location) return null;

  // Geocode if needed
  let lat = location.latitude ? Number(location.latitude) : null;
  let lng = location.longitude ? Number(location.longitude) : null;

  if (lat == null || lng == null) {
    const geo = await geocodeAddress(location.address);
    if (!geo) return null;
    lat = geo.lat;
    lng = geo.lng;
    // Persist coordinates
    await storage.updateLocation(locationId, { latitude: lat, longitude: lng });
  }

  // Find nearest driver zone
  const zone = await findNearestZone(lat, lng);
  if (!zone) return null;

  // Look at 7 days of route history to find the most common day
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const dateTo = today.toISOString().split('T')[0];
  const dateFrom = sevenDaysAgo.toISOString().split('T')[0];

  const routes = await storage.getAllRoutes({
    date_from: dateFrom,
    date_to: dateTo,
  });

  // Filter to active statuses only
  const activeStatuses = new Set(['open', 'assigned', 'in_progress', 'completed']);
  const activeRoutes = routes.filter(r => activeStatuses.has(r.status));

  if (activeRoutes.length === 0) {
    // No history — still return zone info with low confidence
    return {
      zone_name: zone.zone_name,
      driver_name: zone.driver_name,
      collection_day: 'unknown',
      confidence: 0.2,
      distance_miles: zone.distance_miles,
    };
  }

  // Count routes by day of week
  const dayCounts: Record<string, number> = {};
  for (const route of activeRoutes) {
    const d = new Date(route.scheduled_date + 'T12:00:00');
    const dayName = DAY_NAMES[d.getDay()];
    dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
  }

  // Pick most common day
  let bestDay = '';
  let bestCount = 0;
  for (const [day, count] of Object.entries(dayCounts)) {
    if (count > bestCount) {
      bestDay = day;
      bestCount = count;
    }
  }

  const confidence = Math.min(bestCount / activeRoutes.length, 1);

  return {
    zone_name: zone.zone_name,
    driver_name: zone.driver_name,
    collection_day: bestDay,
    confidence,
    distance_miles: zone.distance_miles,
  };
}
