import React, { useState, useEffect, useCallback, useMemo } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Button } from '../../components/Button.tsx';

// @ts-ignore
delete (L.Icon.Default.prototype as any)._getIconUrl;

interface AvailableLocation {
  id: string;
  address: string;
  service_type: string;
  pickup_day: string | null;
  pickup_frequency: string | null;
  latitude: number;
  longitude: number;
  customer_name: string;
  zone_name: string | null;
  zone_color: string | null;
  claimed_by_driver_id: string | null;
  claimed_by_driver_name: string | null;
  claim_status: string | null;
  is_mine: boolean;
  distance_miles: number;
  matching_zone_name: string;
}

interface ClaimedLocation {
  id: string;
  property_id: string;
  address: string;
  service_type: string;
  pickup_day: string | null;
  pickup_frequency: string | null;
  customer_name: string;
  zone_name: string | null;
  zone_color: string | null;
}

const FitBounds: React.FC<{ points: [number, number][] }> = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng)));
    map.fitBounds(bounds.pad(0.3));
  }, [map, points]);
  return null;
};

const AvailableLocations: React.FC = () => {
  const [tab, setTab] = useState<'available' | 'claimed'>('available');
  const [available, setAvailable] = useState<AvailableLocation[]>([]);
  const [claimed, setClaimed] = useState<ClaimedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [availRes, claimedRes] = await Promise.all([
        fetch('/api/team/available-locations', { credentials: 'include' }),
        fetch('/api/team/my-locations', { credentials: 'include' }),
      ]);
      if (availRes.ok) { const d = await availRes.json(); setAvailable(d.data || []); }
      if (claimedRes.ok) { const d = await claimedRes.json(); setClaimed(d.data || []); }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const claimLocation = useCallback(async (propertyId: string) => {
    setActionId(propertyId);
    try {
      const res = await fetch(`/api/team/locations/${propertyId}/claim`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await loadData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to claim location');
      }
    } catch {
      alert('Failed to claim location');
    } finally {
      setActionId(null);
    }
  }, [loadData]);

  const releaseLocation = useCallback(async (propertyId: string) => {
    setActionId(propertyId);
    try {
      const res = await fetch(`/api/team/locations/${propertyId}/claim`, {
        method: 'DELETE', credentials: 'include',
      });
      if (res.ok) {
        await loadData();
      } else {
        alert('Failed to release location');
      }
    } catch {
      alert('Failed to release location');
    } finally {
      setActionId(null);
    }
  }, [loadData]);

  const mapPoints = useMemo(() => {
    return available
      .filter(l => l.latitude && l.longitude)
      .map(l => [l.latitude, l.longitude] as [number, number]);
  }, [available]);

  const defaultCenter: [number, number] = [38.85, -78.2];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
      </div>
    );
  }

  const getMarkerColor = (loc: AvailableLocation) => {
    if (loc.is_mine) return '#3B82F6'; // blue - mine
    if (loc.claimed_by_driver_id) return '#F97316'; // orange - other driver
    return '#10B981'; // green - unclaimed
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Locations</h2>
        <p className="text-sm text-gray-500">
          Claim locations in your zones as ongoing territory.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setTab('available')}
          className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'available' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Available ({available.length})
        </button>
        <button
          onClick={() => setTab('claimed')}
          className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'claimed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          My Claimed ({claimed.length})
        </button>
      </div>

      {tab === 'available' && (
        <>
          {/* Map */}
          {available.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden" style={{ height: '45vh', minHeight: 300 }}>
              <MapContainer
                center={defaultCenter}
                zoom={10}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {mapPoints.length > 0 && <FitBounds points={mapPoints} />}

                {available.filter(l => l.latitude && l.longitude).map(loc => (
                  <CircleMarker
                    key={loc.id}
                    center={[loc.latitude, loc.longitude]}
                    radius={8}
                    pathOptions={{
                      color: getMarkerColor(loc),
                      fillColor: getMarkerColor(loc),
                      fillOpacity: 0.7,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <div className="min-w-[180px]">
                        <div className="font-bold text-sm">{loc.address}</div>
                        <div className="text-xs text-gray-500 mt-1">{loc.customer_name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {loc.service_type} &bull; {loc.pickup_day || 'No day'} &bull; {loc.pickup_frequency || 'weekly'}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Zone: {loc.matching_zone_name} &bull; {loc.distance_miles.toFixed(1)} mi
                        </div>
                        {loc.claimed_by_driver_id && !loc.is_mine && (
                          <div className="text-xs text-orange-600 font-medium mt-1">
                            Claimed by {loc.claimed_by_driver_name}
                          </div>
                        )}
                        <div className="mt-2">
                          {loc.is_mine ? (
                            <button
                              onClick={() => releaseLocation(loc.id)}
                              disabled={actionId === loc.id}
                              className="px-3 py-1 rounded text-xs font-bold bg-red-100 text-red-700"
                            >
                              {actionId === loc.id ? '...' : 'Release'}
                            </button>
                          ) : !loc.claimed_by_driver_id ? (
                            <button
                              onClick={() => claimLocation(loc.id)}
                              disabled={actionId === loc.id}
                              className="px-3 py-1 rounded text-xs font-bold bg-teal-100 text-teal-700"
                            >
                              {actionId === loc.id ? '...' : 'Claim'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          )}

          {/* Legend */}
          <div className="flex gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-emerald-500" /> Unclaimed
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-blue-500" /> My Claim
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-orange-500" /> Other Driver
            </div>
          </div>

          {/* List */}
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {available.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                No locations found in your zones. Select coverage zones first.
              </div>
            ) : (
              available.map(loc => (
                <div key={loc.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getMarkerColor(loc) }}
                      />
                      <span className="text-sm font-medium text-gray-800 truncate">{loc.address}</span>
                    </div>
                    <div className="text-xs text-gray-400 ml-4 mt-0.5">
                      {loc.customer_name} &bull; {loc.matching_zone_name} &bull; {loc.distance_miles.toFixed(1)} mi
                    </div>
                    {loc.claimed_by_driver_id && !loc.is_mine && (
                      <div className="text-xs text-orange-500 ml-4 mt-0.5">
                        Claimed by {loc.claimed_by_driver_name}
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-2">
                    {loc.is_mine ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => releaseLocation(loc.id)}
                        disabled={actionId === loc.id}
                      >
                        Release
                      </Button>
                    ) : !loc.claimed_by_driver_id ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => claimLocation(loc.id)}
                        disabled={actionId === loc.id}
                      >
                        Claim
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {tab === 'claimed' && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {claimed.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No claimed locations yet. Switch to "Available" to claim locations.
            </div>
          ) : (
            claimed.map(loc => (
              <div key={loc.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: loc.zone_color || '#3B82F6' }}
                    />
                    <span className="text-sm font-medium text-gray-800 truncate">{loc.address}</span>
                  </div>
                  <div className="text-xs text-gray-400 ml-4 mt-0.5">
                    {loc.customer_name} &bull; {loc.zone_name || 'No zone'} &bull; {loc.pickup_day || 'No day'} &bull; {loc.pickup_frequency || 'weekly'}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => releaseLocation(loc.property_id)}
                  disabled={actionId === loc.property_id}
                >
                  Release
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default AvailableLocations;
