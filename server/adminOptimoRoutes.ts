import { type Express, type Request, type Response } from 'express';
import { requireAdmin } from './adminRoutes';
import { pool } from './db';
import * as optimo from './optimoRouteClient';

export function registerAdminOptimoRoutes(app: Express) {
  // ── Test Connection ──

  app.get('/api/admin/optimoroute/test-connection', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Test 1: Fetch today's routes (validates API key + connection)
      const routeResult = await optimo.getRoutes(today);
      const routes = routeResult.routes || (routeResult as any).data || [];

      // Extract unique drivers from today's routes
      // Note: driverSerial can be empty string for some accounts, use driverName as fallback key
      const drivers: { serial: string; name: string }[] = [];
      const seen = new Set<string>();
      for (const route of routes) {
        const driverKey = route.driverSerial || route.driverName || '';
        if (driverKey && !seen.has(driverKey)) {
          seen.add(driverKey);
          drivers.push({ serial: route.driverSerial || driverKey, name: route.driverName || route.driverSerial || 'Unknown' });
        }
      }

      // Extract unique locations from today's stops
      const locations: { address: string; name?: string }[] = [];
      const seenAddr = new Set<string>();
      for (const route of routes) {
        for (const stop of route.stops || []) {
          const addr = stop.address || stop.location?.address || '';
          if (addr && !seenAddr.has(addr.toLowerCase())) {
            seenAddr.add(addr.toLowerCase());
            locations.push({ address: addr, name: stop.locationName || stop.location?.locationName });
          }
        }
      }

      res.json({
        success: true,
        message: 'OptimoRoute API connection is working',
        date: today,
        routeCount: routes.length,
        drivers,
        locations,
      });
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Connection test failed:', error);
      const message = error.message?.includes('OptimoRoute API error')
        ? error.message
        : 'Failed to connect to OptimoRoute API. Check your OPTIMOROUTE_API_KEY.';
      res.status(502).json({ success: false, error: message });
    }
  });

  // ── Routes (today's routes) ──

  app.get('/api/admin/optimoroute/routes', requireAdmin, async (req: Request, res: Response) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const result = await optimo.getRoutes(date);
      res.json({ routes: result.routes || (result as any).data || [], date });
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error fetching routes:', error);
      res.status(500).json({ error: 'Failed to fetch routes' });
    }
  });

  // ── Orders ──

  app.get('/api/admin/optimoroute/orders', requireAdmin, async (req: Request, res: Response) => {
    try {
      const from = req.query.from as string;
      const to = req.query.to as string;
      if (!from || !to) {
        return res.status(400).json({ error: 'from and to date parameters required' });
      }
      const result = await optimo.searchOrders(from, to, true);
      // Flatten nested data and ensure id is always present
      const orders = (result.orders || []).map((o: any) => ({
        ...o.data,
        id: o.id || o.data?.id,
        orderNo: o.data?.orderNo || o.orderNo || '',
      }));
      res.json({ orders });
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error searching orders:', error);
      res.status(500).json({ error: 'Failed to search orders' });
    }
  });

  app.get('/api/admin/optimoroute/orders/:identifier', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { identifier } = req.params;
      const isId = /^[0-9a-f]{20,}$/.test(identifier);
      const [orderResult, completionResult] = await Promise.allSettled([
        optimo.getOrders([identifier], isId),
        optimo.getCompletionDetailsFull([identifier], isId),
      ]);

      const orderRaw = orderResult.status === 'fulfilled' ? orderResult.value?.orders?.[0] : null;
      const order = orderRaw?.data || null;
      let schedule = null;
      if (order?.orderNo) {
        try { schedule = await optimo.getSchedulingInfo(order.orderNo); } catch {}
      }
      const completion = completionResult.status === 'fulfilled' ? completionResult.value?.orders?.[0] : null;

      res.json({ order, schedule, completion: completion?.data || null });
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error fetching order:', error);
      res.status(500).json({ error: 'Failed to fetch order details' });
    }
  });

  app.post('/api/admin/optimoroute/orders', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { orderNo, type, date, address, locationName, duration, notes, timeWindows, priority, assignedTo } = req.body;
      if (!orderNo || !type || !date || !address) {
        return res.status(400).json({ error: 'orderNo, type, date, and address are required' });
      }
      const result = await optimo.createOrder({ orderNo, type, date, address, locationName, duration, notes });
      res.json(result);
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error creating order:', error);
      res.status(500).json({ error: 'Failed to create order' });
    }
  });

  app.delete('/api/admin/optimoroute/orders/:orderNo', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { orderNo } = req.params;
      const forceDelete = req.query.force === 'true';
      const result = await optimo.deleteOrder(orderNo, forceDelete);
      res.json(result);
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error deleting order:', error);
      res.status(500).json({ error: 'Failed to delete order' });
    }
  });

  // ── Planning ──

  app.post('/api/admin/optimoroute/planning/start', requireAdmin, async (req: Request, res: Response) => {
    try {
      const result = await optimo.startPlanning(req.body);
      res.json(result);
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error starting planning:', error);
      res.status(500).json({ error: 'Failed to start planning' });
    }
  });

  app.post('/api/admin/optimoroute/planning/stop', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { planningId } = req.body;
      if (!planningId) return res.status(400).json({ error: 'planningId required' });
      const result = await optimo.stopPlanning(planningId);
      res.json(result);
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error stopping planning:', error);
      res.status(500).json({ error: 'Failed to stop planning' });
    }
  });

  app.get('/api/admin/optimoroute/planning/status', requireAdmin, async (req: Request, res: Response) => {
    try {
      const planningId = parseInt(req.query.planningId as string);
      if (isNaN(planningId)) return res.status(400).json({ error: 'planningId required' });
      const result = await optimo.getPlanningStatus(planningId);
      res.json(result);
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error getting planning status:', error);
      res.status(500).json({ error: 'Failed to get planning status' });
    }
  });

  // ── Events (live tracking) ──

  app.get('/api/admin/optimoroute/events', requireAdmin, async (req: Request, res: Response) => {
    try {
      const afterTag = req.query.afterTag as string | undefined;
      const result = await optimo.getEvents(afterTag);
      res.json(result);
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error fetching events:', error);
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  });

  // ── Completion ──

  app.get('/api/admin/optimoroute/completion', requireAdmin, async (req: Request, res: Response) => {
    try {
      const orderNosParam = req.query.orderNos as string;
      const idsParam = req.query.ids as string;
      if (!orderNosParam && !idsParam) return res.status(400).json({ error: 'orderNos or ids parameter required (comma-separated)' });
      const byId = !!idsParam;
      const identifiers = (idsParam || orderNosParam)!.split(',').map(s => s.trim()).filter(Boolean);
      const result = await optimo.getCompletionDetailsFull(identifiers, byId);
      res.json(result);
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error fetching completion details:', error);
      res.status(500).json({ error: 'Failed to fetch completion details' });
    }
  });

  app.put('/api/admin/optimoroute/completion', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { updates } = req.body;
      if (!updates || !Array.isArray(updates)) return res.status(400).json({ error: 'updates array required' });
      const result = await optimo.updateCompletionDetails(updates);
      res.json(result);
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error updating completion:', error);
      res.status(500).json({ error: 'Failed to update completion details' });
    }
  });

  // ── Driver sync ──

  app.get('/api/admin/optimoroute/drivers/sync-preview', requireAdmin, async (req: Request, res: Response) => {
    try {
      // Fetch routes from the past 7 days to find active OptimoRoute drivers
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
            // driverSerial can be empty for some accounts — use driverName as fallback key
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
              // Collect a sample of stop addresses (first 5 from most recent route)
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

      // Fetch local driver profiles
      const localResult = await pool.query(
        `SELECT dp.id, dp.user_id, dp.name, dp.optimoroute_driver_id, dp.status,
                u.first_name, u.last_name, u.email
         FROM driver_profiles dp
         LEFT JOIN users u ON u.id = dp.user_id
         ORDER BY dp.name`
      );

      const localDrivers = localResult.rows;
      const linkedSerials = new Set(localDrivers.filter(d => d.optimoroute_driver_id).map(d => d.optimoroute_driver_id));

      const matched: any[] = [];
      const unmatchedOptimo: any[] = [];
      const unmatchedLocal: any[] = [];

      for (const [serial, optimoDriver] of driverMap) {
        const localMatch = localDrivers.find(d => d.optimoroute_driver_id === serial);
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

      res.json({ matched, unmatchedOptimo, unmatchedLocal });
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error syncing drivers:', error);
      res.status(500).json({ error: 'Failed to preview driver sync' });
    }
  });

  app.post('/api/admin/optimoroute/drivers/sync', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { mappings } = req.body; // Array of { optimorouteSerial, driverProfileId }
      if (!mappings || !Array.isArray(mappings)) {
        return res.status(400).json({ error: 'mappings array required' });
      }

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

      res.json({ success: true, linked });
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error syncing drivers:', error);
      res.status(500).json({ error: 'Failed to sync drivers' });
    }
  });

  // ── Driver parameters ──

  app.put('/api/admin/optimoroute/drivers/:serial/parameters', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { serial } = req.params;
      const params = { ...req.body, serial };
      const result = await optimo.updateDriverParams(params);
      res.json(result);
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error updating driver params:', error);
      res.status(500).json({ error: 'Failed to update driver parameters' });
    }
  });

  // Push local driver parameters to OptimoRoute (bulk)
  app.post('/api/admin/optimoroute/drivers/push', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { drivers } = req.body; // Array of { serial, date, workTimeFrom, workTimeTo, enabled }
      if (!drivers || !Array.isArray(drivers) || drivers.length === 0) {
        return res.status(400).json({ error: 'drivers array required' });
      }

      const results: { serial: string; success: boolean; error?: string }[] = [];
      for (const driver of drivers) {
        try {
          const result = await optimo.updateDriverParams(driver);
          results.push({ serial: driver.serial, success: result.success !== false });
        } catch (err: any) {
          results.push({ serial: driver.serial, success: false, error: err.message });
        }
      }

      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      res.json({ success: true, pushed: succeeded, failed, results });
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error pushing drivers:', error);
      res.status(500).json({ error: 'Failed to push drivers to OptimoRoute' });
    }
  });

  // ── Customer sync ──

  app.post('/api/admin/optimoroute/customers/sync-orders', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { preview } = req.body;

      // Get all active properties with subscriptions
      const propResult = await pool.query(
        `SELECT p.id, p.address, p.user_id, u.first_name, u.last_name, u.email,
                (SELECT COUNT(*) FROM stripe.subscriptions s WHERE s.customer = u.stripe_customer_id AND s.status = 'active') as active_subs
         FROM properties p
         JOIN users u ON u.id = p.user_id
         WHERE p.address IS NOT NULL AND p.address != ''
           AND u.stripe_customer_id IS NOT NULL
         ORDER BY u.last_name, u.first_name`
      );

      const properties = propResult.rows.filter(p => parseInt(p.active_subs) > 0);

      // Check each property for upcoming orders
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

      const missing = results.filter(r => !r.hasOrders);

      if (preview) {
        return res.json({ total: results.length, withOrders: results.length - missing.length, missing });
      }

      // Create orders for properties without upcoming ones
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

      res.json({ total: results.length, withOrders: results.length - missing.length, missing: missing.length, created });
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error syncing customer orders:', error);
      res.status(500).json({ error: 'Failed to sync customer orders' });
    }
  });
}

function getNextBusinessDay(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}
