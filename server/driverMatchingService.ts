import { pool } from './db';

/**
 * Smart Driver Matching Service
 *
 * Composite scoring used across the platform:
 * - Bid auto-accept (bidAutoAcceptEngine.ts)
 * - On-demand matching (onDemandMatchingEngine.ts)
 * - Contract awarding
 * - Route claiming priority
 *
 * Score = 0.30*rating + 0.25*reliability + 0.20*proximity + 0.15*zoneFamiliarity + 0.10*costEfficiency
 */

export interface DriverScore {
  driverId: string;
  driverName: string;
  score: number;
  breakdown: {
    rating: number;
    reliability: number;
    proximity: number;
    zoneFamiliarity: number;
    costEfficiency: number;
  };
}

export interface MatchContext {
  zoneId?: string;
  scheduledDate?: string;
  latitude?: number;
  longitude?: number;
  bidAmount?: number;
  allBidAmounts?: number[];
}

/**
 * Score a single driver against match context.
 */
export async function scoreDriver(driverId: string, ctx: MatchContext): Promise<DriverScore | null> {
  const driverResult = await pool.query(
    `SELECT id, name, rating, jobs_completed, reliability_score, total_declines, total_no_shows,
            latitude, longitude
     FROM driver_profiles WHERE id = $1`,
    [driverId]
  );
  const driver = driverResult.rows[0];
  if (!driver) return null;

  return computeScore(driver, ctx);
}

/**
 * Score and rank multiple candidate drivers.
 */
export async function rankDrivers(driverIds: string[], ctx: MatchContext): Promise<DriverScore[]> {
  if (driverIds.length === 0) return [];

  const result = await pool.query(
    `SELECT id, name, rating, jobs_completed, reliability_score, total_declines, total_no_shows,
            latitude, longitude
     FROM driver_profiles WHERE id = ANY($1)`,
    [driverIds]
  );

  const scores: DriverScore[] = [];
  for (const driver of result.rows) {
    const score = await computeScore(driver, ctx);
    if (score) scores.push(score);
  }

  scores.sort((a, b) => b.score - a.score);
  return scores;
}

async function computeScore(driver: any, ctx: MatchContext): Promise<DriverScore> {
  // 1. Rating (0-5 → 0-1, default 3.0)
  const ratingNorm = (parseFloat(driver.rating) || 3.0) / 5.0;

  // 2. Reliability (from reliability_score column, or computed)
  const reliabilityNorm = parseFloat(driver.reliability_score) || 1.0;

  // 3. Proximity (haversine distance if lat/lng available)
  let proximityNorm = 0.5; // default mid-range
  if (ctx.latitude && ctx.longitude && driver.latitude && driver.longitude) {
    const dist = haversineDistance(
      parseFloat(driver.latitude), parseFloat(driver.longitude),
      ctx.latitude, ctx.longitude
    );
    // Normalize: 0 miles = 1.0, 50+ miles = 0.0
    proximityNorm = Math.max(0, 1.0 - dist / 50);
  }

  // 4. Zone familiarity (completed jobs in this zone)
  let zoneFamiliarityNorm = 0.5;
  if (ctx.zoneId) {
    const zoneResult = await pool.query(
      `SELECT COUNT(*)::int AS zone_jobs
       FROM routes
       WHERE assigned_driver_id = $1 AND zone_id = $2 AND status = 'completed'`,
      [driver.id, ctx.zoneId]
    );
    const zoneJobs = zoneResult.rows[0]?.zone_jobs || 0;
    zoneFamiliarityNorm = Math.min(zoneJobs / 50, 1.0);
  }

  // 5. Cost efficiency (lower bid = higher score, if bidding context)
  let costEfficiencyNorm = 0.5;
  if (ctx.bidAmount !== undefined && ctx.allBidAmounts && ctx.allBidAmounts.length > 1) {
    const min = Math.min(...ctx.allBidAmounts);
    const max = Math.max(...ctx.allBidAmounts);
    if (max > min) {
      costEfficiencyNorm = 1.0 - (ctx.bidAmount - min) / (max - min);
    }
  }

  const score =
    0.30 * ratingNorm +
    0.25 * reliabilityNorm +
    0.20 * proximityNorm +
    0.15 * zoneFamiliarityNorm +
    0.10 * costEfficiencyNorm;

  return {
    driverId: driver.id,
    driverName: driver.name,
    score: Math.round(score * 1000) / 1000,
    breakdown: {
      rating: ratingNorm,
      reliability: reliabilityNorm,
      proximity: proximityNorm,
      zoneFamiliarity: zoneFamiliarityNorm,
      costEfficiency: costEfficiencyNorm,
    },
  };
}

/**
 * Update a driver's reliability score based on their history.
 * Call after declines, no-shows, or completions.
 */
export async function updateReliabilityScore(driverId: string): Promise<void> {
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
       COUNT(*) FILTER (WHERE notes LIKE '%Declined by%')::int AS declines,
       COUNT(*)::int AS total
     FROM routes
     WHERE assigned_driver_id = $1 AND scheduled_date >= CURRENT_DATE - INTERVAL '90 days'`,
    [driverId]
  );

  const { completed, declines, total } = result.rows[0];
  if (total === 0) return;

  // Reliability = completion rate, penalized by declines
  const completionRate = completed / Math.max(total, 1);
  const declinePenalty = Math.min(declines * 0.05, 0.3);
  const reliability = Math.max(0, Math.min(1.0, completionRate - declinePenalty));

  await pool.query(
    `UPDATE driver_profiles SET reliability_score = $1, total_declines = $2, updated_at = NOW() WHERE id = $3`,
    [Math.round(reliability * 100) / 100, declines, driverId]
  );
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
