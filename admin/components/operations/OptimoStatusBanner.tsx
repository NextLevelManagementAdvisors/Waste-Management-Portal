import React, { useState, useEffect, useCallback, useRef } from 'react';

interface ConnectionStatus {
  success: boolean;
  message?: string;
  error?: string;
  date?: string;
  routeCount?: number;
  drivers?: { serial: string; name: string }[];
  locations?: { address: string; name?: string }[];
}

interface DriverEvent {
  event: string;
  localTime: string;
  driverName?: string;
  driverSerial?: string;
  orderNo?: string;
  orderId?: string;
}

interface OptimoStatusBannerProps {
  onStatusUpdate?: (driverStatuses: Record<string, string>, stopStatuses: Record<string, string>) => void;
}

const OptimoStatusBanner: React.FC<OptimoStatusBannerProps> = ({ onStatusUpdate }) => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Live events state
  const [events, setEvents] = useState<DriverEvent[]>([]);
  const [showEvents, setShowEvents] = useState(false);
  const afterTagRef = useRef<string>('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const driverStatusesRef = useRef<Record<string, string>>({});
  const stopStatusesRef = useRef<Record<string, string>>({});

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

  // Live event polling
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

            let driverChanged = false;
            let stopChanged = false;

            for (const evt of data.events) {
              const driverKey = evt.driverName || evt.driverSerial;
              if (driverKey) {
                let newStatus: string | null = null;
                if (evt.event === 'start_route' || evt.event === 'on_duty') {
                  newStatus = 'in_progress';
                } else if (evt.event === 'end_route' || evt.event === 'off_duty') {
                  newStatus = 'completed';
                } else if (['start_service', 'success', 'failed', 'rejected'].includes(evt.event)) {
                  if (driverStatusesRef.current[driverKey] !== 'completed') newStatus = 'in_progress';
                }
                if (newStatus && driverStatusesRef.current[driverKey] !== newStatus) {
                  driverStatusesRef.current = { ...driverStatusesRef.current, [driverKey]: newStatus };
                  driverChanged = true;
                }
              }
              const stopKey = evt.orderId || evt.orderNo;
              if (stopKey && stopStatusesRef.current[stopKey] !== evt.event) {
                stopStatusesRef.current = { ...stopStatusesRef.current, [stopKey]: evt.event };
                stopChanged = true;
              }
            }

            if ((driverChanged || stopChanged) && onStatusUpdate) {
              onStatusUpdate(driverStatusesRef.current, stopStatusesRef.current);
            }
          }
        }
      } catch (e) {
        console.error('Event polling failed:', e);
      }
    };

    pollEvents();
    pollingRef.current = setInterval(pollEvents, 15000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [onStatusUpdate]);

  if (!connectionStatus) return null;

  return (
    <div className={`rounded-lg border p-3 ${connectionStatus.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${connectionStatus.success ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
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
          {events.length > 0 && (
            <button onClick={() => setShowEvents(!showEvents)}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              {showEvents ? 'Hide Live' : `Live (${events.length})`}
            </button>
          )}
          {connectionStatus.success && (connectionStatus.drivers?.length || 0) > 0 && (
            <button onClick={() => setShowDetails(!showDetails)}
              className="text-xs font-bold text-green-700 hover:text-green-900 transition-colors">
              {showDetails ? 'Hide Details' : 'Show Details'}
            </button>
          )}
          <button onClick={testConnection} disabled={testingConnection}
            className="text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors">
            {testingConnection ? 'Testing...' : 'Retest'}
          </button>
        </div>
      </div>

      {/* Live Events */}
      {showEvents && events.length > 0 && (
        <div className="mt-3 bg-white rounded-lg border border-blue-100 p-2">
          <p className="text-[10px] font-black uppercase text-blue-500 mb-1">Live Events</p>
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {events.slice(-20).reverse().map((evt, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-600 py-0.5">
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

      {/* Connection Details */}
      {showDetails && connectionStatus.success && (
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
  );
};

export default OptimoStatusBanner;
