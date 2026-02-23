import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LoadingSpinner } from '../ui/index.ts';

interface RouteStop {
  stopNumber?: number;
  orderNo: string;
  id?: string;
  locationName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  scheduledAt?: string;
  scheduledAtDt?: string;
  travelTime?: number;
  distance?: number;
  type?: string;
  location?: { address?: string; locationName?: string };
}

interface Route {
  driverSerial?: string;
  driverName?: string;
  driverExternalId?: string;
  vehicleLabel?: string;
  vehicleRegistration?: string;
  duration?: number;
  distance?: number;
  load1?: number;
  stops?: RouteStop[];
}

interface DriverEvent {
  event: string;
  localTime: string;
  driverName?: string;
  driverSerial?: string;
  orderNo?: string;
}

interface CompletionData {
  status?: string;
  startTime?: { localTime?: string };
  endTime?: { localTime?: string };
  form?: {
    note?: string;
    signature?: { type: string; url: string };
    images?: { type: string; url: string }[];
  };
  tracking_url?: string;
}

const STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  on_route: 'bg-blue-100 text-blue-700',
  servicing: 'bg-yellow-100 text-yellow-700',
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  rejected: 'bg-red-100 text-red-600',
  scheduled: 'bg-gray-100 text-gray-600',
};

interface ConnectionStatus {
  success: boolean;
  message?: string;
  error?: string;
  date?: string;
  routeCount?: number;
  drivers?: { serial: string; name: string }[];
  locations?: { address: string; name?: string }[];
}

