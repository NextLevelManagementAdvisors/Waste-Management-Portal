import { pool } from './db';
import { storage } from './storage';
import { getActiveRules, calculateStopCompensation, recalculateRouteValue } from './compensationEngine';

export interface AutoAssignResult {
  locationId: string;
  assigned: boolean;
  reason?: 'disabled' | 'no_collection_day' | 'no_zone' | 'no_contract' | 'qualification_mismatch' | 'capacity_exceeded';
  details?: string;
  routeId?: string;
  contractId?: string;
  compensation?: number;
  capacityWarning?: { currentStops: number; maxStops: number; percentage: number };
}

/**
 * Check whether a location is due for collection on a given date,
 * accounting for collection_frequency (weekly, bi-weekly, monthly).
 *
 * Reuses the anchor-alignment logic from optimoSyncService.generateCollectionDates().
 */
export function isLocationDueOnDate(
  frequency: string,
  anchorDate: string | null,
  targetDate: string,
  collectionDay: string,
): boolean {
  const DAY_MAP: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };

  const targetDow = DAY_MAP[collectionDay.toLowerCase()];
  if (targetDow === undefined) return false;

  const target = new Date(targetDate + 'T00:00:00');
  if (target.getDay() !== targetDow) return false;

  // Weekly is always due on the correct day
  if (!frequency || frequency === 'weekly') return true;

  const interval = frequency === 'bi-weekly' ? 14 : frequency === 'monthly' ? 28 : 7;
  if (interval === 7) return true;

  // Align to anchor date
  const anchor = anchorDate ? new Date(anchorDate + 'T00:00:00') : null;
  if (!anchor || isNaN(anchor.getTime())) return true; // No anchor → treat as weekly

  const diffMs = target.getTime() - anchor.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  const remainder = ((diffDays % interval) + interval) % interval;
  return remainder === 0;
}

/**
 * Find the next scheduled date for a location's collection day.
 */
function getNextCollectionDate(collectionDay: string, frequency: string, anchorDate: string | null): string | null {
  const DAY_MAP: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };

  const targetDow = DAY_MAP[collectionDay.toLowerCase()];
  if (targetDow === undefined) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find next occurrence of the target day (starting from tomorrow)
  const next = new Date(today);
  next.setDate(next.getDate() + 1);
  while (next.getDay() !== targetDow) next.setDate(next.getDate() + 1);

  const interval = frequency === 'bi-weekly' ? 14 : frequency === 'monthly' ? 28 : 7;

  // For bi-weekly/monthly: align to anchor date
  if (interval > 7 && anchorDate) {
    const anchor = new Date(anchorDate + 'T00:00:00');
    if (!isNaN(anchor.getTime())) {
      const diffMs = next.getTime() - anchor.getTime();
      const diffDays = Math.round(diffMs / 86400000);
      const remainder = ((diffDays % interval) + interval) % interval;
      if (remainder !== 0) {
        next.setDate(next.getDate() + (interval - remainder));
      }
    }
  }

  return next.toISOString().split('T')[0];
}

/**
 * Try to auto-assign a newly approved location to a contract driver's route.
 *
 * Flow:
 * 1. Check AUTO_ASSIGN_NEW_LOCATIONS setting
 * 2. Load location (zone, collection day, requirements)
 * 3. Find active contract for (zone, day)
 * 4. Check driver qualifications (equipment, certs, rating)
 * 5. Check driver capacity
 * 6. Find or create route for contract+date
 * 7. Add stop with calculated compensation
 * 8. Recalculate route value
 */
export async function tryAutoAssignLocation(locationId: string): Promise<AutoAssignResult> {
  const result = await _tryAutoAssignLocation(locationId);
  // Log all results (except 'disabled' — no value in logging those)
  if (result.reason !== 'disabled') {
    await logAssignmentResult(result);
  }
  return result;
}

