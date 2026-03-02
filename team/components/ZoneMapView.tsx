import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { MapContainer, TileLayer, Circle, Polygon, CircleMarker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { Button } from '../../components/Button.tsx';

// Fix Leaflet default marker icon paths (known Vite issue)
// @ts-ignore
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface CustomZone {
  id: string;
  driver_id: string;
  name: string;
  zone_type: string;
  center_lat: string | null;
  center_lng: string | null;
  radius_miles: string | null;
  polygon_coords: [number, number][] | null;
  zip_codes: string[] | null;
  color: string;
  status: string;
}

interface AvailableLocation {
  id: string;
  address: string;
  serviceType: string;
  collectionDay: string | null;
  collectionFrequency: string | null;
  latitude: number;
  longitude: number;
  customerName: string;
  claimedByDriverId: string | null;
  claimedByDriverName: string | null;
  claimStatus: string | null;
  isMine: boolean;
  distanceMiles: number;
  matchingZoneName: string;
}

interface ClaimedLocation {
  id: string;
  locationId: string;
  address: string;
  serviceType: string;
  collectionDay: string | null;
  collectionFrequency: string | null;
  customerName: string;
}

type AddModeType = false | 'circle' | 'polygon' | 'zip';
type BottomTab = 'zones' | 'available' | 'claimed';

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

// Capture map clicks for circle placement
const MapClickHandler: React.FC<{ onMapClick: (lat: number, lng: number) => void; active: boolean }> = ({ onMapClick, active }) => {
  useMapEvents({
    click(e) {
      if (active) onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

// Geoman drawing controls for polygon mode
const GeomanDraw: React.FC<{
  active: boolean;
  onPolygonCreated: (coords: [number, number][]) => void;
}> = ({ active, onPolygonCreated }) => {
  const map = useMap();

  useEffect(() => {
    const handler = (e: any) => {
      const layer = e.layer;
      if (layer instanceof L.Polygon) {
        const latlngs = (layer.getLatLngs()[0] as L.LatLng[]);
        const coords: [number, number][] = latlngs.map(ll => [ll.lat, ll.lng]);
        onPolygonCreated(coords);
        layer.remove();
      }
    };
    map.on('pm:create', handler);
    return () => { map.off('pm:create', handler); };
  }, [map, onPolygonCreated]);

  useEffect(() => {
    if (active) {
      map.pm.enableDraw('Polygon', {
        snappable: true,
        snapDistance: 20,
        allowSelfIntersection: false,
      });
    } else {
      map.pm.disableDraw();
    }
    return () => { map.pm.disableDraw(); };
  }, [map, active]);

  return null;
};

// Edit mode: enables drag and vertex editing on existing zone layers
const GeomanEdit: React.FC<{
  active: boolean;
  onZoneEdited: (zoneId: string, data: any) => void;
  zones: CustomZone[];
}> = ({ active, onZoneEdited, zones }) => {
  const map = useMap();
  const layersRef = useRef<Map<string, L.Layer>>(new Map());

  useEffect(() => {
    if (!active) {
      layersRef.current.forEach(layer => { map.removeLayer(layer); });
      layersRef.current.clear();
      return;
    }

    for (const zone of zones) {
      if (zone.zone_type === 'circle' && zone.center_lat && zone.center_lng && zone.radius_miles) {
        const circle = L.circle(
          [Number(zone.center_lat), Number(zone.center_lng)],
          { radius: Number(zone.radius_miles) * 1609.34, color: zone.color, fillColor: zone.color, fillOpacity: 0.35 }
        ).addTo(map);
        circle.pm.enable({ draggable: true });
        circle.on('pm:dragend', () => {
          const c = circle.getLatLng();
          onZoneEdited(zone.id, { center_lat: c.lat, center_lng: c.lng });
        });
        circle.on('pm:change', () => {
          const r = circle.getRadius() / 1609.34;
          const c = circle.getLatLng();
          onZoneEdited(zone.id, { center_lat: c.lat, center_lng: c.lng, radius_miles: Math.round(r * 2) / 2 });
        });
        layersRef.current.set(zone.id, circle);
      } else if (zone.polygon_coords && zone.polygon_coords.length >= 3) {
        const poly = L.polygon(
          zone.polygon_coords.map(c => [c[0], c[1]] as L.LatLngTuple),
          { color: zone.color, fillColor: zone.color, fillOpacity: 0.35 }
        ).addTo(map);
        poly.pm.enable({ draggable: true, allowSelfIntersection: false });
        poly.on('pm:edit', () => {
          const latlngs = (poly.getLatLngs()[0] as L.LatLng[]);
          const coords: [number, number][] = latlngs.map(ll => [ll.lat, ll.lng]);
          onZoneEdited(zone.id, { polygon_coords: coords });
        });
        poly.on('pm:dragend', () => {
          const latlngs = (poly.getLatLngs()[0] as L.LatLng[]);
          const coords: [number, number][] = latlngs.map(ll => [ll.lat, ll.lng]);
          onZoneEdited(zone.id, { polygon_coords: coords });
        });
        layersRef.current.set(zone.id, poly);
      }
    }

    return () => {
      layersRef.current.forEach(layer => { map.removeLayer(layer); });
      layersRef.current.clear();
    };
  }, [active, map, zones, onZoneEdited]);

  return null;
};

const MILES_TO_METERS = 1609.34;
const ZONE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

const getMarkerColor = (loc: AvailableLocation) => {
  if (loc.isMine) return '#3B82F6';
  if (loc.claimedByDriverId) return '#F97316';
  return '#10B981';
};

const ZoneMapView: React.FC = () => {
  const [customZones, setCustomZones] = useState<CustomZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>('zones');

  // Locations state
  const [available, setAvailable] = useState<AvailableLocation[]>([]);
  const [claimed, setClaimed] = useState<ClaimedLocation[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);
  const [showLocationsOnMap, setShowLocationsOnMap] = useState(true);

  // Add zone state
  const [addMode, setAddMode] = useState<AddModeType>(false);
  const [newZoneCenter, setNewZoneCenter] = useState<[number, number] | null>(null);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneRadius, setNewZoneRadius] = useState(5);
  const [newZoneColor, setNewZoneColor] = useState('#3B82F6');
  const [newPolygonCoords, setNewPolygonCoords] = useState<[number, number][] | null>(null);
  const [zipInput, setZipInput] = useState('');
  const [zipLoading, setZipLoading] = useState(false);
  const [zipNotice, setZipNotice] = useState<string | null>(null);
  const [pendingZips, setPendingZips] = useState<{ zip: string; coords: [number, number][] }[]>([]);

  // ── Data loading ──
  const loadZones = useCallback(async () => {
    try {
      const res = await fetch('/api/team/my-custom-zones', { credentials: 'include' });
      if (res.ok) { const d = await res.json(); setCustomZones(d.data || []); }
    } catch {}
  }, []);

  const loadLocations = useCallback(async () => {
    try {
      const [availRes, claimedRes] = await Promise.all([
        fetch('/api/team/available-locations', { credentials: 'include' }),
        fetch('/api/team/my-locations', { credentials: 'include' }),
      ]);
      if (availRes.ok) { const d = await availRes.json(); setAvailable(d.data || []); }
      if (claimedRes.ok) { const d = await claimedRes.json(); setClaimed(d.data || []); }
    } catch {}
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadZones(), loadLocations()]);
    setLoading(false);
  }, [loadZones, loadLocations]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Location claim/release ──
  const claimLocation = useCallback(async (locationId: string) => {
    setActionId(locationId);
    try {
      const res = await fetch(`/api/team/locations/${locationId}/claim`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await loadLocations();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to claim location');
      }
    } catch {
      alert('Failed to claim location');
    } finally { setActionId(null); }
  }, [loadLocations]);

  const releaseLocation = useCallback(async (locationId: string) => {
    setActionId(locationId);
    try {
      const res = await fetch(`/api/team/locations/${locationId}/claim`, {
        method: 'DELETE', credentials: 'include',
      });
      if (res.ok) { await loadLocations(); }
      else { alert('Failed to release location'); }
    } catch { alert('Failed to release location'); }
    finally { setActionId(null); }
  }, [loadLocations]);

  // ── Zone CRUD ──
  const handleMapClick = useCallback((lat: number, lng: number) => {
    setNewZoneCenter([lat, lng]);
  }, []);

  const handlePolygonCreated = useCallback((coords: [number, number][]) => {
    setNewPolygonCoords(coords);
  }, []);

  const saveCircleZone = useCallback(async () => {
    if (!newZoneCenter || !newZoneName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/team/my-custom-zones', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newZoneName.trim(), zone_type: 'circle',
          center_lat: newZoneCenter[0], center_lng: newZoneCenter[1],
          radius_miles: newZoneRadius, color: newZoneColor,
        }),
      });
      if (res.ok) {
        await Promise.all([loadZones(), loadLocations()]);
        cancelAddMode();
      }
    } catch {} finally { setSaving(false); }
  }, [newZoneCenter, newZoneName, newZoneRadius, newZoneColor, loadZones, loadLocations]);

  const savePolygonZone = useCallback(async () => {
    if (!newPolygonCoords || !newZoneName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/team/my-custom-zones', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newZoneName.trim(), zone_type: 'polygon',
          polygon_coords: newPolygonCoords, color: newZoneColor,
        }),
      });
      if (res.ok) {
        await Promise.all([loadZones(), loadLocations()]);
        cancelAddMode();
      }
    } catch {} finally { setSaving(false); }
  }, [newPolygonCoords, newZoneName, newZoneColor, loadZones, loadLocations]);

  const addZipToList = useCallback(async () => {
    const zip = zipInput.trim();
    if (!zip) return;
    if (!/^\d{5}(-\d{4})?$/.test(zip)) {
      setZipNotice('Enter a valid 5-digit ZIP or ZIP+4 (e.g. 22630 or 22630-1234)');
      return;
    }
    const zip5 = zip.substring(0, 5);
    if (pendingZips.some(p => p.zip === zip5)) {
      setZipNotice(`ZIP ${zip5} already added`);
      return;
    }
    setZipLoading(true);
    setZipNotice(null);
    try {
      const res = await fetch(`/api/team/zip-boundary/${zip}`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json();
        setZipNotice(err.error || 'ZIP boundary not found');
        return;
      }
      const d = await res.json();
      if (d.notice) setZipNotice(d.notice);
      setPendingZips(prev => [...prev, { zip: d.zip5, coords: d.data }]);
      setZipInput('');
    } catch {
      setZipNotice('Failed to look up ZIP boundary');
    } finally { setZipLoading(false); }
  }, [zipInput, pendingZips]);

  const saveZipZone = useCallback(async () => {
    if (pendingZips.length === 0 || !newZoneName.trim()) return;
    setSaving(true);
    try {
      const allCoords = pendingZips.length === 1
        ? pendingZips[0].coords
        : pendingZips.flatMap(p => p.coords);
      const res = await fetch('/api/team/my-custom-zones', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newZoneName.trim(), zone_type: 'zip',
          polygon_coords: allCoords, zip_codes: pendingZips.map(p => p.zip),
          color: newZoneColor,
        }),
      });
      if (res.ok) {
        await Promise.all([loadZones(), loadLocations()]);
        cancelAddMode();
      }
    } catch {} finally { setSaving(false); }
  }, [pendingZips, newZoneName, newZoneColor, loadZones, loadLocations]);

  const cancelAddMode = useCallback(() => {
    setAddMode(false);
    setNewZoneCenter(null);
    setNewZoneName('');
    setNewZoneRadius(5);
    setNewPolygonCoords(null);
    setZipInput('');
    setZipNotice(null);
    setPendingZips([]);
  }, []);

  const deleteCustomZone = useCallback(async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/team/my-custom-zones/${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setCustomZones(prev => prev.filter(z => z.id !== id));
        loadLocations();
      }
    } catch {} finally { setSaving(false); }
  }, [loadLocations]);

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
        loadLocations();
      }
    } catch {} finally { setSaving(false); }
  }, [loadLocations]);

  const handleZoneEdited = useCallback(async (zoneId: string, data: any) => {
    try {
      await fetch(`/api/team/my-custom-zones/${zoneId}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      loadZones();
    } catch {}
  }, [loadZones]);

  // ── Map points ──
  const allPoints = useMemo(() => {
    const pts: [number, number][] = [];
    customZones.forEach(z => {
      if (z.center_lat && z.center_lng) pts.push([Number(z.center_lat), Number(z.center_lng)]);
      else if (z.polygon_coords?.length) z.polygon_coords.forEach(c => pts.push(c));
    });
    if (newZoneCenter) pts.push(newZoneCenter);
    if (newPolygonCoords) newPolygonCoords.forEach(c => pts.push(c));
    pendingZips.forEach(p => p.coords.forEach(c => pts.push(c)));
    return pts;
  }, [customZones, newZoneCenter, newPolygonCoords, pendingZips]);

  const defaultCenter: [number, number] = [38.85, -78.2];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
      </div>
    );
  }

  const zoneTypeLabel = (z: CustomZone) => {
    if (z.zone_type === 'zip' && z.zip_codes) return `ZIP ${z.zip_codes.join(', ')}`;
    if (z.zone_type === 'polygon') return 'Custom polygon';
    return z.radius_miles ? `${Number(z.radius_miles)} mi` : '';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Coverage</h2>
          <p className="text-sm text-gray-500">
            {addMode === 'circle' ? 'Tap the map to place your zone center, then set the radius and name.'
              : addMode === 'polygon' ? 'Click points on the map to draw your zone boundary. Double-click to finish.'
              : addMode === 'zip' ? 'Enter ZIP codes to auto-create zone boundaries.'
              : editMode ? 'Drag zones to move them, or drag vertices to reshape polygons.'
              : 'Manage your zones and claim locations within them.'}
          </p>
        </div>
        <div className="flex gap-2">
          {!addMode && (
            <Button variant={editMode ? 'primary' : 'secondary'} size="sm" onClick={() => setEditMode(!editMode)}>
              {editMode ? 'Done Editing' : 'Edit Zones'}
            </Button>
          )}
          {addMode ? (
            <Button variant="secondary" size="sm" onClick={cancelAddMode}>Cancel</Button>
          ) : !editMode ? (
            <Button variant="primary" size="sm" onClick={() => setAddMode('circle')}>+ Add Zone</Button>
          ) : null}
        </div>
      </div>

      {/* Add Mode Type Selector */}
      {addMode && !newZoneCenter && !newPolygonCoords && pendingZips.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-sm font-bold text-blue-800 mb-3">Choose Zone Type</div>
          <div className="flex gap-2">
            {(['circle', 'polygon', 'zip'] as const).map(type => (
              <button key={type}
                onClick={() => setAddMode(type)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition ${
                  addMode === type ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                }`}
              >
                {type === 'circle' ? 'Circle' : type === 'polygon' ? 'Draw Polygon' : 'ZIP Code'}
              </button>
            ))}
          </div>
          {addMode === 'circle' && <div className="mt-3 text-xs text-blue-700 text-center">Tap the map to place your zone center</div>}
          {addMode === 'polygon' && <div className="mt-3 text-xs text-blue-700 text-center">Click points on the map to draw. Double-click to finish.</div>}
        </div>
      )}

      {/* Circle form */}
      {addMode === 'circle' && newZoneCenter && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="text-sm font-bold text-blue-800">New Circle Zone</div>
          <input type="text" placeholder="Zone name (e.g. Front Royal Area)" value={newZoneName}
            onChange={e => setNewZoneName(e.target.value)}
            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" autoFocus />
          <div>
            <label className="text-xs font-bold text-blue-700">Radius: {newZoneRadius} miles</label>
            <input type="range" min={1} max={25} step={0.5} value={newZoneRadius}
              onChange={e => setNewZoneRadius(Number(e.target.value))} className="w-full mt-1" />
          </div>
          <div>
            <label className="text-xs font-bold text-blue-700 block mb-1">Color</label>
            <div className="flex gap-2">
              {ZONE_COLORS.map(c => (
                <button key={c} type="button" title={c} onClick={() => setNewZoneColor(c)}
                  className={`w-6 h-6 rounded-full border-2 ${newZoneColor === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={saveCircleZone} disabled={!newZoneName.trim() || saving}>Save Zone</Button>
            <Button variant="secondary" size="sm" onClick={cancelAddMode}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Polygon form */}
      {addMode === 'polygon' && newPolygonCoords && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
          <div className="text-sm font-bold text-green-800">New Polygon Zone ({newPolygonCoords.length} vertices)</div>
          <input type="text" placeholder="Zone name (e.g. Downtown Area)" value={newZoneName}
            onChange={e => setNewZoneName(e.target.value)}
            className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" autoFocus />
          <div>
            <label className="text-xs font-bold text-green-700 block mb-1">Color</label>
            <div className="flex gap-2">
              {ZONE_COLORS.map(c => (
                <button key={c} type="button" title={c} onClick={() => setNewZoneColor(c)}
                  className={`w-6 h-6 rounded-full border-2 ${newZoneColor === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={savePolygonZone} disabled={!newZoneName.trim() || saving}>Save Zone</Button>
            <Button variant="secondary" size="sm" onClick={() => setNewPolygonCoords(null)}>Redraw</Button>
            <Button variant="secondary" size="sm" onClick={cancelAddMode}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ZIP form */}
      {addMode === 'zip' && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
          <div className="text-sm font-bold text-purple-800">Create Zone from ZIP Code</div>
          <div className="flex gap-2">
            <input type="text" placeholder="ZIP code (e.g. 22630 or 22630-1234)" value={zipInput}
              onChange={e => setZipInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addZipToList()}
              className="flex-1 px-3 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500" />
            <Button variant="secondary" size="sm" onClick={addZipToList} disabled={zipLoading}>
              {zipLoading ? 'Looking up...' : 'Add ZIP'}
            </Button>
          </div>
          {zipNotice && <div className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">{zipNotice}</div>}
          {pendingZips.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-purple-700">Added ZIPs ({pendingZips.length}):</div>
              {pendingZips.map(p => (
                <div key={p.zip} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-purple-100">
                  <span className="text-sm font-medium">{p.zip}</span>
                  <button onClick={() => setPendingZips(prev => prev.filter(z => z.zip !== p.zip))} className="text-xs text-red-500 font-bold">Remove</button>
                </div>
              ))}
              <input type="text" placeholder="Zone name" value={newZoneName} onChange={e => setNewZoneName(e.target.value)}
                className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500" />
              <div>
                <label className="text-xs font-bold text-purple-700 block mb-1">Color</label>
                <div className="flex gap-2">
                  {ZONE_COLORS.map(c => (
                    <button key={c} type="button" title={c} onClick={() => setNewZoneColor(c)}
                      className={`w-6 h-6 rounded-full border-2 ${newZoneColor === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={saveZipZone} disabled={!newZoneName.trim() || saving}>
                  {pendingZips.length > 1 ? 'Merge & Save Zone' : 'Save Zone'}
                </Button>
                <Button variant="secondary" size="sm" onClick={cancelAddMode}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Map */}
      <div className="rounded-xl border border-gray-200 overflow-hidden" style={{ height: '55vh', minHeight: 350 }}>
        <MapContainer center={defaultCenter} zoom={10} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {allPoints.length > 0 && <FitBounds points={allPoints} />}
          <MapClickHandler onMapClick={handleMapClick} active={addMode === 'circle'} />
          <GeomanDraw active={addMode === 'polygon' && !newPolygonCoords} onPolygonCreated={handlePolygonCreated} />
          <GeomanEdit active={editMode} onZoneEdited={handleZoneEdited} zones={customZones} />

          {/* Saved zones (hidden in edit mode — GeomanEdit creates editable layers) */}
          {!editMode && customZones.map(zone => {
            const isPaused = zone.status === 'paused';
            const pathOpts = {
              color: zone.color, fillColor: zone.color,
              fillOpacity: isPaused ? 0.15 : 0.35, weight: 2,
              dashArray: isPaused ? '8 4' : undefined,
            };

            if (zone.zone_type === 'circle' && zone.center_lat && zone.center_lng && zone.radius_miles) {
              return (
                <Circle key={`c-${zone.id}`}
                  center={[Number(zone.center_lat), Number(zone.center_lng)]}
                  radius={Number(zone.radius_miles) * MILES_TO_METERS}
                  pathOptions={pathOpts}>
                  <Popup>
                    <div className="text-center min-w-[140px]">
                      <div className="font-bold text-sm">{zone.name}</div>
                      <div className="text-xs mt-1">{Number(zone.radius_miles)} mi radius</div>
                      <div className="flex gap-1 justify-center mt-2">
                        <button onClick={() => toggleCustomZonePause(zone.id, isPaused)} className="px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-700">{isPaused ? 'Resume' : 'Pause'}</button>
                        <button onClick={() => deleteCustomZone(zone.id)} className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-700">Delete</button>
                      </div>
                    </div>
                  </Popup>
                </Circle>
              );
            }
            if (zone.polygon_coords && zone.polygon_coords.length >= 3) {
              return (
                <Polygon key={`p-${zone.id}`} positions={zone.polygon_coords} pathOptions={pathOpts}>
                  <Popup>
                    <div className="text-center min-w-[140px]">
                      <div className="font-bold text-sm">{zone.name}</div>
                      <div className="text-xs mt-1">{zone.zone_type === 'zip' && zone.zip_codes ? `ZIP: ${zone.zip_codes.join(', ')}` : 'Custom polygon'}</div>
                      <div className="flex gap-1 justify-center mt-2">
                        <button onClick={() => toggleCustomZonePause(zone.id, isPaused)} className="px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-700">{isPaused ? 'Resume' : 'Pause'}</button>
                        <button onClick={() => deleteCustomZone(zone.id)} className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-700">Delete</button>
                      </div>
                    </div>
                  </Popup>
                </Polygon>
              );
            }
            return null;
          })}

          {/* Location markers on the map */}
          {showLocationsOnMap && !editMode && available.filter(l => l.latitude && l.longitude).map(loc => (
            <CircleMarker key={`loc-${loc.id}`}
              center={[loc.latitude, loc.longitude]} radius={7}
              pathOptions={{ color: getMarkerColor(loc), fillColor: getMarkerColor(loc), fillOpacity: 0.7, weight: 2 }}>
              <Popup>
                <div className="min-w-[180px]">
                  <div className="font-bold text-sm">{loc.address}</div>
                  <div className="text-xs text-gray-500 mt-1">{loc.customerName}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {loc.serviceType} &bull; {loc.collectionDay || 'No day'} &bull; {loc.matchingZoneName} &bull; {loc.distanceMiles.toFixed(1)} mi
                  </div>
                  {loc.claimedByDriverId && !loc.isMine && (
                    <div className="text-xs text-orange-600 font-medium mt-1">Claimed by {loc.claimedByDriverName}</div>
                  )}
                  <div className="mt-2">
                    {loc.isMine ? (
                      <button onClick={() => releaseLocation(loc.id)} disabled={actionId === loc.id}
                        className="px-3 py-1 rounded text-xs font-bold bg-red-100 text-red-700">
                        {actionId === loc.id ? '...' : 'Release'}
                      </button>
                    ) : !loc.claimedByDriverId ? (
                      <button onClick={() => claimLocation(loc.id)} disabled={actionId === loc.id}
                        className="px-3 py-1 rounded text-xs font-bold bg-teal-100 text-teal-700">
                        {actionId === loc.id ? '...' : 'Claim'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {/* New zone previews */}
          {addMode === 'circle' && newZoneCenter && (
            <Circle center={newZoneCenter} radius={newZoneRadius * MILES_TO_METERS}
              pathOptions={{ color: newZoneColor, fillColor: newZoneColor, fillOpacity: 0.3, weight: 2, dashArray: '4 4' }} />
          )}
          {addMode === 'polygon' && newPolygonCoords && (
            <Polygon positions={newPolygonCoords}
              pathOptions={{ color: newZoneColor, fillColor: newZoneColor, fillOpacity: 0.3, weight: 2, dashArray: '4 4' }} />
          )}
          {pendingZips.map(p => (
            <Polygon key={`zp-${p.zip}`} positions={p.coords}
              pathOptions={{ color: newZoneColor, fillColor: newZoneColor, fillOpacity: 0.25, weight: 2, dashArray: '4 4' }} />
          ))}
        </MapContainer>
      </div>

      {/* Map legend + toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Unclaimed</div>
          <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500" /> My Claim</div>
          <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500" /> Other Driver</div>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={showLocationsOnMap} onChange={e => setShowLocationsOnMap(e.target.checked)}
            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
          Show locations
        </label>
      </div>

      {/* Tabbed bottom panel: Zones | Available | Claimed */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex border-b border-gray-100">
          {([
            { key: 'zones' as BottomTab, label: `My Zones (${customZones.length})` },
            { key: 'available' as BottomTab, label: `Available (${available.length})` },
            { key: 'claimed' as BottomTab, label: `Claimed (${claimed.length})` },
          ]).map(t => (
            <button key={t.key}
              onClick={() => setBottomTab(t.key)}
              className={`flex-1 px-4 py-3 text-sm font-bold transition-colors ${
                bottomTab === t.key ? 'text-teal-700 border-b-2 border-teal-600' : 'text-gray-400 hover:text-gray-600'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Zones tab */}
        {bottomTab === 'zones' && (
          customZones.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {customZones.map(zone => (
                <div key={zone.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color }} />
                    <span className="text-sm font-medium text-gray-800">{zone.name}</span>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      zone.zone_type === 'circle' ? 'bg-blue-50 text-blue-600' :
                      zone.zone_type === 'zip' ? 'bg-purple-50 text-purple-600' : 'bg-green-50 text-green-600'
                    }`}>{zone.zone_type || 'circle'}</span>
                    {zone.status === 'paused' && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">Paused</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{zoneTypeLabel(zone)}</span>
                    <button onClick={() => toggleCustomZonePause(zone.id, zone.status === 'paused')} disabled={saving}
                      className="text-xs font-bold text-gray-500 hover:text-gray-700">
                      {zone.status === 'paused' ? 'Resume' : 'Pause'}
                    </button>
                    <button onClick={() => deleteCustomZone(zone.id)} disabled={saving}
                      className="text-xs font-bold text-red-500 hover:text-red-700">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No coverage zones yet. Tap "+ Add Zone" to define your coverage area.
            </div>
          )
        )}

        {/* Available locations tab */}
        {bottomTab === 'available' && (
          available.length > 0 ? (
            <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
              {available.map(loc => (
                <div key={loc.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getMarkerColor(loc) }} />
                      <span className="text-sm font-medium text-gray-800 truncate">{loc.address}</span>
                    </div>
                    <div className="text-xs text-gray-400 ml-4 mt-0.5">
                      {loc.customerName} &bull; {loc.matchingZoneName} &bull; {loc.distanceMiles.toFixed(1)} mi
                    </div>
                    {loc.claimedByDriverId && !loc.isMine && (
                      <div className="text-xs text-orange-500 ml-4 mt-0.5">Claimed by {loc.claimedByDriverName}</div>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-2">
                    {loc.isMine ? (
                      <Button variant="secondary" size="sm" onClick={() => releaseLocation(loc.id)} disabled={actionId === loc.id}>Release</Button>
                    ) : !loc.claimedByDriverId ? (
                      <Button variant="primary" size="sm" onClick={() => claimLocation(loc.id)} disabled={actionId === loc.id}>Claim</Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No locations found in your zones. Add coverage zones to see available locations.
            </div>
          )
        )}

        {/* Claimed locations tab */}
        {bottomTab === 'claimed' && (
          claimed.length > 0 ? (
            <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
              {claimed.map(loc => (
                <div key={loc.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800 truncate">{loc.address}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {loc.customerName} &bull; {loc.collectionDay || 'No day'} &bull; {loc.collectionFrequency || 'weekly'}
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => releaseLocation(loc.locationId)} disabled={actionId === loc.locationId}>
                    Release
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No claimed locations yet. Switch to "Available" to claim locations.
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default ZoneMapView;
