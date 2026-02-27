import React, { useState, useEffect, useRef } from 'react';

interface DriverEvent {
  event: string;
  localTime: string;
  driverName?: string;
  driverSerial?: string;
  orderNo?: string;
  orderId?: string;
}

interface LiveEventsPanelProps {
  onStatusUpdate?: (driverStatuses: Record<string, string>, stopStatuses: Record<string, string>) => void;
}

const LiveEventsPanel: React.FC<LiveEventsPanelProps> = ({ onStatusUpdate }) => {
  const [events, setEvents] = useState<DriverEvent[]>([]);
  const [collapsed, setCollapsed] = useState(true);
  const afterTagRef = useRef<string>('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const driverStatusesRef = useRef<Record<string, string>>({});
  const stopStatusesRef = useRef<Record<string, string>>({});

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

  if (events.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <button type="button" onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between">
        <h3 className="text-xs font-black uppercase text-gray-400">Live Events ({events.length})</h3>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {!collapsed && (
        <div className="space-y-1 max-h-48 overflow-y-auto mt-3">
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
      )}
    </div>
  );
};

export default LiveEventsPanel;