async function _tryAutoAssignLocation(locationId: string): Promise<AutoAssignResult> {
  // 1. Check setting
  if (process.env.AUTO_ASSIGN_NEW_LOCATIONS !== 'true') {
    return { locationId, assigned: false, reason: 'disabled' };
  }

  // 2. Load location
  const locResult = await pool.query(
    `SELECT l.id, l.address, l.collection_day, l.zone_id,
            l.service_type, l.collection_frequency,
            COALESCE(l.difficulty_score, 1.0) AS difficulty_score,
            l.custom_rate,
            COALESCE(l.required_equipment, '{}') AS required_equipment,
            COALESCE(l.required_certifications, '{}') AS required_certifications,
            COALESCE(l.min_driver_rating, 0) AS min_driver_rating,
            l.collection_start_date, l.created_at
     FROM locations l WHERE l.id = $1`,
    [locationId]
  );
  if (locResult.rows.length === 0) {
    return { locationId, assigned: false, reason: 'no_zone', details: 'Location not found' };
  }
  const loc = locResult.rows[0];

  if (!loc.collection_day) {
    return { locationId, assigned: false, reason: 'no_collection_day' };
  }
  if (!loc.zone_id) {
    return { locationId, assigned: false, reason: 'no_zone', details: 'No coverage zone assigned' };
  }

  // 3. Find active contract for this zone+day
  const contractResult = await pool.query(
    `SELECT rc.id, rc.driver_id, rc.per_stop_rate, rc.zone_id, rc.day_of_week,
            dp.name AS driver_name, dp.equipment_types, dp.certifications,
            dp.max_stops_per_day, dp.rating,
            sz.name AS zone_name
     FROM route_contracts rc
     JOIN driver_profiles dp ON rc.driver_id = dp.id
     LEFT JOIN service_zones sz ON rc.zone_id = sz.id
     WHERE rc.zone_id = $1
       AND rc.day_of_week = $2
       AND rc.status = 'active'
       AND rc.start_date <= CURRENT_DATE
       AND rc.end_date >= CURRENT_DATE
     LIMIT 1`,
    [loc.zone_id, loc.collection_day.toLowerCase()]
  );

  if (contractResult.rows.length === 0) {
    return { locationId, assigned: false, reason: 'no_contract' };
  }
  const contract = contractResult.rows[0];

  // 4. Check driver qualifications
  const driverEquipment: string[] = contract.equipment_types || [];
  const driverCerts: string[] = contract.certifications || [];
  const requiredEquipment: string[] = loc.required_equipment || [];
  const requiredCerts: string[] = loc.required_certifications || [];
  const minRating = parseFloat(loc.min_driver_rating) || 0;
  const driverRating = parseFloat(contract.rating) || 0;

  const missingEquipment = requiredEquipment.filter((e: string) => !driverEquipment.includes(e));
  if (missingEquipment.length > 0) {
    return {
      locationId, assigned: false, reason: 'qualification_mismatch',
      details: `Missing equipment: ${missingEquipment.join(', ')}`,
    };
  }

  const missingCerts = requiredCerts.filter((c: string) => !driverCerts.includes(c));
  if (missingCerts.length > 0) {
    return {
      locationId, assigned: false, reason: 'qualification_mismatch',
      details: `Missing certifications: ${missingCerts.join(', ')}`,
    };
  }

  if (minRating > 0 && driverRating < minRating) {
    return {
      locationId, assigned: false, reason: 'qualification_mismatch',
      details: `Driver rating ${driverRating} below minimum ${minRating}`,
    };
  }

  // 5. Find next scheduled date
  const frequency = loc.collection_frequency || 'weekly';
  const anchorDate = loc.collection_start_date
    ? (typeof loc.collection_start_date === 'string' ? loc.collection_start_date.split('T')[0] : new Date(loc.collection_start_date).toISOString().split('T')[0])
    : null;
  const nextDate = getNextCollectionDate(loc.collection_day, frequency, anchorDate);
  if (!nextDate) {
    return { locationId, assigned: false, reason: 'no_collection_day', details: 'Could not determine next collection date' };
  }

  // 6. Check capacity for that date
  const maxStops = contract.max_stops_per_day || 50;
  const currentStopsResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM route_stops rs
     JOIN routes r ON rs.route_id = r.id
     WHERE r.assigned_driver_id = $1
       AND r.scheduled_date = $2
       AND rs.status != 'cancelled'`,
    [contract.driver_id, nextDate]
  );
  const currentStops = currentStopsResult.rows[0].count;

  if (currentStops >= maxStops) {
    return { locationId, assigned: false, reason: 'capacity_exceeded',
      details: `Driver has ${currentStops}/${maxStops} stops on ${nextDate}`,
    };
  }

  // 7. Find or create route for this contract+date
  let routeId: string;
  const existingRoute = await pool.query(
    `SELECT id FROM routes WHERE contract_id = $1 AND scheduled_date = $2 LIMIT 1`,
    [contract.id, nextDate]
  );

  if (existingRoute.rows.length > 0) {
    routeId = existingRoute.rows[0].id;
  } else {
    // Create a new route for this contract+date
    const title = `${contract.zone_name || 'Zone'} - ${loc.collection_day.charAt(0).toUpperCase() + loc.collection_day.slice(1)}`;
    const route = await storage.createRoute({
      title,
      scheduled_date: nextDate,
      assigned_driver_id: contract.driver_id,
      route_type: 'daily_route',
      zone_id: contract.zone_id,
      source: 'contract',
      status: 'assigned',
    });
    routeId = route.id;

    // Link route to contract and set pay_mode to dynamic
    await pool.query(
      `UPDATE routes SET contract_id = $1, pay_mode = 'dynamic' WHERE id = $2`,
      [contract.id, routeId]
    );
  }

  // 8. Check if location is already a stop on this route
  const existingStop = await pool.query(
    `SELECT id FROM route_stops WHERE route_id = $1 AND location_id = $2 LIMIT 1`,
    [routeId, locationId]
  );
  if (existingStop.rows.length > 0) {
    return { locationId, assigned: true, routeId, contractId: contract.id,
      details: 'Location already on this route' };
  }

  // 9. Calculate stop compensation
  const rules = await getActiveRules();
  const locationCtx = {
    id: loc.id,
    address: loc.address || '',
    service_type: loc.service_type || 'residential',
    difficulty_score: parseFloat(loc.difficulty_score) || 1.0,
    custom_rate: loc.custom_rate != null ? parseFloat(loc.custom_rate) : null,
    zone_id: loc.zone_id,
  };
  const contractCtx = contract.per_stop_rate != null
    ? { per_stop_rate: parseFloat(contract.per_stop_rate) }
    : null;
  const breakdown = calculateStopCompensation(locationCtx, contractCtx, rules);

  // Get next stop number
  const maxStopResult = await pool.query(
    `SELECT COALESCE(MAX(stop_number), 0)::int AS max_num FROM route_stops WHERE route_id = $1`,
    [routeId]
  );
  const nextStopNumber = maxStopResult.rows[0].max_num + 1;

  // 10. Add the stop
  await pool.query(
    `INSERT INTO route_stops (route_id, location_id, order_type, stop_number, status, compensation)
     VALUES ($1, $2, 'recurring', $3, 'pending', $4)`,
    [routeId, locationId, nextStopNumber, breakdown.finalRate]
  );

  // 11. Recalculate route value
  await recalculateRouteValue(routeId);

  // 12. Build capacity warning if approaching limit
  const newStopCount = currentStops + 1;
  const percentage = Math.round((newStopCount / maxStops) * 100);
  const capacityWarning = percentage >= 80
    ? { currentStops: newStopCount, maxStops, percentage }
    : undefined;

  console.log(`[AutoAssign] Location ${locationId} → Route ${routeId} (contract ${contract.id}), compensation $${breakdown.finalRate}, capacity ${newStopCount}/${maxStops}`);

  return {
    locationId,
    assigned: true,
    routeId,
    contractId: contract.id,
    compensation: breakdown.finalRate,
    capacityWarning,
  };
}

async function logAssignmentResult(result: AutoAssignResult): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO auto_assignment_log (location_id, contract_id, route_id, assigned, reason, details, compensation, capacity_warning)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        result.locationId,
        result.contractId || null,
        result.routeId || null,
        result.assigned,
        result.reason || null,
        result.details || null,
        result.compensation || null,
        result.capacityWarning ? true : false,
      ]
    );
  } catch (err) {
    console.error('[AutoAssign] Failed to log assignment result:', err);
  }
}

/**
 * Try to auto-assign multiple locations. Returns results for each.
 */
export async function tryAutoAssignBatch(locationIds: string[]): Promise<AutoAssignResult[]> {
  const results: AutoAssignResult[] = [];
  for (const id of locationIds) {
    try {
      const result = await tryAutoAssignLocation(id);
      results.push(result);
    } catch (err) {
      console.error(`[AutoAssign] Error assigning location ${id}:`, err);
      results.push({ locationId: id, assigned: false, reason: 'no_zone', details: String(err) });
    }
  }
  return results;
}
