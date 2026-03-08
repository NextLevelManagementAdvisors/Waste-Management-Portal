import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { LoadingSpinner } from '../ui/index.ts';
import ServiceAreasListView from './ServiceAreasListView.tsx';

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
  pickup_day: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceAreaLocation {
  id: string;
  address: string;
  service_status: string;
  collection_day: string | null;
  collection_frequency: string | null;
  latitude: number | null;
  longitude: number | null;
  coverage_zone_id: string | null;
  collection_day_source: string | null;
  created_at: string;
  owner_name: string;
  owner_email: string;
  zone_name: string | null;
  zone_color: string | null;
  zone_status: string | null;
  zone_pickup_day: string | null;
  zone_driver_id: string | null;
  zone_driver_name: string | null;
}

export interface AssignmentRequest {
  id: string;
  location_id: string;
  zone_id: string;
  driver_id: string;
  requested_by: string;
  status: string;
  deadline: string;
  response_notes: string | null;
  created_at: string;
  responded_at: string | null;
  location_address: string;
  zone_name: string;
  driver_name: string;
  requested_by_name: string;
}

export type ViewMode = 'list' | 'map';

interface ServiceAreasPanelProps {
  onActionResolved?: () => void;
}

const ServiceAreasPanel: React.FC<ServiceAreasPanelProps> = ({ onActionResolved }) => {
  const [zones, setZones] = useState<AdminZone[]>([]);
  const [locations, setLocations] = useState<ServiceAreaLocation[]>([]);
  const [pendingRequests, setPendingRequests] = useState<AssignmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [selectedZones, setSelectedZones] = useState<Map<string, AdminZone>>(new Map());
  const [highlightZoneId, setHighlightZoneId] = useState<string | null>(null);
  const [flaggedNotice, setFlaggedNotice] = useState<{ count: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [autoAssignResult, setAutoAssignResult] = useState<{
    assigned: number;
    skippedNoZone: number;
    skippedConflict: number;
    skippedExistingRequest: number;
    errors: number;
  } | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [locationStatusFilter, setLocationStatusFilter] = useState('all');

  const loadZones = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/driver-zones', { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        setZones(j.zones || []);
      } else {
        setToast('Failed to load service zones');
      }
    } catch {
      setToast('Failed to load service zones');
    }
  }, []);

  const loadLocations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (locationStatusFilter !== 'all') params.set('status', locationStatusFilter);
      const res = await fetch(`/api/admin/service-areas/locations?${params}`, { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        setLocations(j.locations || []);
      } else {
        setToast('Failed to load locations');
      }
    } catch {
      setToast('Failed to load locations');
    }
  }, [search, locationStatusFilter]);

  const loadRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/zone-assignment-requests?status=pending', { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        setPendingRequests(j.requests || []);
      } else {
        setToast('Failed to load assignment requests');
      }
    } catch {
      setToast('Failed to load assignment requests');
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadZones(), loadLocations(), loadRequests()]);
    setLoading(false);
  }, [loadZones, loadLocations, loadRequests]);

  useEffect(() => { loadAll(); }, [loadAll]);

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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 5000); };

  const showFlagged = (count: number) => {
    setFlaggedNotice({ count });
    setTimeout(() => setFlaggedNotice(null), 8000);
  };

  // Zone approval handlers (reused from ZonesPanel)
  const handleApprove = async (zoneId: string) => {
    const res = await fetch(`/api/admin/zones/${zoneId}/decision`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ decision: 'approved' }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.flaggedLocations > 0) showFlagged(data.flaggedLocations);
      await loadAll();
      onActionResolved?.();
    }
  };

  const handleReject = async (zoneId: string, notes?: string) => {
    const res = await fetch(`/api/admin/zones/${zoneId}/decision`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ decision: 'rejected', notes }),
    });
    if (res.ok) { await loadAll(); onActionResolved?.(); }
  };

  const handleDelete = async (zoneId: string) => {
    const res = await fetch(`/api/admin/zones/${zoneId}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) { await loadAll(); onActionResolved?.(); }
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
      await loadAll();
      onActionResolved?.();
    }
  };

  const handleBulkDelete = async (zoneIds: string[]) => {
    const res = await fetch('/api/admin/zones/bulk-delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ zoneIds }),
    });
    if (res.ok) { setSelectedZones(new Map()); await loadAll(); onActionResolved?.(); }
  };

  const handleUpdatePickupDay = async (zoneId: string, pickupDay: string | null) => {
    const res = await fetch(`/api/admin/zones/${zoneId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ pickup_day: pickupDay }),
    });
    if (res.ok) await loadAll();
  };

  const handleViewOnMap = (zoneId: string) => {
    setHighlightZoneId(zoneId);
    setViewMode('map');
  };

  // Zone assignment request handlers
  const handleCreateAssignmentRequest = async (locationId: string, zoneId: string) => {
    const res = await fetch('/api/admin/zone-assignment-requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ locationId, zoneId }),
    });
    if (res.ok) {
      const data = await res.json();
      const zone = zones.find(z => z.id === zoneId);
      showToast(`Request sent to ${zone?.driver_name || 'driver'} for zone "${zone?.name || 'unknown'}"`);
      await loadRequests();
    } else {
      const err = await res.json().catch(() => ({ error: 'Failed' }));
      showToast(err.error || 'Failed to create assignment request');
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    const res = await fetch(`/api/admin/zone-assignment-requests/${requestId}`, {
      method: 'DELETE', credentials: 'include',
    });
    if (res.ok) {
      showToast('Assignment request cancelled');
      await loadRequests();
    }
  };

  const handleAutoAssign = async () => {
    if (!confirm('Auto-assign all unassigned locations to matching driver zones?\n\nThis will create assignment requests that drivers must approve.')) return;
    setAutoAssigning(true);
    setAutoAssignResult(null);
    try {
      const res = await fetch('/api/admin/service-areas/auto-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setAutoAssignResult(data.results);
        const r = data.results;
        showToast(`Auto-assign complete: ${r.assigned} assigned, ${r.skippedNoZone + r.skippedConflict + r.skippedExistingRequest} skipped`);
        await loadAll();
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        showToast(err.error || 'Auto-assign failed');
      }
    } catch {
      showToast('Auto-assign failed');
    }
    setAutoAssigning(false);
  };

  if (loading) return <LoadingSpinner />;

  const activeCount = zones.filter(z => z.status === 'active').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-gray-900">Service Areas</h3>
          <div className="flex gap-4 text-sm text-gray-500 mt-0.5">
            <span><span className="font-bold text-gray-900">{zones.length}</span> zone{zones.length !== 1 ? 's' : ''}</span>
            <span><span className="font-bold text-gray-900">{locations.length}</span> location{locations.length !== 1 ? 's' : ''}</span>
            <span><span className="font-bold text-gray-900">{uniqueDrivers.length}</span> driver{uniqueDrivers.length !== 1 ? 's' : ''}</span>
            <span><span className="font-bold text-gray-900">{activeCount}</span> active</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAutoAssign}
            disabled={autoAssigning}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {autoAssigning ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Auto-Assigning...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                Auto-Assign
              </>
            )}
          </button>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
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
            onClick={() => { setStatusFilter('pending_approval'); setViewMode('list'); }}
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

      {/* Toast */}
      {toast && (
        <div className="bg-gray-900 text-white text-sm font-bold px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2">
          {toast}
          <button type="button" onClick={() => setToast(null)} className="ml-auto text-white/60 hover:text-white text-xs">&times;</button>
        </div>
      )}

      {/* Auto-Assign Results */}
      {autoAssignResult && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-3 flex items-start gap-3">
          <svg className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <div className="text-sm">
            <p className="font-bold text-teal-900">Auto-Assignment Results</p>
            <ul className="mt-1 text-teal-700 space-y-0.5">
              <li><strong>{autoAssignResult.assigned}</strong> location{autoAssignResult.assigned !== 1 ? 's' : ''} assigned (pending driver approval)</li>
              {autoAssignResult.skippedNoZone > 0 && (
                <li><strong>{autoAssignResult.skippedNoZone}</strong> skipped (no matching zone)</li>
              )}
              {autoAssignResult.skippedConflict > 0 && (
                <li><strong>{autoAssignResult.skippedConflict}</strong> skipped (multiple zones)</li>
              )}
              {autoAssignResult.skippedExistingRequest > 0 && (
                <li><strong>{autoAssignResult.skippedExistingRequest}</strong> skipped (request already pending)</li>
              )}
              {autoAssignResult.errors > 0 && (
                <li className="text-red-600"><strong>{autoAssignResult.errors}</strong> error{autoAssignResult.errors !== 1 ? 's' : ''}</li>
              )}
            </ul>
          </div>
          <button type="button" onClick={() => setAutoAssignResult(null)} className="ml-auto text-teal-400 hover:text-teal-600">&times;</button>
        </div>
      )}

      {/* View Content */}
      {viewMode === 'list' ? (
        <ServiceAreasListView
          zones={filteredZones}
          locations={locations}
          pendingRequests={pendingRequests}
          selectedZones={selectedZones}
          onSelectedChange={setSelectedZones}
          onApprove={handleApprove}
          onReject={handleReject}
          onDelete={handleDelete}
          onBulkDecision={handleBulkDecision}
          onBulkDelete={handleBulkDelete}
          onViewOnMap={handleViewOnMap}
          onUpdatePickupDay={handleUpdatePickupDay}
          onCreateAssignmentRequest={handleCreateAssignmentRequest}
          onCancelRequest={handleCancelRequest}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          driverFilter={driverFilter}
          onDriverFilterChange={setDriverFilter}
          locationStatusFilter={locationStatusFilter}
          onLocationStatusFilterChange={setLocationStatusFilter}
          search={search}
          onSearchChange={setSearch}
          uniqueDrivers={uniqueDrivers}
        />
      ) : (
        <Suspense fallback={<LoadingSpinner />}>
          <ZoneMapView
            zones={filteredZones}
            locations={locations}
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

export default ServiceAreasPanel;
