import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '../../../../components/Button.tsx';
import { CATEGORIES, ENDPOINTS, TEST_PREFIX, type ApiTesterEndpoint, type ApiTesterField, type ProxyRequest } from './apiTesterEndpoints';

type EndpointState = {
  values: Record<string, string>;
  loading: boolean;
  response: { status: number; body: any; durationMs: number } | null;
  error: string | null;
  expanded: boolean;
  confirmText: string;
};

type TestStep = {
  label: string;
  status: 'pending' | 'running' | 'pass' | 'fail';
  response?: { status: number; body: any; durationMs: number };
  error?: string;
};

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-100 text-green-700',
  POST: 'bg-blue-100 text-blue-700',
};

const PROXY_URL = '/api/admin/optimoroute/api-proxy';

function initState(endpoint: ApiTesterEndpoint): EndpointState {
  const values: Record<string, string> = {};
  for (const f of endpoint.fields) {
    values[f.name] = f.defaultValue || '';
  }
  return { values, loading: false, response: null, error: null, expanded: false, confirmText: '' };
}

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return 'bg-green-100 text-green-700';
  if (status >= 400 && status < 500) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

async function callProxy(req: ProxyRequest): Promise<{ status: number; body: any; durationMs: number }> {
  const start = performance.now();
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const durationMs = Math.round(performance.now() - start);

  if (!res.ok) {
    const text = await res.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: res.status, body: parsed, durationMs };
  }

  const json = await res.json();
  return { status: json.status || res.status, body: json.data, durationMs };
}

