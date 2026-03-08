import { pool } from './db';

/**
 * Bid Auto-Accept Engine
 *
 * Runs on a schedule to automatically accept the best bid on routes
 * that have been open for bidding past a configurable window.
 *
 * Scoring: 0.4*rating + 0.3*reliability + 0.2*zoneFamiliarity + 0.1*priceCompetitiveness
 */

interface ScoredBid {
  id: string;
  route_id: string;
  driver_id: string;
  bid_amount: number;
  driver_rating: number | null;
  jobs_completed: number;
  zone_jobs: number;
  score: number;
}

function scoreBid(
  bid: { bid_amount: number; driver_rating: number | null; jobs_completed: number; zone_jobs: number },
  allBidAmounts: number[],
): number {
  // Rating: 0-5 normalized to 0-1 (default 3.0 if unrated)
  const rating = ((bid.driver_rating ?? 3.0) / 5.0);

  // Reliability proxy: jobs completed (capped at 100 for normalization)
  const reliability = Math.min(bid.jobs_completed / 100, 1.0);

  // Zone familiarity: jobs in the route's zone (capped at 50)
  const zoneFamiliarity = Math.min(bid.zone_jobs / 50, 1.0);

  // Price competitiveness: lower bid = higher score (relative to other bids)
  let priceScore = 0.5;
  if (allBidAmounts.length > 1) {
    const min = Math.min(...allBidAmounts);
    const max = Math.max(...allBidAmounts);
    if (max > min) {
      priceScore = 1.0 - (bid.bid_amount - min) / (max - min);
    }
  }

  return (0.4 * rating) + (0.3 * reliability) + (0.2 * zoneFamiliarity) + (0.1 * priceScore);
}

