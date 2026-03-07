import { pool } from './db';
import { storage } from './storage';

/**
 * On-Demand Matching Engine
 *
 * Automatically finds the best available driver for an on-demand request
 * based on zone coverage, availability, rating, and proximity.
 *
 * Returns the matched driver ID or null if no match found.
 */

export interface MatchResult {
  driverId: string;
  driverName: string;
  score: number;
  reason: string;
}

export async function matchOnDemandRequest(requestId: string): Promise<MatchResult | null> {
  // Get the request details
  const reqResult = await pool.query(
    `SELECT odr.*, p.zone_id, p.latitude, p.longitude, p.address
     FROM on_demand_requests odr
     JOIN locations p ON p.id = odr.location_id
     WHERE odr.id = $1`,
    [requestId]
  );
  const request = reqResult.rows[0];
  if (!request) return null;
  if (request.assigned_driver_id) return null; // Already assigned

  const zoneId = request.zone_id;
  const requestedDate = String(request.requested_date).split('T')[0];

  // Find candidate drivers:
  // 1. Have active contracts covering this zone and day of week
  // 2. Are not blocked/unavailable on that date
  // 3. Haven't exceeded capacity for that day
  const dayOfWeek = new Date(requestedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'lowercase' as any });
  const dayName = new Date(requestedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  const candidatesResult = await pool.query(
    `SELECT DISTINCT
       dp.id AS driver_id,
       dp.name AS driver_name,
       dp.rating,
       dp.jobs_completed,
       dp.max_stops_per_day,
       dp.latitude AS driver_lat,
       dp.longitude AS driver_lng
     FROM driver_profiles dp
     JOIN route_contracts rc ON rc.driver_id = dp.id
       AND rc.status = 'active'
       AND rc.day_of_week = $1
       AND (rc.zone_id = $2 OR $2 IS NULL)
     WHERE dp.onboarding_status = 'completed'
       AND NOT EXISTS (
         SELECT 1 FROM driver_availability da
         WHERE da.driver_id = dp.id AND da.date = $3 AND da.available = false
       )`,
    [dayName, zoneId, requestedDate]
  );

  if (candidatesResult.rows.length === 0) {
    // Fallback: try drivers who have selected this zone (no contract required)
    const zoneDriversResult = await pool.query(
      `SELECT DISTINCT
         dp.id AS driver_id,
         dp.name AS driver_name,
         dp.rating,
         dp.jobs_completed,
         dp.max_stops_per_day,
         dp.latitude AS driver_lat,
         dp.longitude AS driver_lng
       FROM driver_profiles dp
       JOIN driver_zone_selections dzs ON dzs.driver_id = dp.id AND dzs.zone_id = $1
       WHERE dp.onboarding_status = 'completed'
         AND NOT EXISTS (
           SELECT 1 FROM driver_availability da
           WHERE da.driver_id = dp.id AND da.date = $2 AND da.available = false
         )`,
      [zoneId, requestedDate]
    );

    if (zoneDriversResult.rows.length === 0) return null;
    return scoreAndSelect(zoneDriversResult.rows, request, requestedDate, 'zone_selection');
  }

  return scoreAndSelect(candidatesResult.rows, request, requestedDate, 'contract');
}

async function scoreAndSelect(
  candidates: any[],
  request: any,
  requestedDate: string,
  matchType: string
): Promise<MatchResult | null> {
  // Check each candidate's current load for the day
  const scored: Array<{ driver: any; score: number }> = [];

  for (const driver of candidates) {
    // Count existing stops for this driver on this date
    const loadResult = await pool.query(
      `SELECT COUNT(*)::int AS stop_count
       FROM route_stops rs
       JOIN routes r ON r.id = rs.route_id
       WHERE r.assigned_driver_id = $1
         AND r.scheduled_date = $2
         AND r.status NOT IN ('cancelled', 'completed')`,
      [driver.driver_id, requestedDate]
    );
    const currentLoad = loadResult.rows[0]?.stop_count || 0;
    const maxStops = driver.max_stops_per_day || 60;

    if (currentLoad >= maxStops) continue; // Skip overloaded drivers

    // Score: rating (0.4) + capacity headroom (0.3) + experience (0.3)
    const rating = ((driver.rating ? Number(driver.rating) : 3.0) / 5.0);
    const capacityHeadroom = Math.max(0, (maxStops - currentLoad) / maxStops);
    const experience = Math.min(Number(driver.jobs_completed || 0) / 100, 1.0);

    const score = (0.4 * rating) + (0.3 * capacityHeadroom) + (0.3 * experience);
    scored.push({ driver, score });
  }

  if (scored.length === 0) return null;

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  return {
    driverId: best.driver.driver_id,
    driverName: best.driver.driver_name,
    score: best.score,
    reason: `${matchType}: rating=${(best.driver.rating || 0).toFixed(1)}, score=${best.score.toFixed(2)}`,
  };
}

/**
 * Attempt to auto-match and assign an on-demand request.
 * Called after request creation.
 * Returns true if matched, false if queued for manual assignment.
 */
export async function autoMatchAndAssign(requestId: string): Promise<boolean> {
  try {
    const match = await matchOnDemandRequest(requestId);
    if (!match) {
      console.log(`[OnDemandMatch] No match found for request ${requestId}, queued for manual`);
      return false;
    }

    // Assign the driver
    await storage.updateOnDemandRequest(requestId, {
      assignedDriverId: match.driverId,
      status: 'scheduled',
    });

    // Send notification to driver
    try {
      const { sendDriverNotification } = await import('./notificationService');
      const reqData = await pool.query(
        `SELECT odr.*, p.address FROM on_demand_requests odr JOIN locations p ON p.id = odr.location_id WHERE odr.id = $1`,
        [requestId]
      );
      const req = reqData.rows[0];
      if (req) {
        const dateStr = String(req.requested_date).split('T')[0];
        sendDriverNotification(
          match.driverId,
          `New On-Demand Pickup Assigned`,
          `<p>You've been assigned an on-demand pickup:</p>
           <ul>
             <li><strong>Address:</strong> ${req.address}</li>
             <li><strong>Date:</strong> ${dateStr}</li>
             <li><strong>Service:</strong> ${req.service_name}</li>
           </ul>
           <p>Check your team portal for details.</p>`
        ).catch(() => {});
      }
    } catch {}

    // Real-time WebSocket broadcasts
    try {
      const { broadcastToDriver, broadcastToAdmins } = await import('./websocket');
      broadcastToDriver(match.driverId, 'ondemand:assigned', { requestId, driverName: match.driverName, autoMatched: true });
      broadcastToAdmins('ondemand:matched', { requestId, driverId: match.driverId, driverName: match.driverName, score: match.score });
    } catch {}

    console.log(`[OnDemandMatch] Matched request ${requestId} to driver ${match.driverName} (score: ${match.score.toFixed(2)})`);
    return true;
  } catch (error: any) {
    console.error(`[OnDemandMatch] Failed to match request ${requestId}:`, error.message);
    return false;
  }
}
