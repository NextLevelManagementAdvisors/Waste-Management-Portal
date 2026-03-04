import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { LoadingSpinner } from '../ui/index.ts';
import ZoneListView from './ZoneListView.tsx';

const ZoneMapView = lazy(() => import('./ZoneMapView.tsx'));

export interface AdminZone {
  id: string;
  driver_id: string;
  driver_name: string;
  driver_email?: string;
  driver_rating: number | null;
  name: string;
  zone_type: string;
  center_lat: string | null;
  center_lng: string | null;
  radius_miles: string | null;
  polygon_coords: [number, number][] | null;
  zip_codes: string[] | null;
  color: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export type ViewMode = 'list' | 'map';

interface ZonesPanelProps {
  onActionResolved?: () => void;
}

const ZonesPanel: React.FC<ZonesPanelProps> = ({ onActionResolved }) => {
  const [zones, setZones] = useState<AdminZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [selectedZones, setSelectedZones] = useState<Map<string, AdminZone>>(new Map());
  const [highlightZoneId, setHighlightZoneId] = useState<string | null>(null);
  const [flaggedNotice, setFlaggedNotice] = useState<{ count: number } | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadZones = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/driver-zones', { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        setZones(j.zones || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadZones(); }, [loadZones]);

  const pendingCount = useMemo(() => zones.filter(z => z.status === 'pending_approval').length, [zones]);
  const uniqueDrivers = useMemo(() => {
    const map = new Map<string, string>();
    zones.forEach(z => map.set(z.driver_id, z.driver_name));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [zones]);

  const filteredZones = useMemo(() => {
    let result = zones;
    if (statusFilter !== 'all') result = result.filter(z => z.status === statusFilter);
    if (typeFilter !== 'all') result = result.filter(z => z.zone_type === typeFilter);
    if (driverFilter !== 'all') result = result.filter(z => z.driver_id === driverFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(z => z.name.toLowerCase().includes(s) || z.driver_name.toLowerCase().includes(s));
    }
    return result;
  }, [zones, statusFilter, typeFilter, driverFilter, search]);

  const showFlagged = (count: number) => {
    setFlaggedNotice({ count });
    setTimeout(() => setFlaggedNotice(null), 8000);
  };

  const handleApprove = async (zoneId: string) => {
    const res = await fetch(`/api/admin/zones/${zoneId}/decision`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ decision: 'approved' }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.flaggedLocations > 0) showFlagged(data.flaggedLocations);
      await loadZones();
      onActionResolved?.();
    }
  };

  const handleReject = async (zoneId: string, notes?: string) => {
    const res = await fetch(`/api/admin/zones/${zoneId}/decision`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ decision: 'rejected', notes }),
    });
    if (res.ok) { await loadZones(); onActionResolved?.(); }
  };

  const handleDelete = async (zoneId: string) => {
    const res = await fetch(`/api/admin/zones/${zoneId}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) { await loadZones(); onActionResolved?.(); }
  };

  const handleBulkDecision = async (zoneIds: string[], decision: 'approved' | 'rejected', notes?: string) => {
    const res = await fetch('/api/admin/zones/bulk-decision', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ zoneIds, decision, notes }),
    });
    if (res.ok) {
      const data = await res.json();
      const totalFlagged = (data.results || []).reduce((sum: number, r: any) => sum + (r.flaggedLocations || 0), 0);
      if (totalFlagged > 0) showFlagged(totalFlagged);
      setSelectedZones(new Map());
      await loadZones();
      onActionResolved?.();
    }
  };

  const handleBulkDelete = async (zoneIds: string[]) => {
    const res = await fetch('/api/admin/zones/bulk-delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ zoneIds }),
    });
    if (res.ok) { setSelectedZones(new Map()); await loadZones(); onActionResolved?.(); }
  };

  const handleViewOnMap = (zoneId: string) => {
    setHighlightZoneId(zoneId);
    setViewMode('map');
  };

  if (loading) return <LoadingSpinner />;

  const activeCount = zones.filter(z => z.status === 'active').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-gray-900">Coverage Zones</h3>
          <div className="flex gap-4 text-sm text-gray-500 mt-0.5">
            <span><span className="font-bold text-gray-900">{zones.length}</span> zone{zones.length !== 1 ? 's' : ''}</span>
            <span><span className="font-bold text-gray-900">{uniqueDrivers.length}</span> driver{uniqueDrivers.length !== 1 ? 's' : ''}</span>
            <span><span className="font-bold text-gray-900">{activeCount}</span> active</span>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
              viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-4 h-4 inline -mt-0.5 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('map')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
              viewMode === 'map' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-4 h-4 inline -mt-0.5 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m0 0-3 3m3-3 3 3m-6-9.75h12M3.75 19.5h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z" />
            </svg>
            Map
          </button>
        </div>
      </div>

      {/* Action Required Banner */}
      {pendingCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span className="text-sm font-bold text-amber-800">
            {pendingCount} zone{pendingCount !== 1 ? 's' : ''} pending approval
          </span>
          <button
            type="button"
            onClick={() => setStatusFilter('pending_approval')}
            className="ml-auto text-xs font-bold text-amber-700 hover:text-amber-900 underline"
          >
            Review Now
          </button>
        </div>
      )}

      {/* Waitlist flagged notice */}
      {flaggedNotice && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
          <span className="text-sm font-bold text-emerald-700">
            {flaggedNotice.count} waitlisted location{flaggedNotice.count !== 1 ? 's' : ''} flagged as ready to activate
          </span>
        </div>
      )}

      {/* View Content */}
      {viewMode === 'list' ? (
        <ZoneListView
          zones={filteredZones}
          selectedZones={selectedZones}
          onSelectedChange={setSelectedZones}
          onApprove={handleApprove}
          onReject={handleReject}
          onDelete={handleDelete}
          onBulkDecision={handleBulkDecision}
          onBulkDelete={handleBulkDelete}
          onViewOnMap={handleViewOnMap}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          driverFilter={driverFilter}
          onDriverFilterChange={setDriverFilter}
          search={search}
          onSearchChange={setSearch}
          uniqueDrivers={uniqueDrivers}
        />
      ) : (
        <Suspense fallback={<LoadingSpinner />}>
          <ZoneMapView
            zones={filteredZones}
            onApprove={handleApprove}
            onReject={handleReject}
            onDelete={handleDelete}
            highlightZoneId={highlightZoneId}
            onHighlightConsumed={() => setHighlightZoneId(null)}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            driverFilter={driverFilter}
            onDriverFilterChange={setDriverFilter}
            uniqueDrivers={uniqueDrivers}
          />
        </Suspense>
      )}
    </div>
  );
};

export default ZonesPanel;