export async function runBidAutoAccept(): Promise<{ accepted: number; expired: number }> {
  const result = { accepted: 0, expired: 0 };

  const enabled = process.env.AUTO_ACCEPT_BIDS !== 'false';
  if (!enabled) return result;

  const windowHours = parseFloat(process.env.BID_WINDOW_HOURS || '2');
  const sameDayMinutes = parseFloat(process.env.SAME_DAY_BID_WINDOW_MINUTES || '15');

  // Find routes in 'bidding' status that have pending bids past the window
  const routesResult = await pool.query(
    `SELECT DISTINCT r.id, r.title, r.scheduled_date, r.zone_id,
            r.scheduled_date::date = CURRENT_DATE AS is_same_day,
            MIN(rb.created_at) AS first_bid_at
     FROM routes r
     JOIN route_bids rb ON rb.route_id = r.id AND rb.status = 'pending'
     WHERE r.status IN ('open', 'bidding')
       AND r.assigned_driver_id IS NULL
     GROUP BY r.id
     HAVING (
       (r.scheduled_date::date = CURRENT_DATE AND MIN(rb.created_at) < NOW() - make_interval(mins => $1::int))
       OR
       (r.scheduled_date::date != CURRENT_DATE AND MIN(rb.created_at) < NOW() - make_interval(hours => $2::int))
     )`,
    [sameDayMinutes, windowHours]
  );

  for (const route of routesResult.rows) {
    try {
      // Get all pending bids with driver info
      const bidsResult = await pool.query(
        `SELECT rb.id, rb.route_id, rb.driver_id, rb.bid_amount,
                d.rating AS driver_rating, d.jobs_completed,
                COALESCE(zj.zone_jobs, 0)::int AS zone_jobs
         FROM route_bids rb
         JOIN driver_profiles d ON d.id = rb.driver_id
         LEFT JOIN (
           SELECT rs2.route_id, COUNT(*)::int AS zone_jobs
           FROM route_orders rs2
           JOIN routes r2 ON r2.id = rs2.route_id
           WHERE r2.zone_id = $2 AND r2.status = 'completed'
           GROUP BY rs2.route_id
         ) zj ON zj.route_id = rb.route_id
         WHERE rb.route_id = $1 AND rb.status = 'pending'
         ORDER BY rb.created_at ASC`,
        [route.id, route.zone_id]
      );

      if (bidsResult.rows.length === 0) continue;

      const allBidAmounts = bidsResult.rows.map((b: any) => Number(b.bid_amount));
      const scoredBids: ScoredBid[] = bidsResult.rows.map((b: any) => ({
        ...b,
        bid_amount: Number(b.bid_amount),
        jobs_completed: Number(b.jobs_completed || 0),
        zone_jobs: Number(b.zone_jobs || 0),
        driver_rating: b.driver_rating ? Number(b.driver_rating) : null,
        score: scoreBid({
          bid_amount: Number(b.bid_amount),
          driver_rating: b.driver_rating ? Number(b.driver_rating) : null,
          jobs_completed: Number(b.jobs_completed || 0),
          zone_jobs: Number(b.zone_jobs || 0),
        }, allBidAmounts),
      }));

      // Sort by score descending, then by earliest bid as tiebreaker
      scoredBids.sort((a, b) => b.score - a.score);
      const winner = scoredBids[0];

      // Accept the winning bid — same logic as admin manual accept
      await pool.query(
        `UPDATE routes SET status = 'assigned', assigned_driver_id = $1, accepted_bid_id = $2,
                actual_pay = $3, updated_at = NOW()
         WHERE id = $4`,
        [winner.driver_id, winner.id, winner.bid_amount, winner.route_id]
      );

      // Mark winning bid accepted, others rejected
      await pool.query(`UPDATE route_bids SET status = 'accepted' WHERE id = $1`, [winner.id]);
      await pool.query(
        `UPDATE route_bids SET status = 'rejected'
         WHERE route_id = $1 AND id != $2 AND status = 'pending'`,
        [winner.route_id, winner.id]
      );

      // Send notifications (non-blocking)
      try {
        const { sendDriverNotification } = await import('./notificationService');
        const dateStr = String(route.scheduled_date).split('T')[0];
        sendDriverNotification(
          winner.driver_id,
          `Bid Accepted: ${route.title}`,
          `<p>Your bid of $${winner.bid_amount.toFixed(2)} for <strong>${route.title}</strong> (${dateStr}) has been automatically accepted.</p>`
        ).catch(() => {});
        for (const bid of scoredBids) {
          if (bid.id !== winner.id) {
            sendDriverNotification(
              bid.driver_id,
              `Bid Not Selected: ${route.title}`,
              `<p>Another driver was selected for <strong>${route.title}</strong> (${dateStr}). Check the available routes board for more opportunities.</p>`
            ).catch(() => {});
          }
        }
      } catch {}

      // Real-time WebSocket broadcasts
      try {
        const { broadcastToDriver, broadcastToAdmins } = await import('./websocket');
        broadcastToDriver(winner.driver_id, 'route:assigned', { routeId: route.id, title: route.title, scheduledDate: route.scheduled_date, autoAccepted: true });
        broadcastToAdmins('bid:auto_accepted', { routeId: route.id, title: route.title, driverId: winner.driver_id, score: winner.score });
        for (const bid of scoredBids) {
          if (bid.id !== winner.id) {
            broadcastToDriver(bid.driver_id, 'bid:rejected', { routeId: route.id, title: route.title });
          }
        }
      } catch {}

      console.log(`[BidAutoAccept] Accepted bid ${winner.id} (score: ${winner.score.toFixed(2)}) for route "${route.title}"`);
      result.accepted++;
    } catch (err: any) {
      console.error(`[BidAutoAccept] Failed to auto-accept for route ${route.id}:`, err.message);
    }
  }

  // Expire bids on routes that are past their scheduled date
  const expiredResult = await pool.query(
    `UPDATE route_bids SET status = 'expired'
     WHERE status = 'pending'
       AND route_id IN (
         SELECT id FROM routes WHERE scheduled_date < CURRENT_DATE AND status IN ('open', 'bidding')
       )
     RETURNING id`
  );
  result.expired = expiredResult.rowCount || 0;
  if (result.expired > 0) {
    console.log(`[BidAutoAccept] Expired ${result.expired} stale bid(s)`);
  }

  return result;
}
