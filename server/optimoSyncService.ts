import { pool } from './db';
import * as optimo from './optimoRouteClient';

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

// ── Private helpers ──

function getNextBusinessDay(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

async function getPropertiesWithOrderStatus() {
  const propResult = await pool.query(
    `SELECT p.id, p.address, p.user_id, u.first_name, u.last_name, u.email,
            (SELECT COUNT(*) FROM stripe.subscriptions s WHERE s.customer = u.stripe_customer_id AND s.status = 'active') as active_subs
     FROM properties p
     JOIN users u ON u.id = p.user_id
     WHERE p.address IS NOT NULL AND p.address != ''
       AND u.stripe_customer_id IS NOT NULL
     ORDER BY u.last_name, u.first_name`
  );

  const properties = propResult.rows.filter((p: any) => parseInt(p.active_subs) > 0);

  const today = new Date().toISOString().split('T')[0];
  const twoWeeksOut = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

  const results: any[] = [];
  for (const prop of properties) {
    try {
      const orders = await optimo.findOrdersForAddress(prop.address, today, twoWeeksOut);
      results.push({
        property: { id: prop.id, address: prop.address, customer: `${prop.first_name} ${prop.last_name}` },
        upcomingOrders: orders.length,
        hasOrders: orders.length > 0,
      });
    } catch {
      results.push({
        property: { id: prop.id, address: prop.address, customer: `${prop.first_name} ${prop.last_name}` },
        upcomingOrders: 0,
        hasOrders: false,
        error: true,
      });
    }
  }

  return { results, total: results.length };
}

// ── Exported functions ──

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

  for (const [serial, optimoDriver] of driverMap) {
    const localMatch = localDrivers.find((d: any) => d.optimoroute_driver_id === serial);
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

/** Preview which subscribed properties are missing upcoming OptimoRoute orders. */
export async function previewCustomerOrderSync() {
  const { results, total } = await getPropertiesWithOrderStatus();
  const missing = results.filter((r: any) => !r.hasOrders);
  return { total, withOrders: total - missing.length, missing };
}

/** Create OptimoRoute orders for subscribed properties that have none in the next 14 days. */
export async function executeCustomerOrderSync() {
  const { results, total } = await getPropertiesWithOrderStatus();
  const missing = results.filter((r: any) => !r.hasOrders);

  let created = 0;
  for (const item of missing) {
    if (item.error) continue;
    try {
      const nextBusinessDay = getNextBusinessDay();
      await optimo.createOrder({
        orderNo: `SYNC-${item.property.id.substring(0, 8).toUpperCase()}-${Date.now()}`,
        type: 'P',
        date: nextBusinessDay,
        address: item.property.address,
        locationName: item.property.customer,
        duration: 10,
        notes: 'Auto-synced from admin portal',
      });
      created++;
    } catch {}
  }

  return { total, withOrders: total - missing.length, missing: missing.length, created };
}
