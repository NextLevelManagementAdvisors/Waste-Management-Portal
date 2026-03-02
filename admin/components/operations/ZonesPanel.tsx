import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner, EmptyState } from '../ui/index.ts';

interface DriverZone {
  id: string;
  driver_id: string;
  driverName: string;
  driverEmail?: string;
  name: string;
  zone_type?: string;
  center_lat: number | null;
  center_lng: number | null;
  radius_miles: number | null;
  polygon_coords: [number, number][] | null;
  zip_codes: string[] | null;
  color: string;
  status: string;
  created_at: string;
}

const zoneDetail = (zone: DriverZone) => {
  if (zone.zone_type === 'zip' && zone.zip_codes) return `ZIP ${zone.zip_codes.join(', ')}`;
  if (zone.zone_type === 'polygon' && zone.polygon_coords) return `${zone.polygon_coords.length} vertices`;
  if (zone.radius_miles != null) return `${Number(zone.radius_miles)} mi`;
  return '—';
};

const ZonesPanel: React.FC = () => {
  const [zones, setZones] = useState<DriverZone[]>([]);
  const [loading, setLoading] = useState(true);

  const loadZones = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/driver-zones', { credentials: 'include' });
      if (res.ok) { const j = await res.json(); setZones(j.zones || []); }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadZones(); }, [loadZones]);

  if (loading) return <LoadingSpinner />;

  // Group by driver
  const byDriver = new Map<string, DriverZone[]>();
  for (const z of zones) {
    const key = z.driver_id;
    if (!byDriver.has(key)) byDriver.set(key, []);
    byDriver.get(key)!.push(z);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-gray-900">Driver Coverage Zones</h3>
        <p className="text-sm text-gray-500">
          Read-only view of coverage zones created by drivers. Drivers manage their own zones from the Team Portal.
        </p>
      </div>

      {zones.length === 0 ? (
        <EmptyState message="No driver zones yet. Drivers can create coverage zones from their Team Portal." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-5 py-3 font-bold text-gray-500 text-xs uppercase">Driver</th>
                <th className="px-5 py-3 font-bold text-gray-500 text-xs uppercase">Zone Name</th>
                <th className="px-5 py-3 font-bold text-gray-500 text-xs uppercase">Type</th>
                <th className="px-5 py-3 font-bold text-gray-500 text-xs uppercase">Detail</th>
                <th className="px-5 py-3 font-bold text-gray-500 text-xs uppercase">Color</th>
                <th className="px-5 py-3 font-bold text-gray-500 text-xs uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {zones.map(zone => (
                <tr key={zone.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div>
                      <p className="font-bold text-gray-900">{zone.driverName}</p>
                      {zone.driverEmail && <p className="text-xs text-gray-500">{zone.driverEmail}</p>}
                    </div>
                  </td>
                  <td className="px-5 py-3 font-medium text-gray-800">{zone.name}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      zone.zone_type === 'polygon' ? 'bg-green-100 text-green-700' :
                      zone.zone_type === 'zip' ? 'bg-purple-100 text-purple-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {zone.zone_type === 'polygon' ? 'Polygon' : zone.zone_type === 'zip' ? 'ZIP' : 'Circle'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-700">{zoneDetail(zone)}</td>
                  <td className="px-5 py-3">
                    <span className="w-4 h-4 rounded-full inline-block" style={{ backgroundColor: zone.color || '#9CA3AF' }} />
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      zone.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {zone.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      <div className="flex gap-4 text-sm text-gray-500">
        <span><span className="font-bold text-gray-900">{byDriver.size}</span> driver{byDriver.size !== 1 ? 's' : ''}</span>
        <span><span className="font-bold text-gray-900">{zones.length}</span> zone{zones.length !== 1 ? 's' : ''}</span>
        <span><span className="font-bold text-gray-900">{zones.filter(z => z.status === 'active').length}</span> active</span>
      </div>
    </div>
  );
};

export default ZonesPanel;
