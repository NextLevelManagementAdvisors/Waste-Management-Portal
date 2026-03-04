import React, { useState, useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Circle, Polygon, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { AdminZone } from './ServiceAreasPanel.tsx';
import type { ServiceAreaLocation } from './ServiceAreasPanel.tsx';
import { StatusBadge } from '../ui/index.ts';

// Fix Leaflet default marker icon paths (known Vite issue)
// @ts-ignore
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const MILES_TO_METERS = 1609.34;

const LOCATION_DOT_COLORS: Record<string, string> = {
  approved: '#22C55E',
  pending_review: '#EAB308',
  waitlist: '#3B82F6',
  denied: '#EF4444',
};

const capitalize = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

const zoneDetail = (zone: AdminZone): string => {
  if (zone.zone_type === 'circle' && zone.radius_miles != null) return `${zone.radius_miles} mi radius`;
  if (zone.zone_type === 'polygon' && zone.polygon_coords) return `${zone.polygon_coords.length} vertices`;
  if (zone.zone_type === 'zip' && zone.zip_codes) return `ZIP: ${zone.zip_codes.join(', ')}`;
  return '-';
};

const getZoneStyle = (zone: AdminZone) => {
  const isPending = zone.status === 'pending_approval';
  const isPaused = zone.status === 'paused';
  const isRejected = zone.status === 'rejected';

  return {
    color: isRejected ? '#9CA3AF' : isPending ? '#D97706' : zone.color || '#3B82F6',
    fillColor: isRejected ? '#9CA3AF' : zone.color || '#3B82F6',
    fillOpacity: isRejected ? 0.08 : isPaused ? 0.12 : isPending ? 0.2 : 0.25,
    weight: isPending ? 3 : isRejected ? 1 : 2,
    dashArray: isPending ? '6 3' : isPaused ? '8 4' : isRejected ? '2 4' : undefined,
  };
};

// Auto-fit bounds component
const FitBounds: React.FC<{ zones: AdminZone[]; locations?: ServiceAreaLocation[]; highlightZoneId: string | null }> = ({ zones, locations, highlightZoneId }) => {
  const map = useMap();
  const hasFit = useRef(false);

  useEffect(() => {
    if (highlightZoneId) {
      const zone = zones.find(z => z.id === highlightZoneId);
      if (zone) {
        if (zone.zone_type === 'circle' && zone.center_lat && zone.center_lng) {
          map.flyTo([Number(zone.center_lat), Number(zone.center_lng)], 12, { duration: 0.8 });
        } else if (zone.polygon_coords && zone.polygon_coords.length > 0) {
          const bounds = L.latLngBounds(zone.polygon_coords.map(c => [c[0], c[1]] as [number, number]));
          map.flyToBounds(bounds, { padding: [50, 50], duration: 0.8 });
        }
      }
      return;
    }

    if (hasFit.current) return;

    const points: [number, number][] = [];
    zones.forEach(z => {
      if (z.center_lat && z.center_lng) points.push([Number(z.center_lat), Number(z.center_lng)]);
      if (z.polygon_coords) z.polygon_coords.forEach(c => points.push([c[0], c[1]]));
    });
    // Include location points
    if (locations) {
      locations.forEach(loc => {
        if (loc.latitude != null && loc.longitude != null) {
          points.push([Number(loc.latitude), Number(loc.longitude)]);
        }
      });
    }

    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [40, 40] });
      hasFit.current = true;
    }
  }, [map, zones, locations, highlightZoneId]);

  return null;
};

interface ZoneMapViewProps {
  zones: AdminZone[];
  locations?: ServiceAreaLocation[];
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, notes?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  highlightZoneId: string | null;
  onHighlightConsumed: () => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  driverFilter: string;
  onDriverFilterChange: (v: string) => void;
  uniqueDrivers: [string, string][];
}

