import { type Express, type Request, type Response } from 'express';
import { requireAdmin } from './adminRoutes';
import { pool } from './db';
import { storage } from './storage';
import * as optimo from './optimoRouteClient';
import * as optimoSync from './optimoSyncService';
import { detectAndStoreCollectionDays } from './collectionDayDetector';
import { importRoutesFromOptimo, importRoutesForRange } from './optimoImportService';

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
      const options: optimo.GetRoutesOptions = { date };
      if (req.query.includeRoutePolyline === 'true') options.includeRoutePolyline = true;
      if (req.query.includeRouteStartEnd === 'true') options.includeRouteStartEnd = true;
      if (req.query.driverSerial) options.driverSerial = req.query.driverSerial as string;
      if (req.query.driverExternalId) options.driverExternalId = req.query.driverExternalId as string;
      if (req.query.vehicleRegistration) options.vehicleRegistration = req.query.vehicleRegistration as string;
      const result = await optimo.getRoutes(options);
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
      const { orderNo, type, date, address } = req.body;
      if (!orderNo || !type || !date || !address) {
        return res.status(400).json({ error: 'orderNo, type, date, and address are required' });
      }
      const result = await optimo.createOrder(req.body);
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

  // ── Bulk Order Operations ──

  app.post('/api/admin/optimoroute/orders/bulk', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { orders } = req.body;
      if (!orders || !Array.isArray(orders) || orders.length === 0) {
        return res.status(400).json({ error: 'orders array required' });
      }
      if (orders.length > 2000) {
        return res.status(400).json({ error: 'Maximum 2000 orders per request' });
      }
      const results = await optimo.createOrUpdateOrders(orders);
      res.json({ success: true, results });
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Bulk order create failed:', error);
      res.status(500).json({ error: 'Failed to bulk create/update orders' });
    }
  });

  app.post('/api/admin/optimoroute/orders/bulk-delete', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { orderNos, forceDelete } = req.body;
      if (!orderNos || !Array.isArray(orderNos) || orderNos.length === 0) {
        return res.status(400).json({ error: 'orderNos array required' });
      }
      const results = await optimo.deleteOrders(orderNos, forceDelete === true);
      res.json({ success: true, results });
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Bulk delete failed:', error);
      res.status(500).json({ error: 'Failed to bulk delete orders' });
    }
  });

  app.post('/api/admin/optimoroute/orders/delete-all', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { date, confirmPhrase } = req.body;
      if (!date && confirmPhrase !== 'DELETE_ALL_ORDERS') {
        return res.status(400).json({
          error: 'To delete ALL orders, send confirmPhrase: "DELETE_ALL_ORDERS". To delete for a specific date, provide the date parameter.',
        });
      }
      const result = await optimo.deleteAllOrders(date || undefined);
      res.json(result);
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Delete all failed:', error);
      res.status(500).json({ error: 'Failed to delete all orders' });
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

  app.get('/api/admin/optimoroute/drivers/sync-preview', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await optimoSync.previewDriverSync();
      res.json(result);
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error syncing drivers:', error);
      res.status(500).json({ error: 'Failed to preview driver sync' });
    }
  });

  app.post('/api/admin/optimoroute/drivers/sync', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { mappings } = req.body;
      if (!mappings || !Array.isArray(mappings)) {
        return res.status(400).json({ error: 'mappings array required' });
      }
      const { linked } = await optimoSync.executeDriverSync(mappings);
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
          // OptimoRoute update_driver_parameters requires externalId, not serial
          const { serial, ...rest } = driver;
          const params = { ...rest, externalId: driver.externalId || serial };
          const result = await optimo.updateDriverParams(params);
          results.push({ serial: serial || driver.externalId, success: result.success !== false });
        } catch (err: any) {
          results.push({ serial: driver.serial || driver.externalId, success: false, error: err.message });
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

  // ── Driver GPS positions ──

  app.post('/api/admin/optimoroute/drivers/positions', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { positions } = req.body;
      if (!positions || !Array.isArray(positions) || positions.length === 0) {
        return res.status(400).json({ error: 'positions array required' });
      }
      const result = await optimo.updateDriverPositions(positions);
      res.json(result);
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error updating driver positions:', error);
      res.status(500).json({ error: 'Failed to update driver positions' });
    }
  });

  // ── Customer sync ──

  app.post('/api/admin/optimoroute/customers/sync-orders', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { preview } = req.body;
      if (preview) {
        const result = await optimoSync.previewCustomerOrderSync();
        return res.json(result);
      }
      const result = await optimoSync.executeCustomerOrderSync();
      res.json(result);
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error syncing customer orders:', error);
      res.status(500).json({ error: 'Failed to sync customer orders' });
    }
  });

  // ── Automated Sync Management ──
  // Status, history, manual trigger, collection-day detection, and per-location schedule editing

  // GET /api/admin/optimoroute/sync/status — last sync info + next run time
  app.get('/api/admin/optimoroute/sync/status', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const latest = await storage.getLatestSyncLog();
      const syncHour = parseInt(process.env.OPTIMO_SYNC_HOUR || '6', 10);
      const syncEnabled = (process.env.OPTIMO_SYNC_ENABLED || 'true') !== 'false';

      // Calculate next run time
      const now = new Date();
      const nextRun = new Date(now);
      if (now.getHours() >= syncHour && latest) {
        // Already past sync hour — next run is tomorrow
        nextRun.setDate(nextRun.getDate() + 1);
      }
      nextRun.setHours(syncHour, 0, 0, 0);

      res.json({
        enabled: syncEnabled,
        syncHour,
        nextRunAt: nextRun.toISOString(),
        lastRun: latest || null,
      });
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error fetching sync status:', error);
      res.status(500).json({ error: 'Failed to fetch sync status' });
    }
  });

  // GET /api/admin/optimoroute/sync/history — past sync logs with pagination
  app.get('/api/admin/optimoroute/sync/history', requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const logs = await storage.getSyncLogHistory(limit);
      res.json({ logs });
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error fetching sync history:', error);
      res.status(500).json({ error: 'Failed to fetch sync history' });
    }
  });

  // POST /api/admin/optimoroute/sync/run — manual trigger
  app.post('/api/admin/optimoroute/sync/run', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { preview } = req.body;
      if (preview) {
        const result = await optimoSync.previewCustomerOrderSync();
        return res.json(result);
      }
      const result = await optimoSync.runAutomatedSync('manual');
      res.json(result);
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error running manual sync:', error);
      res.status(500).json({ error: 'Failed to run sync' });
    }
  });

  // POST /api/admin/optimoroute/sync/detect-days — manual collection day detection
  app.post('/api/admin/optimoroute/sync/detect-days', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await detectAndStoreCollectionDays();
      res.json(result);
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error detecting collection days:', error);
      res.status(500).json({ error: 'Failed to detect collection days' });
    }
  });

  // PUT /api/admin/locations/:id/collection-schedule — admin sets collection day/frequency
  app.put('/api/admin/locations/:id/collection-schedule', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { collection_day, collection_frequency } = req.body;

      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const validFreqs = ['weekly', 'bi-weekly', 'monthly'];

      if (collection_day && !validDays.includes(collection_day.toLowerCase())) {
        return res.status(400).json({ error: `Invalid collection_day. Must be one of: ${validDays.join(', ')}` });
      }
      if (collection_frequency && !validFreqs.includes(collection_frequency)) {
        return res.status(400).json({ error: `Invalid collection_frequency. Must be one of: ${validFreqs.join(', ')}` });
      }

      const updates: Record<string, any> = {};
      if (collection_day !== undefined) {
        updates.collection_day = collection_day ? collection_day.toLowerCase() : null;
        updates.collection_day_source = collection_day ? 'manual' : null;
        updates.collection_day_detected_at = collection_day ? new Date().toISOString() : null;
      }
      if (collection_frequency !== undefined) {
        updates.collection_frequency = collection_frequency || 'weekly';
      }

      await storage.updateLocationCollectionSchedule(id, updates);

      // If collection day was cleared or changed, clean up existing future orders and let next sync recreate
      if (collection_day !== undefined) {
        try {
          await optimoSync.cleanupFutureOrdersForLocation(id);
        } catch (err: any) {
          console.warn(`[Admin OptimoRoute] Cleanup after schedule change failed:`, err.message);
        }
      }

      const updated = await pool.query(
        `SELECT id, collection_day, collection_frequency, collection_day_source, collection_day_detected_at FROM locations WHERE id = $1`,
        [id]
      );

      res.json({ success: true, location: updated.rows[0] || null });
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Error updating collection schedule:', error);
      res.status(500).json({ error: 'Failed to update collection schedule' });
    }
  });

  // ── Import routes FROM OptimoRoute ──

  app.post('/api/admin/optimoroute/import-routes', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { date, from, to } = req.body;
      if (from && to) {
        const result = await importRoutesForRange(from, to);
        return res.json(result);
      }
      if (!date) return res.status(400).json({ error: 'date (or from+to) is required' });
      const result = await importRoutesFromOptimo(date);
      res.json(result);
    } catch (error: any) {
      console.error('[Admin OptimoRoute] Import failed:', error);
      res.status(500).json({ error: 'Failed to import routes from OptimoRoute' });
    }
  });
}
