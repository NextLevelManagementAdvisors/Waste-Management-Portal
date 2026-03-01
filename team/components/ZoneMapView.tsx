import React, { useState, useEffect, useCallback, useMemo } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Circle, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Button } from '../../components/Button.tsx';

// Fix Leaflet default marker icon paths (known Vite issue)
// @ts-ignore
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface ServiceZone {
  id: string;
  name: string;
  description?: string;
  color: string;
  active: boolean;
  center_lat?: number;
  center_lng?: number;
  radius_miles?: number;
}

interface DriverZoneSelection {
  id: string;
  driver_id: string;
  zone_id: string;
  status: 'active' | 'paused';
  zone_name: string;
  zone_color: string;
}

interface CustomZone {
  id: string;
  driver_id: string;
  name: string;
  center_lat: string;
  center_lng: string;
  radius_miles: string;
  color: string;
  status: string;
}

// Auto-fit map to show all zone points
const FitBounds: React.FC<{ points: [number, number][] }> = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng)));
    map.fitBounds(bounds.pad(0.3));
  }, [map, points]);
  return null;
};

// Capture map clicks when in "add zone" mode
const MapClickHandler: React.FC<{ onMapClick: (lat: number, lng: number) => void; active: boolean }> = ({ onMapClick, active }) => {
  useMapEvents({
    click(e) {
      if (active) onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const MILES_TO_METERS = 1609.34;
const ZONE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

const ZoneMapView: React.FC = () => {
  // Admin zones + selections
  const [allZones, setAllZones] = useState<ServiceZone[]>([]);
  const [myZones, setMyZones] = useState<DriverZoneSelection[]>([]);
  // Driver custom zones
  const [customZones, setCustomZones] = useState<CustomZone[]>([]);
  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // "Add zone" mode
  const [addMode, setAddMode] = useState(false);
  const [newZoneCenter, setNewZoneCenter] = useState<[number, number] | null>(null);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneRadius, setNewZoneRadius] = useState(5);
  const [newZoneColor, setNewZoneColor] = useState('#3B82F6');

  const selectedIds = useMemo(() => new Set(myZones.map(z => z.zone_id)), [myZones]);
  const pausedIds = useMemo(() => new Set(myZones.filter(z => z.status === 'paused').map(z => z.zone_id)), [myZones]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [zonesRes, myRes, customRes] = await Promise.all([
        fetch('/api/team/zones', { credentials: 'include' }),
        fetch('/api/team/my-zones', { credentials: 'include' }),
        fetch('/api/team/my-custom-zones', { credentials: 'include' }),
      ]);
      if (zonesRes.ok) { const d = await zonesRes.json(); setAllZones(d.data || []); }
      if (myRes.ok) { const d = await myRes.json(); setMyZones(d.data || []); }
      if (customRes.ok) { const d = await customRes.json(); setCustomZones(d.data || []); }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Toggle admin zone selection
  const toggleZone = useCallback(async (zoneId: string) => {
    setSaving(true);
    const newIds = selectedIds.has(zoneId)
      ? [...selectedIds].filter(id => id !== zoneId)
      : [...selectedIds, zoneId];
    try {
      const res = await fetch('/api/team/my-zones', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoneIds: newIds }),
      });
      if (res.ok) { const d = await res.json(); setMyZones(d.data || []); }
    } catch {} finally { setSaving(false); }
  }, [selectedIds]);

  const togglePause = useCallback(async (zoneId: string, currentlyPaused: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/team/my-zones/${zoneId}/${currentlyPaused ? 'resume' : 'pause'}`, {
        method: 'PUT', credentials: 'include',
      });
      if (res.ok) {
        setMyZones(prev => prev.map(z =>
          z.zone_id === zoneId ? { ...z, status: currentlyPaused ? 'active' : 'paused' } : z
        ));
      }
    } catch {} finally { setSaving(false); }
  }, []);

  // Create custom zone
  const handleMapClick = useCallback((lat: number, lng: number) => {
    setNewZoneCenter([lat, lng]);
  }, []);

  const saveCustomZone = useCallback(async () => {
    if (!newZoneCenter || !newZoneName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/team/my-custom-zones', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newZoneName.trim(),
          center_lat: newZoneCenter[0],
          center_lng: newZoneCenter[1],
          radius_miles: newZoneRadius,
          color: newZoneColor,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setCustomZones(prev => [d.data, ...prev]);
        // Reset
        setAddMode(false);
        setNewZoneCenter(null);
        setNewZoneName('');
        setNewZoneRadius(5);
      }
    } catch {} finally { setSaving(false); }
  }, [newZoneCenter, newZoneName, newZoneRadius, newZoneColor]);

  const cancelAddMode = useCallback(() => {
    setAddMode(false);
    setNewZoneCenter(null);
    setNewZoneName('');
    setNewZoneRadius(5);
  }, []);

  const deleteCustomZone = useCallback(async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/team/my-custom-zones/${id}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (res.ok) setCustomZones(prev => prev.filter(z => z.id !== id));
    } catch {} finally { setSaving(false); }
  }, []);

  const toggleCustomZonePause = useCallback(async (id: string, currentlyPaused: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/team/my-custom-zones/${id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: currentlyPaused ? 'active' : 'paused' }),
      });
      if (res.ok) {
        setCustomZones(prev => prev.map(z =>
          z.id === id ? { ...z, status: currentlyPaused ? 'active' : 'paused' } : z
        ));
      }
    } catch {} finally { setSaving(false); }
  }, []);

  // Collect all points for auto-fit
  const allPoints = useMemo(() => {
    const pts: [number, number][] = [];
    allZones.filter(z => z.center_lat && z.center_lng).forEach(z => pts.push([z.center_lat!, z.center_lng!]));
    customZones.forEach(z => pts.push([Number(z.center_lat), Number(z.center_lng)]));
    if (newZoneCenter) pts.push(newZoneCenter);
    return pts;
  }, [allZones, customZones, newZoneCenter]);

  const mappableAdminZones = useMemo(
    () => allZones.filter(z => z.center_lat && z.center_lng && z.radius_miles),
    [allZones]
  );

  const defaultCenter: [number, number] = [38.85, -78.2];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">My Coverage Zones</h2>
          <p className="text-sm text-gray-500">
            {addMode
              ? 'Tap the map to place your zone center, then set the radius and name.'
              : 'Tap existing zones to select them, or add your own coverage area.'}
          </p>
        </div>
        {!addMode ? (
          <Button variant="primary" size="sm" onClick={() => setAddMode(true)}>
            + Add Zone
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={cancelAddMode}>
            Cancel
          </Button>
        )}
      </div>

      {/* Add Zone Form (when center is placed) */}
      {addMode && newZoneCenter && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="text-sm font-bold text-blue-800">New Zone</div>
          <div>
            <input
              type="text"
              placeholder="Zone name (e.g. Front Royal Area)"
              value={newZoneName}
              onChange={e => setNewZoneName(e.target.value)}
              className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-bold text-blue-700">Radius: {newZoneRadius} miles</label>
            <input
              type="range"
              min={1}
              max={25}
              step={0.5}
              value={newZoneRadius}
              onChange={e => setNewZoneRadius(Number(e.target.value))}
              className="w-full mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-blue-700 block mb-1">Color</label>
            <div className="flex gap-2">
              {ZONE_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  title={`Select color ${c}`}
                  onClick={() => setNewZoneColor(c)}
                  className={`w-6 h-6 rounded-full border-2 ${newZoneColor === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={saveCustomZone} disabled={!newZoneName.trim() || saving}>
              Save Zone
            </Button>
            <Button variant="secondary" size="sm" onClick={cancelAddMode}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {addMode && !newZoneCenter && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <div className="text-sm font-bold text-blue-800">Tap the map to place your zone center</div>
        </div>
      )}

      {/* Map */}
      <div className="rounded-xl border border-gray-200 overflow-hidden" style={{ height: '55vh', minHeight: 350 }}>
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
          {allPoints.length > 0 && <FitBounds points={allPoints} />}
          <MapClickHandler onMapClick={handleMapClick} active={addMode} />

          {/* Admin-defined zones */}
          {mappableAdminZones.map(zone => {
            const isSelected = selectedIds.has(zone.id);
            const isPaused = pausedIds.has(zone.id);
            const color = isSelected ? zone.color : '#9CA3AF';
            const opacity = isSelected ? (isPaused ? 0.25 : 0.5) : 0.15;

            return (
              <Circle
                key={`admin-${zone.id}`}
                center={[zone.center_lat!, zone.center_lng!]}
                radius={(zone.radius_miles || 5) * MILES_TO_METERS}
                pathOptions={{
                  color, fillColor: color, fillOpacity: opacity,
                  weight: isSelected ? 3 : 1,
                  dashArray: isPaused ? '8 4' : undefined,
                }}
                eventHandlers={{ click: () => { if (!saving && !addMode) toggleZone(zone.id); } }}
              >
                <Popup>
                  <div className="text-center min-w-[140px]">
                    <div className="font-bold text-sm">{zone.name}</div>
                    <div className="text-[10px] text-gray-400 uppercase mt-0.5">Company Zone</div>
                    {zone.description && <div className="text-xs text-gray-500 mt-0.5">{zone.description}</div>}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleZone(zone.id); }}
                      disabled={saving}
                      className={`mt-2 px-3 py-1 rounded text-xs font-bold ${
                        isSelected ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-700'
                      }`}
                    >
                      {isSelected ? 'Remove' : 'Add to Coverage'}
                    </button>
                  </div>
                </Popup>
              </Circle>
            );
          })}

          {/* Driver custom zones */}
          {customZones.map(zone => {
            const isPaused = zone.status === 'paused';
            return (
              <Circle
                key={`custom-${zone.id}`}
                center={[Number(zone.center_lat), Number(zone.center_lng)]}
                radius={Number(zone.radius_miles) * MILES_TO_METERS}
                pathOptions={{
                  color: zone.color,
                  fillColor: zone.color,
                  fillOpacity: isPaused ? 0.15 : 0.35,
                  weight: 2,
                  dashArray: isPaused ? '8 4' : undefined,
                }}
              >
                <Popup>
                  <div className="text-center min-w-[140px]">
                    <div className="font-bold text-sm">{zone.name}</div>
                    <div className="text-[10px] text-gray-400 uppercase mt-0.5">My Zone</div>
                    <div className="text-xs mt-1">{Number(zone.radius_miles)} mi radius</div>
                    <div className="flex gap-1 justify-center mt-2">
                      <button
                        onClick={() => toggleCustomZonePause(zone.id, isPaused)}
                        className="px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-700"
                      >
                        {isPaused ? 'Resume' : 'Pause'}
                      </button>
                      <button
                        onClick={() => deleteCustomZone(zone.id)}
                        className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </Popup>
              </Circle>
            );
          })}

          {/* New zone preview (while adding) */}
          {addMode && newZoneCenter && (
            <Circle
              center={newZoneCenter}
              radius={newZoneRadius * MILES_TO_METERS}
              pathOptions={{
                color: newZoneColor,
                fillColor: newZoneColor,
                fillOpacity: 0.3,
                weight: 2,
                dashArray: '4 4',
              }}
            />
          )}
        </MapContainer>
      </div>

      {/* My Zones List */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-700">
            My Coverage ({myZones.length + customZones.length} zones)
          </h3>
        </div>

        {/* Custom zones */}
        {customZones.length > 0 && (
          <div className="divide-y divide-gray-100">
            {customZones.map(zone => (
              <div key={zone.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color }} />
                  <span className="text-sm font-medium text-gray-800">{zone.name}</span>
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-600">My Zone</span>
                  {zone.status === 'paused' && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">Paused</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{Number(zone.radius_miles)} mi</span>
                  <button onClick={() => toggleCustomZonePause(zone.id, zone.status === 'paused')} disabled={saving} className="text-xs font-bold text-gray-500 hover:text-gray-700">
                    {zone.status === 'paused' ? 'Resume' : 'Pause'}
                  </button>
                  <button onClick={() => deleteCustomZone(zone.id)} disabled={saving} className="text-xs font-bold text-red-500 hover:text-red-700">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Admin zone selections */}
        {myZones.length > 0 && (
          <div className="divide-y divide-gray-100">
            {myZones.map(sel => (
              <div key={sel.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: sel.zone_color || '#10B981' }} />
                  <span className="text-sm font-medium text-gray-800">{sel.zone_name}</span>
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Company</span>
                  {sel.status === 'paused' && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">Paused</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => togglePause(sel.zone_id, sel.status === 'paused')} disabled={saving} className="text-xs font-bold text-gray-500 hover:text-gray-700">
                    {sel.status === 'paused' ? 'Resume' : 'Pause'}
                  </button>
                  <button onClick={() => toggleZone(sel.zone_id)} disabled={saving} className="text-xs font-bold text-red-500 hover:text-red-700">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {myZones.length === 0 && customZones.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-gray-400">
            No coverage zones yet. Tap "Add Zone" and click the map to create your first zone.
          </div>
        )}
      </div>
    </div>
  );
};

export default ZoneMapView;
