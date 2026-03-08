import { pool } from './db';

/**
 * Surge Pricing Engine
 *
 * Calculates a pay premium multiplier per zone based on:
 * - Coverage fill rate (% of locations with an active route today)
 * - Driver-to-stop ratio (supply vs demand)
 * - Same-day urgency (unassigned routes for today)
 * - Historical decline rate in zone
 *
 * Premium range: 1.0x (no surge) to 2.0x (max surge)
 * Applied via routes.pay_premium column using dynamic_premium pay mode.
 */

export interface ZoneSurge {
  zoneId: string;
  zoneName: string;
  multiplier: number;
  reasons: string[];
  premiumAmount: number;
}

export async function calculateZoneSurges(): Promise<ZoneSurge[]> {
  const surges: ZoneSurge[] = [];

  const zones = await pool.query(`SELECT id, name FROM service_zones WHERE active = true`);

  for (const zone of zones.rows) {
    const reasons: string[] = [];
    let score = 0; // 0 = no surge, 1.0 = max surge

    // 1. Coverage fill rate — what % of approved locations have a route today?
    const coverageResult = await pool.query(
      `SELECT
         COUNT(DISTINCT l.id)::int AS total_locations,
         COUNT(DISTINCT rs.location_id)::int AS covered_locations
       FROM locations l
       LEFT JOIN route_stops rs ON rs.location_id = l.id
         AND rs.route_id IN (SELECT id FROM routes WHERE scheduled_date = CURRENT_DATE AND status NOT IN ('cancelled'))
       WHERE l.zone_id = $1 AND l.service_status = 'approved'`,
      [zone.id]
    );
    const totalLocs = coverageResult.rows[0]?.total_locations || 1;
    const coveredLocs = coverageResult.rows[0]?.covered_locations || 0;
    const fillRate = coveredLocs / totalLocs;
    if (fillRate < 0.5) {
      score += 0.3 * (1 - fillRate); // Low coverage = higher surge
      reasons.push(`Low coverage: ${Math.round(fillRate * 100)}%`);
    }

    // 2. Driver-to-stop ratio — are there enough drivers for today's stops?
    const supplyDemand = await pool.query(
      `SELECT
         (SELECT COUNT(DISTINCT assigned_driver_id)::int FROM routes
          WHERE zone_id = $1 AND scheduled_date = CURRENT_DATE AND status IN ('assigned', 'in_progress')) AS active_drivers,
         (SELECT COUNT(*)::int FROM route_stops rs JOIN routes r ON r.id = rs.route_id
          WHERE r.zone_id = $1 AND r.scheduled_date = CURRENT_DATE AND r.status NOT IN ('cancelled', 'completed')
          AND rs.status NOT IN ('completed', 'failed', 'skipped', 'cancelled')) AS pending_stops`,
      [zone.id]
    );
    const activeDrivers = supplyDemand.rows[0]?.active_drivers || 0;
    const pendingStops = supplyDemand.rows[0]?.pending_stops || 0;
    if (activeDrivers > 0 && pendingStops / activeDrivers > 40) {
      const overload = Math.min((pendingStops / activeDrivers - 40) / 40, 1.0);
      score += 0.25 * overload;
      reasons.push(`High load: ${pendingStops} stops / ${activeDrivers} drivers`);
    } else if (activeDrivers === 0 && pendingStops > 0) {
      score += 0.25;
      reasons.push(`No active drivers, ${pendingStops} pending stops`);
    }

    // 3. Same-day urgency — unassigned routes scheduled today
    const urgencyResult = await pool.query(
      `SELECT COUNT(*)::int AS unassigned
       FROM routes
       WHERE zone_id = $1 AND scheduled_date = CURRENT_DATE
         AND status IN ('open', 'bidding') AND assigned_driver_id IS NULL`,
      [zone.id]
    );
    const unassigned = urgencyResult.rows[0]?.unassigned || 0;
    if (unassigned > 0) {
      score += Math.min(unassigned * 0.1, 0.3);
      reasons.push(`${unassigned} unassigned same-day route(s)`);
    }

    // 4. Recent decline rate in zone (last 7 days)
    const declineResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total_assigned,
         COUNT(*) FILTER (WHERE notes LIKE '%Declined by%')::int AS declined
       FROM routes
       WHERE zone_id = $1 AND scheduled_date >= CURRENT_DATE - INTERVAL '7 days'
         AND status IN ('open', 'assigned', 'in_progress', 'completed')`,
      [zone.id]
    );
    const totalAssigned = declineResult.rows[0]?.total_assigned || 1;
    const declined = declineResult.rows[0]?.declined || 0;
    const declineRate = declined / totalAssigned;
    if (declineRate > 0.1) {
      score += 0.15 * Math.min(declineRate / 0.5, 1.0);
      reasons.push(`${Math.round(declineRate * 100)}% decline rate`);
    }

    // Convert score to multiplier: 1.0x to 2.0x
    const multiplier = Math.round((1.0 + Math.min(score, 1.0)) * 100) / 100;

    if (multiplier > 1.0) {
      surges.push({
        zoneId: zone.id,
        zoneName: zone.name,
        multiplier,
        reasons,
        premiumAmount: 0, // Calculated per-route when applied
      });
    }
  }

  return surges;
}

/**
 * Apply surge pricing to open/unassigned routes in surging zones.
 * Sets pay_premium and pay_mode = 'dynamic_premium' on affected routes.
 */
export async function applySurgePricing(): Promise<{ updated: number }> {
  const surges = await calculateZoneSurges();
  let updated = 0;

  for (const surge of surges) {
    // Apply premium to open/bidding routes in this zone
    const result = await pool.query(
      `UPDATE routes
       SET pay_mode = 'dynamic_premium',
           pay_premium = COALESCE(computed_value, base_pay, 0) * ($1 - 1.0),
           updated_at = NOW()
       WHERE zone_id = $2
         AND scheduled_date >= CURRENT_DATE
         AND status IN ('open', 'bidding')
         AND assigned_driver_id IS NULL
         AND (pay_premium IS NULL OR pay_premium = 0)`,
      [surge.multiplier, surge.zoneId]
    );
    updated += result.rowCount || 0;
  }

  // Reset surge on routes in non-surging zones
  const surgingZoneIds = surges.map(s => s.zoneId);
  if (surgingZoneIds.length > 0) {
    await pool.query(
      `UPDATE routes
       SET pay_mode = 'dynamic', pay_premium = 0, updated_at = NOW()
       WHERE zone_id IS NOT NULL
         AND zone_id != ALL($1::uuid[])
         AND pay_mode = 'dynamic_premium'
         AND status IN ('open', 'bidding')
         AND assigned_driver_id IS NULL`,
      [surgingZoneIds]
    );
  }

  return { updated };
}

/**
 * Get current surge status for all zones (for driver-facing display).
 */
export async function getCurrentSurges(): Promise<ZoneSurge[]> {
  return calculateZoneSurges();
}