const ZoneMapView: React.FC<ZoneMapViewProps> = ({
  zones, locations, onApprove, onReject, onDelete,
  highlightZoneId, onHighlightConsumed,
  statusFilter, onStatusFilterChange, driverFilter, onDriverFilterChange, uniqueDrivers,
}) => {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  useEffect(() => {
    if (highlightZoneId) {
      const timer = setTimeout(onHighlightConsumed, 2000);
      return () => clearTimeout(timer);
    }
  }, [highlightZoneId, onHighlightConsumed]);

  const doApprove = async (id: string) => {
    setProcessingId(id);
    await onApprove(id);
    setProcessingId(null);
  };

  const doReject = async (id: string) => {
    setProcessingId(id);
    await onReject(id, rejectNotes || undefined);
    setRejectingId(null);
    setRejectNotes('');
    setProcessingId(null);
  };

  const doDelete = async (id: string) => {
    setProcessingId(id);
    await onDelete(id);
    setProcessingId(null);
  };

  const renderPopup = (zone: AdminZone) => {
    const isPending = zone.status === 'pending_approval';
    const isProcessing = processingId === zone.id;
    const isRejecting = rejectingId === zone.id;

    return (
      <Popup maxWidth={280} minWidth={220}>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color || '#9CA3AF' }} />
            <span className="font-black text-gray-900">{zone.name}</span>
          </div>
          <div>
            <p className="text-xs text-gray-500">Driver: <span className="font-bold text-gray-700">{zone.driver_name}</span></p>
            <p className="text-xs text-gray-500">Type: {zone.zone_type} &middot; {zoneDetail(zone)}</p>
            <p className="text-xs text-gray-500">Pickup Day: <span className="font-bold text-gray-700">{zone.pickup_day ? zone.pickup_day.charAt(0).toUpperCase() + zone.pickup_day.slice(1) : 'Not set'}</span></p>
          </div>
          <StatusBadge status={zone.status} />

          <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100">
            {isPending && !isRejecting && (
              <>
                <button
                  type="button"
                  onClick={() => doApprove(zone.id)}
                  disabled={isProcessing}
                  className="px-2.5 py-1 text-[10px] font-black uppercase rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {isProcessing ? '...' : 'Approve'}
                </button>
                <button
                  type="button"
                  onClick={() => setRejectingId(zone.id)}
                  disabled={isProcessing}
                  className="px-2.5 py-1 text-[10px] font-black uppercase rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Reject
                </button>
              </>
            )}
            {isRejecting && (
              <div className="w-full space-y-1.5">
                <input
                  type="text"
                  value={rejectNotes}
                  onChange={e => setRejectNotes(e.target.value)}
                  placeholder="Reason (optional)"
                  className="w-full border border-red-200 rounded px-2 py-1 text-xs focus:outline-none"
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => doReject(zone.id)}
                    disabled={isProcessing}
                    className="px-2 py-1 text-[10px] font-black uppercase rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {isProcessing ? '...' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRejectingId(null); setRejectNotes(''); }}
                    className="px-2 py-1 text-[10px] font-bold rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {!isPending && (
              <button
                type="button"
                onClick={() => doDelete(zone.id)}
                disabled={isProcessing}
                className="px-2.5 py-1 text-[10px] font-black uppercase rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {isProcessing ? '...' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      </Popup>
    );
  };

  // Default center (US center)
  const defaultCenter: [number, number] = [38.5, -79.5];

  // Filter locations with valid coordinates
  const mappableLocations = (locations || []).filter(
    loc => loc.latitude != null && loc.longitude != null
  );

  return (
    <div className="relative">
      {/* Map filters overlay */}
      <div className="absolute top-3 right-3 z-[1000] flex gap-2">
        <select
          value={statusFilter}
          onChange={e => onStatusFilterChange(e.target.value)}
          className="text-[10px] font-bold border border-gray-300 rounded-lg px-2 py-1.5 bg-white shadow-sm focus:outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="pending_approval">Pending</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={driverFilter}
          onChange={e => onDriverFilterChange(e.target.value)}
          className="text-[10px] font-bold border border-gray-300 rounded-lg px-2 py-1.5 bg-white shadow-sm focus:outline-none"
        >
          <option value="all">All Drivers</option>
          {uniqueDrivers.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 rounded-lg shadow-sm border border-gray-200 px-3 py-2">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 text-[10px] font-bold text-gray-500">
            <span className="text-[9px] uppercase text-gray-400">Zones:</span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-1 bg-blue-500 rounded" /> Active
            </span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-1 bg-gray-400 rounded border-dashed border border-gray-500" /> Paused
            </span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-1 bg-amber-500 rounded" style={{ borderBottom: '2px dashed #D97706' }} /> Pending
            </span>
          </div>
          {mappableLocations.length > 0 && (
            <div className="flex items-center gap-3 text-[10px] font-bold text-gray-500">
              <span className="text-[9px] uppercase text-gray-400">Locations:</span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#22C55E' }} /> Approved
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#EAB308' }} /> Pending
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#3B82F6' }} /> Waitlist
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#EF4444' }} /> Denied
              </span>
            </div>
          )}
        </div>
      </div>

      <MapContainer
        center={defaultCenter}
        zoom={8}
        className="rounded-xl border border-gray-200"
        style={{ height: '600px', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds zones={zones} locations={locations} highlightZoneId={highlightZoneId} />

        {/* Zone shapes */}
        {zones.map(zone => {
          const style = getZoneStyle(zone);

          if (zone.zone_type === 'circle' && zone.center_lat && zone.center_lng && zone.radius_miles) {
            return (
              <Circle
                key={zone.id}
                center={[Number(zone.center_lat), Number(zone.center_lng)]}
                radius={Number(zone.radius_miles) * MILES_TO_METERS}
                pathOptions={style}
              >
                {renderPopup(zone)}
              </Circle>
            );
          }

          if ((zone.zone_type === 'polygon' || zone.zone_type === 'zip') && zone.polygon_coords && zone.polygon_coords.length > 0) {
            return (
              <Polygon
                key={zone.id}
                positions={zone.polygon_coords.map(c => [c[0], c[1]] as [number, number])}
                pathOptions={style}
              >
                {renderPopup(zone)}
              </Polygon>
            );
          }

          return null;
        })}

        {/* Location dots */}
        {mappableLocations.map(loc => {
          const color = LOCATION_DOT_COLORS[loc.service_status] || '#9CA3AF';
          return (
            <CircleMarker
              key={`loc-${loc.id}`}
              center={[Number(loc.latitude), Number(loc.longitude)]}
              radius={6}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.8, weight: 2 }}
            >
              <Popup maxWidth={250} minWidth={180}>
                <div className="space-y-1 text-sm">
                  <p className="font-black text-gray-900">{loc.address}</p>
                  <p className="text-xs text-gray-500">Customer: <span className="font-bold text-gray-700">{loc.owner_name || 'Unknown'}</span></p>
                  <p className="text-xs text-gray-500">Status: <span className="font-bold" style={{ color }}>{loc.service_status.replace('_', ' ')}</span></p>
                  {loc.collection_day && (
                    <p className="text-xs text-gray-500">Collection: <span className="font-bold text-gray-700">{capitalize(loc.collection_day)}</span></p>
                  )}
                  {loc.zone_name ? (
                    <p className="text-xs text-gray-500">Zone: <span className="font-bold text-gray-700">{loc.zone_name}</span> ({loc.zone_driver_name})</p>
                  ) : (
                    <p className="text-xs text-gray-400 italic">Unassigned</p>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default ZoneMapView;