const OptimoRouteApiTester: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<string>('orders');
  const [states, setStates] = useState<Record<string, EndpointState>>(() => {
    const init: Record<string, EndpointState> = {};
    for (const ep of ENDPOINTS) init[ep.id] = initState(ep);
    return init;
  });

  // Run All Tests state
  const [testSteps, setTestSteps] = useState<TestStep[]>([]);
  const [testRunning, setTestRunning] = useState(false);
  const abortRef = useRef(false);
  // Track all _TEST_ orders created so we can clean up on unmount
  const createdOrdersRef = useRef<Set<string>>(new Set());

  const cleanupAllTestOrders = useCallback(async () => {
    const orders = Array.from(createdOrdersRef.current);
    if (orders.length === 0) return;
    await Promise.allSettled(
      orders.map(orderNo =>
        callProxy({ endpoint: 'delete_order', method: 'POST', body: { orderNo } })
          .then(() => createdOrdersRef.current.delete(orderNo))
          .catch(() => {})
      ),
    );
  }, []);

  // Clean up any lingering test orders on unmount or page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      const orders = Array.from(createdOrdersRef.current);
      if (orders.length === 0) return;
      // Best-effort cleanup via sendBeacon
      for (const orderNo of orders) {
        navigator.sendBeacon(
          PROXY_URL,
          new Blob([JSON.stringify({ endpoint: 'delete_order', method: 'POST', body: { orderNo } })],
            { type: 'application/json' }),
        );
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Component unmount — fire-and-forget cleanup
      cleanupAllTestOrders();
    };
  }, [cleanupAllTestOrders]);

  const updateState = useCallback((id: string, patch: Partial<EndpointState>) => {
    setStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const updateValue = useCallback((id: string, fieldName: string, value: string) => {
    setStates(prev => ({
      ...prev,
      [id]: { ...prev[id], values: { ...prev[id].values, [fieldName]: value } },
    }));
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setStates(prev => ({ ...prev, [id]: { ...prev[id], expanded: !prev[id].expanded } }));
  }, []);

  const runEndpoint = useCallback(async (endpoint: ApiTesterEndpoint) => {
    const state = states[endpoint.id];
    if (!state) return;

    // Validate required fields
    for (const f of endpoint.fields) {
      if (f.required && !state.values[f.name]?.trim()) {
        updateState(endpoint.id, { error: `"${f.label}" is required` });
        return;
      }
    }

    // Validate JSON fields
    for (const f of endpoint.fields) {
      if (f.type === 'json' && state.values[f.name]?.trim()) {
        try {
          JSON.parse(state.values[f.name]);
        } catch {
          updateState(endpoint.id, { error: `"${f.label}" contains invalid JSON` });
          return;
        }
      }
    }

    updateState(endpoint.id, { loading: true, error: null, response: null, expanded: true });

    try {
      const req = endpoint.buildRequest(state.values);
      const result = await callProxy(req);
      updateState(endpoint.id, { loading: false, response: result, confirmText: '' });
      // Track _TEST_ orders created by individual runs
      if (endpoint.createsTestData && result.status >= 200 && result.status < 300) {
        try {
          const body = JSON.parse(state.values.body || '{}');
          const orderNo = body.orderNo || body.orders?.[0]?.orderNo;
          if (orderNo && typeof orderNo === 'string' && orderNo.startsWith(TEST_PREFIX)) {
            createdOrdersRef.current.add(orderNo);
          }
        } catch { /* ignore parse errors */ }
      }
    } catch (err: any) {
      updateState(endpoint.id, {
        loading: false,
        error: err.message || 'Network error',
        response: null,
        confirmText: '',
      });
    }
  }, [states, updateState]);

  const cleanupOrder = useCallback(async (orderNo: string) => {
    try {
      await callProxy({ endpoint: 'delete_order', method: 'POST', body: { orderNo } });
      createdOrdersRef.current.delete(orderNo);
    } catch { /* best effort */ }
  }, []);

  const copyResponse = useCallback((id: string) => {
    const resp = states[id]?.response;
    if (!resp) return;
    const text = typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body, null, 2);
    navigator.clipboard.writeText(text);
  }, [states]);

  // ── Run All Tests ──
  const runAllTests = useCallback(async () => {
    abortRef.current = false;
    setTestRunning(true);
    const today = new Date().toISOString().split('T')[0];
    const ts = Date.now();
    const orderA = `${TEST_PREFIX}${ts}`;
    const orderB = `${TEST_PREFIX}${ts}_B`;
    const orderC = `${TEST_PREFIX}${ts}_C`;

    const steps: TestStep[] = [
      { label: `create_order (${orderA})`, status: 'pending' },
      { label: `create_or_update_orders (${orderB})`, status: 'pending' },
      { label: 'get_orders (both)', status: 'pending' },
      { label: `search_orders (${today})`, status: 'pending' },
      { label: `get_scheduling_info (${orderA})`, status: 'pending' },
      { label: `get_completion_details (${orderA})`, status: 'pending' },
      { label: `update_completion_details (${orderA})`, status: 'pending' },
      { label: 'get_routes', status: 'pending' },
      { label: 'update_drivers_positions', status: 'pending' },
      { label: 'get_events', status: 'pending' },
      { label: 'find safe date...', status: 'pending' },
      { label: `create_order (${orderC}) on safe date`, status: 'pending' },
      { label: 'start_planning (safe date)', status: 'pending' },
      { label: 'get_planning_status', status: 'pending' },
      { label: 'stop_planning', status: 'pending' },
      { label: 'update_driver_parameters (safe date)', status: 'pending' },
      { label: 'update_drivers_parameters (safe date)', status: 'pending' },
      { label: `delete_order (${orderA})`, status: 'pending' },
      { label: `delete_orders (${orderB})`, status: 'pending' },
      { label: `delete_order (${orderC})`, status: 'pending' },
      { label: 'delete_all_orders (connectivity)', status: 'pending' },
    ];
    setTestSteps([...steps]);

    const update = (idx: number, patch: Partial<TestStep>) => {
      steps[idx] = { ...steps[idx], ...patch };
      setTestSteps([...steps]);
    };

    const run = async (idx: number, req: ProxyRequest): Promise<{ ok: boolean; body?: any }> => {
      if (abortRef.current) return { ok: false };
      update(idx, { status: 'running' });
      try {
        const result = await callProxy(req);
        const ok = result.status >= 200 && result.status < 300;
        update(idx, { status: ok ? 'pass' : 'fail', response: result });
        return { ok, body: result.body };
      } catch (err: any) {
        update(idx, { status: 'fail', error: err.message });
        return { ok: false };
      }
    };

    // Connectivity check — pass on ANY response, only fail on network error
    const runConnectivity = async (idx: number, req: ProxyRequest): Promise<void> => {
      if (abortRef.current) return;
      update(idx, { status: 'running' });
      try {
        const result = await callProxy(req);
        update(idx, { status: 'pass', response: result });
      } catch (err: any) {
        update(idx, { status: 'fail', error: err.message });
      }
    };

    // Helper: add days to today and return YYYY-MM-DD
    const addDays = (days: number) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };

    try {
      // 1. Create order A
      const { ok: createdA } = await run(0, {
        endpoint: 'create_order', method: 'POST',
        body: { operation: 'CREATE', orderNo: orderA, type: 'D', date: today,
          location: { address: '393 Hanover St, Boston, MA 02113, USA' }, duration: 20,
          notes: 'API Tester automated test' },
      });
      if (createdA) createdOrdersRef.current.add(orderA);

      // 2. Bulk create order B
      const { ok: createdB } = await run(1, {
        endpoint: 'create_or_update_orders', method: 'POST',
        body: { orders: [{ orderNo: orderB, date: today, duration: 15, type: 'D',
          location: { locationNo: 'TEST_LOC', address: '393 Hanover St, Boston, MA 02113, USA',
            latitude: 42.365142, longitude: -71.052882 } }] },
      });
      if (createdB) createdOrdersRef.current.add(orderB);

      // 3. Get both orders
      await run(2, {
        endpoint: 'get_orders', method: 'POST',
        body: { orders: [{ orderNo: orderA }, { orderNo: orderB }] },
      });

      // 4. Search orders
      await run(3, {
        endpoint: 'search_orders', method: 'POST',
        body: { dateRange: { from: today, to: today }, includeOrderData: true },
      });

      // 5. Scheduling info
      await run(4, {
        endpoint: 'get_scheduling_info', method: 'GET',
        params: { orderNo: orderA },
      });

      // 6. Completion details
      await run(5, {
        endpoint: 'get_completion_details', method: 'POST',
        body: { orders: [{ orderNo: orderA }] },
      });

      // 7. Update order completion
      await run(6, {
        endpoint: 'update_completion_details', method: 'POST',
        body: { updates: [{ orderNo: orderA, data: { status: 'success' } }] },
      });

      // 8. Get routes — extract driver externalId for GPS test
      const routesResult = await run(7, {
        endpoint: 'get_routes', method: 'GET',
        params: { date: today },
      });

      // 9. Update driver positions — use discovered driver or connectivity
      let driverId: string | null = null;
      try {
        const routes = routesResult.body?.routes || routesResult.body?.result || [];
        if (Array.isArray(routes) && routes.length > 0) {
          driverId = routes[0]?.driverExternalId || routes[0]?.driver?.externalId || null;
        }
      } catch { /* ignore */ }

      if (driverId) {
        await run(8, {
          endpoint: 'update_drivers_positions', method: 'POST',
          body: { updates: [{ driver: { externalId: driverId },
            positions: [{ timestamp: Math.floor(Date.now() / 1000),
              latitude: 42.365142, longitude: -71.052882, speed: 0, accuracy: 10 }] }] },
        });
      } else {
        await runConnectivity(8, {
          endpoint: 'update_drivers_positions', method: 'POST',
          body: { updates: [{ driver: { externalId: '_TEST_DUMMY' },
            positions: [{ timestamp: Math.floor(Date.now() / 1000),
              latitude: 42.365142, longitude: -71.052882, speed: 0, accuracy: 10 }] }] },
        });
      }

      // 10. Get events
      await run(9, { endpoint: 'get_events', method: 'GET' });

      // 11. Find safe date — search future dates until we find one with 0 orders
      update(10, { status: 'running' });
      let safeDate: string | null = null;
      try {
        for (let offset = 60; offset < 65; offset++) {
          const candidate = addDays(offset);
          const searchResult = await callProxy({
            endpoint: 'search_orders', method: 'POST',
            body: { dateRange: { from: candidate, to: candidate }, includeOrderData: false },
          });
          const orders = searchResult.body?.orders || [];
          if (searchResult.status >= 200 && searchResult.status < 300 && orders.length === 0) {
            safeDate = candidate;
            break;
          }
        }
        if (safeDate) {
          update(10, { status: 'pass', response: { status: 200, body: { safeDate }, durationMs: 0 } });
        } else {
          update(10, { status: 'fail', error: 'No empty date found in +60..+64 range' });
        }
      } catch (err: any) {
        update(10, { status: 'fail', error: err.message });
      }

      if (safeDate) {
        // Update labels with discovered date
        update(11, { label: `create_order (${orderC}) on ${safeDate}` });
        update(12, { label: `start_planning (${safeDate})` });
        update(15, { label: `update_driver_parameters (${safeDate})` });
        update(16, { label: `update_drivers_parameters (${safeDate})` });

        // 12. Create order C on safe date
        const { ok: createdC } = await run(11, {
          endpoint: 'create_order', method: 'POST',
          body: { operation: 'CREATE', orderNo: orderC, type: 'D', date: safeDate,
            location: { address: '393 Hanover St, Boston, MA 02113, USA' }, duration: 20,
            notes: 'API Tester planning test' },
        });
        if (createdC) createdOrdersRef.current.add(orderC);

        // 13. Start planning on safe date
        const planResult = await run(12, {
          endpoint: 'start_planning', method: 'POST',
          body: { date: safeDate },
        });

        // Extract planningId from response
        let planningId: string | null = null;
        try {
          planningId = String(planResult.body?.planningId || planResult.body?.id || '');
          if (!planningId || planningId === 'undefined') planningId = null;
        } catch { /* ignore */ }

        // 14. Get planning status
        if (planningId) {
          await run(13, {
            endpoint: 'get_planning_status', method: 'GET',
            params: { planningId },
          });
        } else {
          await runConnectivity(13, {
            endpoint: 'get_planning_status', method: 'GET',
            params: { planningId: '0' },
          });
        }

        // 15. Stop planning
        if (planningId) {
          await run(14, {
            endpoint: 'stop_planning', method: 'POST',
            body: { planningId: Number(planningId) },
          });
        } else {
          await runConnectivity(14, {
            endpoint: 'stop_planning', method: 'POST',
            body: { planningId: 0 },
          });
        }

        // 16. Update driver parameters (safe date — no routes to unschedule)
        if (driverId) {
          await run(15, {
            endpoint: 'update_driver_parameters', method: 'POST',
            body: { externalId: driverId, date: safeDate, workTimeFrom: '08:00', workTimeTo: '17:00' },
          });
        } else {
          await runConnectivity(15, {
            endpoint: 'update_driver_parameters', method: 'POST',
            body: { externalId: '_TEST_DUMMY', date: safeDate, workTimeFrom: '08:00', workTimeTo: '17:00' },
          });
        }

        // 17. Update drivers parameters (bulk, safe date)
        if (driverId) {
          await run(16, {
            endpoint: 'update_drivers_parameters', method: 'POST',
            body: { updates: [{ driver: { externalId: driverId }, date: safeDate,
              workTime: { from: '08:00', to: '17:00' } }] },
          });
        } else {
          await runConnectivity(16, {
            endpoint: 'update_drivers_parameters', method: 'POST',
            body: { updates: [{ driver: { externalId: '_TEST_DUMMY' }, date: safeDate,
              workTime: { from: '08:00', to: '17:00' } }] },
          });
        }
      } else {
        // No safe date found — fall back to connectivity checks
        update(11, { label: 'create_order (skipped — no safe date)' });
        await runConnectivity(11, {
          endpoint: 'create_order', method: 'POST',
          body: { operation: 'CREATE', orderNo: orderC, type: 'D', date: '2000-01-01',
            location: { address: 'Test' }, duration: 10 },
        });
        await runConnectivity(12, { endpoint: 'start_planning', method: 'POST', body: { date: '2000-01-01' } });
        await runConnectivity(13, { endpoint: 'get_planning_status', method: 'GET', params: { planningId: '0' } });
        await runConnectivity(14, { endpoint: 'stop_planning', method: 'POST', body: { planningId: 0 } });
        await runConnectivity(15, {
          endpoint: 'update_driver_parameters', method: 'POST',
          body: { externalId: '_TEST_DUMMY', date: '2000-01-01', workTimeFrom: '08:00', workTimeTo: '17:00' },
        });
        await runConnectivity(16, {
          endpoint: 'update_drivers_parameters', method: 'POST',
          body: { updates: [{ driver: { externalId: '_TEST_DUMMY' }, date: '2000-01-01',
            workTime: { from: '08:00', to: '17:00' } }] },
        });
      }
    } finally {
      // 18. Delete order A
      await run(17, { endpoint: 'delete_order', method: 'POST', body: { orderNo: orderA } });
      createdOrdersRef.current.delete(orderA);

      // 19. Bulk delete order B
      await run(18, { endpoint: 'delete_orders', method: 'POST', body: { orders: [{ orderNo: orderB }] } });
      createdOrdersRef.current.delete(orderB);

      // 20. Delete order C (safe-date order)
      await run(19, { endpoint: 'delete_order', method: 'POST', body: { orderNo: orderC } });
      createdOrdersRef.current.delete(orderC);

      // 21. delete_all_orders connectivity (safe dummy date)
      await runConnectivity(20, { endpoint: 'delete_all_orders', method: 'POST', body: { date: '2000-01-01' } });

      setTestRunning(false);
    }
  }, []);

  const filtered = ENDPOINTS.filter(ep => ep.category === activeCategory);

  const renderField = (endpoint: ApiTesterEndpoint, field: ApiTesterField) => {
    const state = states[endpoint.id];
    const value = state?.values[field.name] || '';

    if (field.type === 'json') {
      return (
        <div key={field.name}>
          <label className="block text-xs font-bold text-gray-500 mb-1">
            {field.label} {field.required && <span className="text-red-400">*</span>}
          </label>
          <textarea
            value={value}
            onChange={e => updateValue(endpoint.id, field.name, e.target.value)}
            rows={Math.min(12, Math.max(4, value.split('\n').length + 1))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
            placeholder={field.placeholder}
          />
        </div>
      );
    }

    return (
      <div key={field.name}>
        <label className="block text-xs font-bold text-gray-500 mb-1">
          {field.label} {field.required && <span className="text-red-400">*</span>}
        </label>
        <input
          type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={e => updateValue(endpoint.id, field.name, e.target.value)}
          placeholder={field.placeholder}
          className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>
    );
  };

  const getCreatedOrderNo = (endpoint: ApiTesterEndpoint, state: EndpointState): string | null => {
    if (!endpoint.createsTestData || !state.response) return null;
    try {
      const body = JSON.parse(state.values.body || '{}');
      const orderNo = body.orderNo || body.orders?.[0]?.orderNo;
      if (orderNo && typeof orderNo === 'string' && orderNo.startsWith(TEST_PREFIX)) {
        return orderNo;
      }
    } catch { /* ignore */ }
    return null;
  };

  const renderEndpoint = (endpoint: ApiTesterEndpoint) => {
    const state = states[endpoint.id];
    if (!state) return null;

    const needsConfirm = endpoint.destructive && state.confirmText !== 'DELETE';
    const createdOrderNo = getCreatedOrderNo(endpoint, state);

    return (
      <div key={endpoint.id} className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Header */}
        <button
          type="button"
          onClick={() => toggleExpanded(endpoint.id)}
          className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
        >
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${METHOD_COLORS[endpoint.method]}`}>
            {endpoint.method}
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-gray-800">{endpoint.label}</span>
            <span className="text-[10px] text-gray-400 ml-2 font-mono">{endpoint.optimoEndpoint}</span>
          </div>
          {state.response && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusColor(state.response.status)}`}>
              {state.response.status} &middot; {state.response.durationMs}ms
            </span>
          )}
          {state.loading && (
            <span className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${state.expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Expanded body */}
        {state.expanded && (
          <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50 space-y-3">
            <p className="text-xs text-gray-500 pt-3">{endpoint.description}</p>

            {/* Fields */}
            {endpoint.fields.length > 0 && (
              <div className="space-y-2">
                {endpoint.fields.map(f => renderField(endpoint, f))}
              </div>
            )}

            {/* Destructive confirmation */}
            {endpoint.destructive && (
              <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                <span className="text-xs text-red-600 font-semibold">Type DELETE to confirm:</span>
                <input
                  type="text"
                  value={state.confirmText}
                  onChange={e => updateState(endpoint.id, { confirmText: e.target.value })}
                  className="px-2 py-1 border border-red-300 rounded text-xs w-24 focus:outline-none focus:ring-2 focus:ring-red-400"
                  placeholder="DELETE"
                />
              </div>
            )}

            {/* Error */}
            {state.error && (
              <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {state.error}
              </div>
            )}

            {/* Run / Clean Up buttons */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={endpoint.destructive ? 'secondary' : 'primary'}
                onClick={() => runEndpoint(endpoint)}
                disabled={state.loading || (endpoint.destructive ? needsConfirm : false)}
              >
                {state.loading ? 'Running...' : 'Run'}
              </Button>
              {state.response && (
                <Button size="sm" variant="ghost" onClick={() => copyResponse(endpoint.id)}>
                  Copy
                </Button>
              )}
              {createdOrderNo && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await cleanupOrder(createdOrderNo);
                    updateState(endpoint.id, {
                      response: { status: 200, body: { cleaned: true, orderNo: createdOrderNo }, durationMs: 0 },
                    });
                  }}
                >
                  Clean Up ({createdOrderNo})
                </Button>
              )}
            </div>

            {/* Response */}
            {state.response && (
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-100 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusColor(state.response.status)}`}>
                      {state.response.status || 'ERR'}
                    </span>
                    <span className="text-[10px] text-gray-400">{state.response.durationMs}ms</span>
                  </div>
                </div>
                <pre className="p-3 text-xs font-mono text-gray-700 overflow-x-auto overflow-y-auto max-h-96 whitespace-pre-wrap break-words">
                  {typeof state.response.body === 'string'
                    ? state.response.body
                    : JSON.stringify(state.response.body, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const stepStatusIcon = (status: TestStep['status']) => {
    switch (status) {
      case 'pending': return <span className="w-4 h-4 rounded-full border-2 border-gray-300 inline-block" />;
      case 'running': return <span className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin inline-block" />;
      case 'pass': return <span className="w-4 h-4 rounded-full bg-green-500 inline-flex items-center justify-center text-white text-[10px] font-bold">&check;</span>;
      case 'fail': return <span className="w-4 h-4 rounded-full bg-red-500 inline-flex items-center justify-center text-white text-[10px] font-bold">&times;</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Run All Tests */}
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-bold text-gray-800">Run All Tests</p>
            <p className="text-xs text-gray-500">Tests all 18 endpoints — creates test orders, auto-discovers a safe date for planning tests, then cleans up</p>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={runAllTests}
            disabled={testRunning}
          >
            {testRunning ? 'Running...' : 'Run All'}
          </Button>
        </div>

        {testSteps.length > 0 && (
          <div className="space-y-1 mt-3">
            {testSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                {stepStatusIcon(step.status)}
                <span className={`text-xs font-mono ${step.status === 'fail' ? 'text-red-600' : step.status === 'pass' ? 'text-green-700' : 'text-gray-600'}`}>
                  {step.label}
                </span>
                {step.response && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusColor(step.response.status)}`}>
                    {step.response.status} &middot; {step.response.durationMs}ms
                  </span>
                )}
                {step.error && (
                  <span className="text-[10px] text-red-500">{step.error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              activeCategory === cat.id
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Endpoint list */}
      <div className="space-y-2">
        {filtered.map(renderEndpoint)}
      </div>
    </div>
  );
};

export default OptimoRouteApiTester;
