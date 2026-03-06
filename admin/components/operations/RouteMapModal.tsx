import React, { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import { decodePolyline } from '../../../shared/utils/polyline.ts';

// Distinct colors for up to 8 driver routes
const ROUTE_COLORS = ['#0D9488', '#7C3AED', '#DC2626', '#D97706', '#2563EB', '#DB2777', '#059669', '#9333EA'];

interface RouteMapModalProps {
  date: string;
  onClose: () => void;
}

interface OptimoRoute {
  driverName?: string;
  driverSerial?: string;
  routePolyline?: string;
  stops?: Array<{
    orderNo?: string;
    locationName?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    stopNumber?: number;
    type?: string;
    location?: { address?: string; latitude?: number; longitude?: number };
  }>;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      map.fitBounds(points, { padding: [40, 40] });
    }
  }, [map, points]);
  return null;
}

const RouteMapModal: React.FC<RouteMapModalProps> = ({ date, onClose }) => {
  const [routes, setRoutes] = useState<OptimoRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(
          `/api/admin/optimoroute/routes?date=${date}&includeRoutePolyline=true&includeRouteStartEnd=true`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error('Failed to fetch routes');
        const data = await res.json();
        setRoutes(data.routes || []);
      } catch (e: any) {
        setError(e.message || 'Failed to load route map');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [date]);

  // Collect all decoded points for fitBounds
  const allPoints: [number, number][] = [];
  const routeLines: { points: [number, number][]; color: string; name: string }[] = [];

  routes.forEach((route, i) => {
    const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
    const name = route.driverName || route.driverSerial || `Route ${i + 1}`;
    if (route.routePolyline) {
      const pts = decodePolyline(route.routePolyline);
      allPoints.push(...pts);
      routeLines.push({ points: pts, color, name });
    } else {
      // Fall back to connecting stop coordinates if no polyline
      const pts: [number, number][] = (route.stops || [])
        .filter(s => s.type !== 'break' && s.type !== 'depot')
        .map(s => {
          const lat = s.latitude ?? s.location?.latitude;
          const lng = s.longitude ?? s.location?.longitude;
          return lat != null && lng != null ? [lat, lng] as [number, number] : null;
        })
        .filter((p): p is [number, number] => p !== null);
      if (pts.length > 0) {
        allPoints.push(...pts);
        routeLines.push({ points: pts, color, name });
      }
    }
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden" style={{ height: '80vh' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h2 className="text-base font-black text-gray-900">Route Map</h2>
            <p className="text-xs text-gray-400">{date} · {routes.length} driver{routes.length !== 1 ? 's' : ''}</p>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-3 mr-4">
            {routeLines.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-4 h-1.5 rounded-full" style={{ backgroundColor: r.color }} />
                <span className="text-xs font-bold text-gray-600 max-w-[80px] truncate">{r.name}</span>
              </div>
            ))}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Map body */}
        <div className="relative" style={{ height: 'calc(80vh - 57px)' }}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm text-gray-400 font-bold">Loading route data...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm text-red-500 font-bold">{error}</div>
            </div>
          ) : routeLines.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm text-gray-400 font-bold">No route data available for this date</div>
            </div>
          ) : (
            <MapContainer
              center={allPoints[0] ?? [39.8283, -98.5795]}
              zoom={10}
              style={{ height: '100%', width: '100%' }}
              zoomControl={true}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />

              <FitBounds points={allPoints} />

              {/* Route polylines */}
              {routeLines.map((r, i) => (
                <Polyline key={i} positions={r.points} color={r.color} weight={4} opacity={0.85} />
              ))}

              {/* Stop markers */}
              {routes.map((route, ri) => {
                const color = ROUTE_COLORS[ri % ROUTE_COLORS.length];
                return (route.stops || [])
                  .filter(s => s.type !== 'break' && s.type !== 'depot')
                  .map((stop, si) => {
                    const lat = stop.latitude ?? stop.location?.latitude;
                    const lng = stop.longitude ?? stop.location?.longitude;
                    if (lat == null || lng == null) return null;
                    const addr = stop.address ?? stop.location?.address ?? '';
                    return (
                      <CircleMarker key={`${ri}-${si}`} center={[lat, lng]} radius={6}
                        pathOptions={{ color, fillColor: color, fillOpacity: 1, weight: 2 }}>
                        <Popup>
                          <div className="text-xs">
                            <div className="font-bold">{stop.stopNumber != null ? `#${stop.stopNumber} ` : ''}{stop.locationName || ''}</div>
                            <div className="text-gray-600">{addr}</div>
                            <div className="text-gray-400 mt-0.5">{route.driverName}</div>
                          </div>
                        </Popup>
                      </CircleMarker>
                    );
                  });
              })}
            </MapContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default RouteMapModal;