const RoutesView: React.FC = () => {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);
  const [events, setEvents] = useState<DriverEvent[]>([]);
  const [driverStatuses, setDriverStatuses] = useState<Record<string, string>>({});
  const [stopStatuses, setStopStatuses] = useState<Record<string, string>>({});
  const [completionModal, setCompletionModal] = useState<{ orderNo: string; data: CompletionData | null; loading: boolean } | null>(null);
  const [showOptimizer, setShowOptimizer] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const afterTagRef = useRef<string>('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const testConnection = useCallback(async () => {
    setTestingConnection(true);
    try {
      const res = await fetch('/api/admin/optimoroute/test-connection', { credentials: 'include' });
      const data = await res.json();
      setConnectionStatus(data);
    } catch {
      setConnectionStatus({ success: false, error: 'Network error — could not reach server' });
    } finally {
      setTestingConnection(false);
    }
  }, []);

  useEffect(() => { testConnection(); }, [testConnection]);

  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/optimoroute/routes?date=${date}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRoutes(data.routes || []);
      }
    } catch (e) {
      console.error('Failed to fetch routes:', e);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  // Event polling
  useEffect(() => {
    const pollEvents = async () => {
      try {
        const url = `/api/admin/optimoroute/events${afterTagRef.current ? `?afterTag=${afterTagRef.current}` : ''}`;
        const res = await fetch(url, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.tag) afterTagRef.current = data.tag;
          if (data.events?.length > 0) {
            setEvents(prev => [...prev, ...data.events].slice(-200));
            // Update statuses from events
            for (const evt of data.events) {
              if (evt.driverSerial) {
                if (evt.event === 'start_route' || evt.event === 'on_duty') {
                  setDriverStatuses(prev => ({ ...prev, [evt.driverSerial!]: 'in_progress' }));
                } else if (evt.event === 'end_route' || evt.event === 'off_duty') {
                  setDriverStatuses(prev => ({ ...prev, [evt.driverSerial!]: 'completed' }));
                }
              }
              if (evt.orderNo) {
                setStopStatuses(prev => ({ ...prev, [evt.orderNo!]: evt.event }));
              }
            }
          }
        }
      } catch {}
    };

    pollEvents();
    pollingRef.current = setInterval(pollEvents, 15000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const fetchCompletion = async (orderNo: string) => {
    setCompletionModal({ orderNo, data: null, loading: true });
    try {
      const res = await fetch(`/api/admin/optimoroute/completion?orderNos=${orderNo}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const order = data.orders?.find((o: any) => o.orderNo === orderNo || o.success);
        setCompletionModal({ orderNo, data: order?.data || null, loading: false });
      } else {
        setCompletionModal({ orderNo, data: null, loading: false });
      }
    } catch {
      setCompletionModal({ orderNo, data: null, loading: false });
    }
  };

  const totalStops = routes.reduce((sum, r) => sum + (r.stops?.length || 0), 0);
  const totalDistance = routes.reduce((sum, r) => sum + (r.distance || 0), 0);
  const totalDuration = routes.reduce((sum, r) => sum + (r.duration || 0), 0);

  const getStopAddress = (stop: RouteStop) => stop.address || stop.location?.address || stop.locationName || stop.location?.locationName || 'Unknown';
  const getStopStatus = (stop: RouteStop) => stopStatuses[stop.orderNo] || 'scheduled';

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      {connectionStatus && (
        <div className={`rounded-lg border p-3 ${connectionStatus.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${connectionStatus.success ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className={`text-sm font-bold ${connectionStatus.success ? 'text-green-700' : 'text-red-700'}`}>
                {connectionStatus.success ? 'OptimoRoute Connected' : 'OptimoRoute Disconnected'}
              </span>
              {connectionStatus.success && (
                <span className="text-xs text-green-600">
                  — {connectionStatus.routeCount} route{connectionStatus.routeCount !== 1 ? 's' : ''} today, {connectionStatus.drivers?.length || 0} driver{(connectionStatus.drivers?.length || 0) !== 1 ? 's' : ''}, {connectionStatus.locations?.length || 0} location{(connectionStatus.locations?.length || 0) !== 1 ? 's' : ''}
                </span>
              )}
              {!connectionStatus.success && (
                <span className="text-xs text-red-600">{connectionStatus.error}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {connectionStatus.success && (connectionStatus.drivers?.length || 0) > 0 && (
                <button
                  onClick={() => setShowConnectionDetails(!showConnectionDetails)}
                  className="text-xs font-bold text-green-700 hover:text-green-900 transition-colors"
                >
                  {showConnectionDetails ? 'Hide Details' : 'Show Details'}
                </button>
              )}
              <button
                onClick={testConnection}
                disabled={testingConnection}
                className="text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors"
              >
                {testingConnection ? 'Testing...' : 'Retest'}
              </button>
            </div>
          </div>

          {showConnectionDetails && connectionStatus.success && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {(connectionStatus.drivers?.length || 0) > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase text-green-600 mb-1">Drivers ({connectionStatus.drivers!.length})</p>
                  <div className="bg-white rounded-lg border border-green-100 divide-y divide-green-50">
                    {connectionStatus.drivers!.map(d => (
                      <div key={d.serial} className="px-3 py-1.5 flex justify-between">
                        <span className="text-xs font-bold text-gray-900">{d.name}</span>
                        <span className="text-xs text-gray-400 font-mono">{d.serial}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(connectionStatus.locations?.length || 0) > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase text-green-600 mb-1">Locations ({connectionStatus.locations!.length})</p>
                  <div className="bg-white rounded-lg border border-green-100 divide-y divide-green-50 max-h-48 overflow-y-auto">
                    {connectionStatus.locations!.map((loc, i) => (
                      <div key={i} className="px-3 py-1.5">
                        <span className="text-xs text-gray-900">{loc.address}</span>
                        {loc.name && loc.name !== loc.address && (
                          <span className="text-xs text-gray-400 ml-1">({loc.name})</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
        />
        <button
          onClick={() => setDate(new Date().toISOString().split('T')[0])}
          className="px-3 py-2 text-sm font-bold text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
        >
          Today
        </button>
        <button
          onClick={() => setShowOptimizer(true)}
          className="px-4 py-2 text-sm font-bold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
        >
          Plan Routes
        </button>
        <button
          onClick={fetchRoutes}
          className="px-3 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Routes', value: routes.length },
          { label: 'Total Stops', value: totalStops },
          { label: 'Total Distance', value: `${totalDistance.toFixed(1)} km` },
          { label: 'Total Duration', value: formatDuration(totalDuration) },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{stat.label}</p>
            <p className="text-xl font-black text-gray-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Routes list */}
      {routes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-400 font-bold">No routes found for {date}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map((route, idx) => {
            const serial = route.driverSerial || `route-${idx}`;
            const isExpanded = expandedDriver === serial;
            const driverStatus = driverStatuses[serial] || 'not_started';
            const completedStops = (route.stops || []).filter(s => getStopStatus(s) === 'success').length;

            return (
              <div key={serial} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setExpandedDriver(isExpanded ? null : serial)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-black text-gray-900">{route.driverName || `Driver ${serial}`}</span>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[driverStatus]}`}>
                        {driverStatus.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                      {route.vehicleLabel && <span>Vehicle: {route.vehicleLabel}</span>}
                      <span>{route.stops?.length || 0} stops</span>
                      {route.duration != null && <span>{formatDuration(route.duration)}</span>}
                      {route.distance != null && <span>{route.distance.toFixed(1)} km</span>}
                      <span>{completedStops}/{route.stops?.length || 0} completed</span>
                    </div>
                  </div>
                  <svg className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400">#</th>
                          <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400">Address</th>
                          <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400">Scheduled</th>
                          <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400">Order</th>
                          <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400">Status</th>
                          <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(route.stops || []).map((stop, sIdx) => {
                          const status = getStopStatus(stop);
                          const isBreak = stop.type === 'break' || stop.type === 'depot';
                          return (
                            <tr key={stop.orderNo || sIdx} className={`border-t border-gray-50 ${isBreak ? 'bg-gray-50/50' : ''}`}>
                              <td className="px-4 py-2 text-gray-400 font-bold">{stop.stopNumber || sIdx + 1}</td>
                              <td className="px-4 py-2 text-gray-900 max-w-[250px] truncate">
                                {isBreak ? <span className="italic text-gray-400">{stop.type === 'break' ? 'Break' : 'Depot'}</span> : getStopAddress(stop)}
                              </td>
                              <td className="px-4 py-2 text-gray-600">{stop.scheduledAt || '—'}</td>
                              <td className="px-4 py-2 text-gray-500 font-mono text-xs">{stop.orderNo || '—'}</td>
                              <td className="px-4 py-2">
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[status] || STATUS_COLORS.scheduled}`}>
                                  {status}
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                {!isBreak && stop.orderNo && (
                                  <button
                                    onClick={() => fetchCompletion(stop.orderNo)}
                                    className="text-xs font-bold text-teal-600 hover:text-teal-800"
                                  >
                                    Details
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Recent events */}
      {events.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-xs font-black uppercase text-gray-400 mb-3">Live Events</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {events.slice(-20).reverse().map((evt, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-600 py-1">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${evt.event === 'success' ? 'bg-green-500' : evt.event === 'failed' ? 'bg-red-500' : 'bg-blue-500'}`} />
                <span className="text-gray-400">{new Date(evt.localTime).toLocaleTimeString()}</span>
                <span className="font-bold">{evt.driverName || 'Unknown'}</span>
                <span>{evt.event.replace(/_/g, ' ')}</span>
                {evt.orderNo && <span className="text-gray-400 font-mono">{evt.orderNo}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completion detail modal */}
      {completionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setCompletionModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-gray-900">Completion Details</h2>
              <button onClick={() => setCompletionModal(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {completionModal.loading ? (
              <LoadingSpinner />
            ) : completionModal.data ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400">Order:</span>
                  <span className="font-mono text-sm">{completionModal.orderNo}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400">Status:</span>
                  <span className={`text-xs font-black uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[completionModal.data.status || ''] || 'bg-gray-100 text-gray-600'}`}>
                    {completionModal.data.status || 'Unknown'}
                  </span>
                </div>
                {completionModal.data.startTime && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400">Start:</span>
                    <span className="text-sm">{completionModal.data.startTime.localTime || '—'}</span>
                  </div>
                )}
                {completionModal.data.endTime && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400">End:</span>
                    <span className="text-sm">{completionModal.data.endTime.localTime || '—'}</span>
                  </div>
                )}
                {completionModal.data.tracking_url && (
                  <a href={completionModal.data.tracking_url} target="_blank" rel="noopener noreferrer" className="text-sm text-teal-600 hover:underline">
                    View Tracking
                  </a>
                )}

                {/* Proof of Delivery */}
                {completionModal.data.form && (
                  <div className="border-t border-gray-100 pt-4 space-y-3">
                    <h3 className="text-xs font-black uppercase text-gray-400">Proof of Delivery</h3>
                    {completionModal.data.form.note && (
                      <div>
                        <span className="text-xs font-bold text-gray-400">Note:</span>
                        <p className="text-sm text-gray-700 mt-1">{completionModal.data.form.note}</p>
                      </div>
                    )}
                    {completionModal.data.form.signature && (
                      <div>
                        <span className="text-xs font-bold text-gray-400">Signature:</span>
                        <img src={completionModal.data.form.signature.url} alt="Signature" className="mt-1 max-h-24 border border-gray-200 rounded-lg" />
                      </div>
                    )}
                    {completionModal.data.form.images && completionModal.data.form.images.length > 0 && (
                      <div>
                        <span className="text-xs font-bold text-gray-400">Photos:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {completionModal.data.form.images.map((img, i) => (
                            <a key={i} href={img.url} target="_blank" rel="noopener noreferrer">
                              <img src={img.url} alt={`Photo ${i + 1}`} className="w-24 h-24 object-cover rounded-lg border border-gray-200" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-400 text-sm text-center py-4">No completion data available</p>
            )}
          </div>
        </div>
      )}

      {/* Route Optimizer modal */}
      {showOptimizer && <RouteOptimizer date={date} onClose={() => setShowOptimizer(false)} onComplete={fetchRoutes} />}
    </div>
  );
};

// ── Route Optimizer Component ──

const RouteOptimizer: React.FC<{ date: string; onClose: () => void; onComplete: () => void }> = ({ date, onClose, onComplete }) => {
  const [planDate, setPlanDate] = useState(date);
  const [balancing, setBalancing] = useState<'OFF' | 'ON' | 'ON_FORCE'>('OFF');
  const [balanceBy, setBalanceBy] = useState<'WT' | 'NUM'>('WT');
  const [startWith, setStartWith] = useState<'EMPTY' | 'CURRENT'>('EMPTY');
  const [clustering, setClustering] = useState(false);
  const [running, setRunning] = useState(false);
  const [planningId, setPlanningId] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPlanning = async () => {
    setRunning(true);
    setError('');
    setStatus('Starting...');
    try {
      const res = await fetch('/api/admin/optimoroute/planning/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date: planDate, balancing, balanceBy, startWith, clustering }),
      });
      const data = await res.json();
      if (data.success && data.planningId) {
        setPlanningId(data.planningId);
        setStatus('Running');
        // Start polling
        pollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/admin/optimoroute/planning/status?planningId=${data.planningId}`, { credentials: 'include' });
            const statusData = await statusRes.json();
            setProgress(statusData.percentageComplete || 0);
            if (statusData.status === 'F') {
              setStatus('Finished');
              setRunning(false);
              if (pollRef.current) clearInterval(pollRef.current);
              onComplete();
            } else if (statusData.status === 'E') {
              setStatus('Error');
              setError('Optimization failed');
              setRunning(false);
              if (pollRef.current) clearInterval(pollRef.current);
            } else if (statusData.status === 'C') {
              setStatus('Cancelled');
              setRunning(false);
              if (pollRef.current) clearInterval(pollRef.current);
            }
          } catch {}
        }, 2000);
      } else {
        setError(data.code || 'Failed to start planning');
        setRunning(false);
      }
    } catch {
      setError('Failed to start planning');
      setRunning(false);
    }
  };

  const stopPlanning = async () => {
    if (!planningId) return;
    try {
      await fetch('/api/admin/optimoroute/planning/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ planningId }),
      });
      setStatus('Stopping...');
    } catch {}
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-black text-gray-900 mb-4">Route Optimization</h2>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Date</label>
            <input type="date" value={planDate} onChange={e => setPlanDate(e.target.value)} disabled={running}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Balancing</label>
            <select value={balancing} onChange={e => setBalancing(e.target.value as any)} disabled={running}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50">
              <option value="OFF">Off — Best routes</option>
              <option value="ON">On — Balance workload</option>
              <option value="ON_FORCE">Force — Use all drivers</option>
            </select>
          </div>

          {balancing !== 'OFF' && (
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Balance By</label>
              <select value={balanceBy} onChange={e => setBalanceBy(e.target.value as any)} disabled={running}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50">
                <option value="WT">Working Time</option>
                <option value="NUM">Number of Orders</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Start With</label>
            <select value={startWith} onChange={e => setStartWith(e.target.value as any)} disabled={running}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50">
              <option value="EMPTY">Empty — Fresh routes</option>
              <option value="CURRENT">Current — Keep existing routes</option>
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={clustering} onChange={e => setClustering(e.target.checked)} disabled={running}
              className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
            <span className="text-sm font-medium text-gray-700">Clustering (minimize route overlap)</span>
          </label>

          {/* Progress */}
          {running && (
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-gray-500 mb-1">
                <span>{status}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-teal-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {status === 'Finished' && (
            <p className="text-sm text-green-600 font-bold text-center">Optimization complete! Routes have been refreshed.</p>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
            Close
          </button>
          {running ? (
            <button onClick={stopPlanning} className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">
              Stop
            </button>
          ) : status !== 'Finished' ? (
            <button onClick={startPlanning} className="px-4 py-2 text-sm font-bold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors">
              Start Optimization
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default RoutesView;
