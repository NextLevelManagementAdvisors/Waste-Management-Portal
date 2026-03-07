import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { AdminZone, ServiceAreaLocation, AssignmentRequest } from './ServiceAreasPanel.tsx';
import { StatusBadge, EmptyState, ConfirmDialog } from '../ui/index.ts';

const LOCATION_STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  pending_review: 'bg-yellow-100 text-yellow-700',
  waitlist: 'bg-blue-100 text-blue-700',
  denied: 'bg-red-100 text-red-700',
};

const capitalize = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

const relativeTime = (dateStr: string) => {
  const ms = new Date(dateStr).getTime() - Date.now();
  if (ms < 0) return 'expired';
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return '<1h left';
  if (hours < 24) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
};

const ASSIGN_MENU_WIDTH = 240;
const ASSIGN_MENU_OFFSET = 6;
const ASSIGN_MENU_VIEWPORT_PADDING = 8;

interface AssignMenuPosition {
  top: number;
  left: number;
}

interface ServiceAreasListViewProps {
  zones: AdminZone[];
  locations: ServiceAreaLocation[];
  pendingRequests: AssignmentRequest[];
  selectedZones: Map<string, AdminZone>;
  onSelectedChange: (sel: Map<string, AdminZone>) => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, notes?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBulkDecision: (ids: string[], decision: 'approved' | 'rejected', notes?: string) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onViewOnMap: (id: string) => void;
  onUpdatePickupDay: (id: string, pickupDay: string | null) => Promise<void>;
  onCreateAssignmentRequest: (locationId: string, zoneId: string) => Promise<void>;
  onCancelRequest: (requestId: string) => Promise<void>;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  typeFilter: string;
  onTypeFilterChange: (v: string) => void;
  driverFilter: string;
  onDriverFilterChange: (v: string) => void;
  locationStatusFilter: string;
  onLocationStatusFilterChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  uniqueDrivers: [string, string][];
}

const ServiceAreasListView: React.FC<ServiceAreasListViewProps> = ({
  zones, locations, pendingRequests,
  selectedZones, onSelectedChange,
  onApprove, onReject, onDelete,
  onBulkDecision, onBulkDelete,
  onViewOnMap, onUpdatePickupDay,
  onCreateAssignmentRequest, onCancelRequest,
  statusFilter, onStatusFilterChange,
  typeFilter, onTypeFilterChange,
  driverFilter, onDriverFilterChange,
  locationStatusFilter, onLocationStatusFilterChange,
  search, onSearchChange, uniqueDrivers,
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['__unassigned__']));
  const [dragOverZoneId, setDragOverZoneId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ single?: string; bulk?: boolean } | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectNotes, setBulkRejectNotes] = useState('');
  const [openLocationId, setOpenLocationId] = useState<string | null>(null);
  const [assignMenuPosition, setAssignMenuPosition] = useState<AssignMenuPosition>({ top: 0, left: 0 });
  const assignTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const assignMenuRef = useRef<HTMLDivElement | null>(null);

  // Group locations by zone
  const { unassigned, grouped } = useMemo(() => {
    const unassigned: ServiceAreaLocation[] = [];
    const map = new Map<string, ServiceAreaLocation[]>();
    for (const loc of locations) {
      if (!loc.coverage_zone_id) {
        unassigned.push(loc);
      } else {
        const list = map.get(loc.coverage_zone_id) || [];
        list.push(loc);
        map.set(loc.coverage_zone_id, list);
      }
    }
    return { unassigned, grouped: map };
  }, [locations]);

  // Pending requests by location
  const requestsByLocation = useMemo(() => {
    const m = new Map<string, AssignmentRequest>();
    for (const r of pendingRequests) m.set(r.location_id, r);
    return m;
  }, [pendingRequests]);

  const toggleGroup = (id: string) => {
    const next = new Set(expandedGroups);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedGroups(next);
  };

  // Zone selection
  const allOnPageSelected = zones.length > 0 && zones.every(z => selectedZones.has(z.id));
  const someSelected = selectedZones.size > 0;
  const selectedPendingIds = Array.from(selectedZones.values()).filter(z => z.status === 'pending_approval').map(z => z.id);
  const hasPendingSelected = selectedPendingIds.length > 0;

  const toggleSelect = (zone: AdminZone) => {
    const next = new Map(selectedZones);
    if (next.has(zone.id)) next.delete(zone.id); else next.set(zone.id, zone);
    onSelectedChange(next);
  };

  // Zone actions
  const doApprove = async (id: string) => { setProcessingId(id); await onApprove(id); setProcessingId(null); };
  const doReject = async (id: string) => { setProcessingId(id); await onReject(id, rejectNotes || undefined); setRejectingId(null); setRejectNotes(''); setProcessingId(null); };
  const doDelete = async (id: string) => { setProcessingId(id); await onDelete(id); setProcessingId(null); setConfirmDelete(null); };
  const doBulkApprove = async () => { setBulkProcessing(true); await onBulkDecision(selectedPendingIds, 'approved'); setBulkProcessing(false); };
  const doBulkReject = async () => { setBulkProcessing(true); await onBulkDecision(selectedPendingIds, 'rejected', bulkRejectNotes || undefined); setBulkRejectOpen(false); setBulkRejectNotes(''); setBulkProcessing(false); };
  const doBulkDelete = async () => { setBulkProcessing(true); await onBulkDelete(Array.from(selectedZones.keys())); setBulkProcessing(false); setConfirmDelete(null); };

  // Drag-and-drop
  const handleDragStart = (e: React.DragEvent, locationId: string) => {
    e.dataTransfer.setData('text/plain', locationId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, zoneId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverZoneId(zoneId);
  };

  const handleDragLeave = () => setDragOverZoneId(null);

  const handleDrop = async (e: React.DragEvent, zoneId: string) => {
    e.preventDefault();
    setDragOverZoneId(null);
    const locationId = e.dataTransfer.getData('text/plain');
    if (locationId) await onCreateAssignmentRequest(locationId, zoneId);
  };

  const activeZones = zones.filter(z => z.status === 'active');
  const openLocation = openLocationId ? locations.find(loc => loc.id === openLocationId) || null : null;

  const setAssignTriggerRef = (locationId: string, node: HTMLButtonElement | null) => {
    if (node) assignTriggerRefs.current.set(locationId, node);
    else assignTriggerRefs.current.delete(locationId);
  };

  const getAssignMenuPosition = useCallback((locationId: string) => {
    if (typeof window === 'undefined') return null;
    const trigger = assignTriggerRefs.current.get(locationId);
    if (!trigger) return null;

    const rect = trigger.getBoundingClientRect();
    const menuHeight = assignMenuRef.current?.offsetHeight ?? 0;
    const maxLeft = Math.max(
      ASSIGN_MENU_VIEWPORT_PADDING,
      window.innerWidth - ASSIGN_MENU_WIDTH - ASSIGN_MENU_VIEWPORT_PADDING,
    );
    const left = Math.min(
      Math.max(rect.left, ASSIGN_MENU_VIEWPORT_PADDING),
      maxLeft,
    );

    let top = rect.bottom + ASSIGN_MENU_OFFSET;
    if (menuHeight > 0) {
      const fitsBelow = top + menuHeight <= window.innerHeight - ASSIGN_MENU_VIEWPORT_PADDING;
      const fitsAbove = rect.top - ASSIGN_MENU_OFFSET - menuHeight >= ASSIGN_MENU_VIEWPORT_PADDING;

      if (!fitsBelow && fitsAbove) {
        top = rect.top - menuHeight - ASSIGN_MENU_OFFSET;
      } else {
        top = Math.max(
          ASSIGN_MENU_VIEWPORT_PADDING,
          Math.min(top, window.innerHeight - menuHeight - ASSIGN_MENU_VIEWPORT_PADDING),
        );
      }
    }

    return { top, left };
  }, []);

  const toggleAssignMenu = (locationId: string) => {
    if (openLocationId === locationId) {
      setOpenLocationId(null);
      return;
    }

    const nextPosition = getAssignMenuPosition(locationId);
    if (!nextPosition) return;

    setAssignMenuPosition(nextPosition);
    setOpenLocationId(locationId);
  };

  useEffect(() => {
    if (!openLocationId) return;

    const location = locations.find(loc => loc.id === openLocationId);
    if (!location || location.coverage_zone_id || requestsByLocation.has(openLocationId)) {
      setOpenLocationId(null);
    }
  }, [locations, openLocationId, requestsByLocation]);

  useEffect(() => {
    if (!openLocationId) return;

    const repositionMenu = () => {
      const nextPosition = getAssignMenuPosition(openLocationId);
      if (!nextPosition) {
        setOpenLocationId(null);
        return;
      }
      setAssignMenuPosition(nextPosition);
    };

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      const trigger = assignTriggerRefs.current.get(openLocationId);
      if (!target) return;
      if (assignMenuRef.current?.contains(target) || trigger?.contains(target)) return;
      setOpenLocationId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenLocationId(null);
    };

    repositionMenu();
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', repositionMenu);
    window.addEventListener('scroll', repositionMenu, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', repositionMenu);
      window.removeEventListener('scroll', repositionMenu, true);
    };
  }, [getAssignMenuPosition, openLocationId]);

  const renderLocationRow = (loc: ServiceAreaLocation) => {
    const pendingReq = requestsByLocation.get(loc.id);
    const hasPending = !!pendingReq;
    return (
      <tr
        key={loc.id}
        draggable={!hasPending}
        onDragStart={e => handleDragStart(e, loc.id)}
        className={`border-b border-gray-50 hover:bg-gray-50 text-xs ${hasPending ? 'opacity-70' : 'cursor-grab'}`}
      >
        <td className="pl-10 pr-2 py-2 text-gray-300">
          {!hasPending && (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
            </svg>
          )}
        </td>
        <td className="px-3 py-2">
          <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full ${LOCATION_STATUS_COLORS[loc.service_status] || 'bg-gray-100 text-gray-600'}`}>
            {loc.service_status.replace('_', ' ')}
          </span>
        </td>
        <td className="px-3 py-2 font-bold text-gray-900">{loc.owner_name || 'Unknown'}</td>
        <td className="px-3 py-2 text-gray-600 max-w-[250px] truncate">{loc.address}</td>
        <td className="px-3 py-2 text-gray-600">{loc.collection_day ? capitalize(loc.collection_day) : '-'}</td>
        <td className="px-3 py-2">
          {hasPending ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                Pending ({relativeTime(pendingReq.deadline)})
              </span>
              <button
                type="button"
                onClick={() => onCancelRequest(pendingReq.id)}
                className="text-[10px] font-bold text-red-500 hover:text-red-700 underline"
              >
                Cancel
              </button>
            </div>
          ) : !loc.coverage_zone_id ? (
            <div className="relative">
              <button
                type="button"
                ref={node => setAssignTriggerRef(loc.id, node)}
                onClick={e => {
                  e.stopPropagation();
                  toggleAssignMenu(loc.id);
                }}
                aria-haspopup="menu"
                aria-expanded={openLocationId === loc.id}
                className="text-[10px] font-bold text-teal-600 hover:text-teal-800 underline"
              >
                Assign to zone
              </button>
            </div>
          ) : null}
        </td>
      </tr>
    );
  };

  const hasFilters = statusFilter !== 'all' || typeFilter !== 'all' || driverFilter !== 'all' || locationStatusFilter !== 'all' || search;

  return (
    <div className="space-y-3">
      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={statusFilter} onChange={e => onStatusFilterChange(e.target.value)}
          className="text-xs font-bold border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-400">
          <option value="all">All Zone Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={typeFilter} onChange={e => onTypeFilterChange(e.target.value)}
          className="text-xs font-bold border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-400">
          <option value="all">All Types</option>
          <option value="circle">Circle</option>
          <option value="polygon">Polygon</option>
          <option value="zip">ZIP</option>
        </select>
        <select value={driverFilter} onChange={e => onDriverFilterChange(e.target.value)}
          className="text-xs font-bold border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-400">
          <option value="all">All Drivers</option>
          {uniqueDrivers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={locationStatusFilter} onChange={e => onLocationStatusFilterChange(e.target.value)}
          className="text-xs font-bold border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-400">
          <option value="all">All Location Statuses</option>
          <option value="approved">Approved</option>
          <option value="pending_review">Pending Review</option>
          <option value="waitlist">Waitlisted</option>
          <option value="denied">Denied</option>
        </select>
        <input
          type="text" value={search} onChange={e => onSearchChange(e.target.value)}
          placeholder="Search location or zone..."
          className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-400 min-w-[180px]"
        />
        {hasFilters && (
          <button type="button"
            onClick={() => { onStatusFilterChange('all'); onTypeFilterChange('all'); onDriverFilterChange('all'); onLocationStatusFilterChange('all'); onSearchChange(''); }}
            className="text-xs font-bold text-gray-500 hover:text-gray-700">
            Clear filters
          </button>
        )}
      </div>

      {/* Grouped Content */}
      <div className="space-y-2">
        {/* Unassigned Group */}
        {unassigned.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleGroup('__unassigned__')}
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedGroups.has('__unassigned__') ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
              <span className="w-3 h-3 rounded-full bg-gray-300 flex-shrink-0" />
              <span className="font-black text-gray-900 text-sm">Unassigned</span>
              <span className="text-xs font-bold text-gray-400">{unassigned.length} location{unassigned.length !== 1 ? 's' : ''}</span>
              <span className="text-[10px] text-gray-400 ml-auto">Drag locations to a zone below to assign</span>
            </button>
            {expandedGroups.has('__unassigned__') && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="w-10" />
                    <th className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-400 text-left">Status</th>
                    <th className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-400 text-left">Customer</th>
                    <th className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-400 text-left">Address</th>
                    <th className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-400 text-left">Day</th>
                    <th className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-400 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {unassigned.map(renderLocationRow)}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Zone Groups */}
        {zones.map(zone => {
          const zoneLocations = grouped.get(zone.id) || [];
          const isPending = zone.status === 'pending_approval';
          const isActive = zone.status === 'active';
          const isExpanded = expandedGroups.has(zone.id);
          const isRejecting = rejectingId === zone.id;
          const isProcessing = processingId === zone.id;
          const isDragTarget = dragOverZoneId === zone.id && isActive;

          return (
            <div key={zone.id} className={`bg-white rounded-xl border overflow-hidden transition-colors ${
              isDragTarget ? 'border-teal-400 border-dashed border-2 bg-teal-50/30' :
              isPending ? 'border-amber-200' : 'border-gray-200'
            }`}>
              {/* Zone Header */}
              <div
                className={`flex items-center gap-2 px-4 py-3 ${isPending ? 'bg-amber-50/50' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}
                onDragOver={isActive ? e => handleDragOver(e, zone.id) : undefined}
                onDragLeave={isActive ? handleDragLeave : undefined}
                onDrop={isActive ? e => handleDrop(e, zone.id) : undefined}
              >
                <input
                  type="checkbox"
                  checked={selectedZones.has(zone.id)}
                  onChange={() => toggleSelect(zone)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <button type="button" onClick={() => toggleGroup(zone.id)} className="flex items-center gap-2 flex-1 text-left min-w-0">
                  <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color || '#9CA3AF' }} />
                  <span className="font-black text-gray-900 text-sm truncate">{zone.name}</span>
                  <span className="text-xs text-gray-500">
                    <span className="font-bold">{zone.driver_name}</span>
                  </span>
                  <StatusBadge status={zone.status} />
                  {zone.pickup_day && (
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                      {capitalize(zone.pickup_day)}
                    </span>
                  )}
                  <span className="text-xs font-bold text-gray-400">{zoneLocations.length} location{zoneLocations.length !== 1 ? 's' : ''}</span>
                </button>

                {/* Zone Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isPending && (
                    <>
                      <button type="button" onClick={() => doApprove(zone.id)} disabled={isProcessing}
                        className="px-2 py-1 text-[10px] font-black uppercase rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                        {isProcessing ? '...' : 'Approve'}
                      </button>
                      <button type="button" onClick={() => setRejectingId(isRejecting ? null : zone.id)} disabled={isProcessing}
                        className="px-2 py-1 text-[10px] font-black uppercase rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                        Reject
                      </button>
                    </>
                  )}
                  <select
                    value={zone.pickup_day || ''}
                    onChange={e => onUpdatePickupDay(zone.id, e.target.value || null)}
                    onClick={e => e.stopPropagation()}
                    className="text-[10px] border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none"
                    title="Pickup day"
                  >
                    <option value="">Day: Not set</option>
                    <option value="monday">Mon</option>
                    <option value="tuesday">Tue</option>
                    <option value="wednesday">Wed</option>
                    <option value="thursday">Thu</option>
                    <option value="friday">Fri</option>
                    <option value="saturday">Sat</option>
                  </select>
                  <button type="button" onClick={() => onViewOnMap(zone.id)}
                    className="px-1.5 py-1 text-gray-400 hover:text-gray-600" title="View on map">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                  </button>
                  <button type="button" onClick={() => setConfirmDelete({ single: zone.id })} disabled={isProcessing}
                    className="px-1.5 py-1 text-red-400 hover:text-red-600" title="Delete zone">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Reject Row */}
              {isRejecting && (
                <div className="px-4 py-3 bg-red-50 border-t border-red-100 flex items-center gap-3">
                  <input type="text" value={rejectNotes} onChange={e => setRejectNotes(e.target.value)}
                    placeholder="Reason for rejection (optional)"
                    className="flex-1 bg-white border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                  <button type="button" onClick={() => doReject(zone.id)} disabled={isProcessing}
                    className="px-3 py-2 text-[10px] font-black uppercase rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                    {isProcessing ? '...' : 'Confirm Reject'}
                  </button>
                  <button type="button" onClick={() => { setRejectingId(null); setRejectNotes(''); }}
                    className="px-3 py-2 text-[10px] font-black uppercase rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              )}

              {/* Location Rows */}
              {isExpanded && (
                zoneLocations.length === 0 ? (
                  <div className="px-10 py-4 text-xs text-gray-400 italic border-t border-gray-100">
                    {isActive ? 'No locations assigned. Drag locations here to create an assignment request.' : 'No locations assigned.'}
                  </div>
                ) : (
                  <table className="w-full text-sm border-t border-gray-100">
                    <thead>
                      <tr className="border-b border-gray-50">
                        <th className="w-10" />
                        <th className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-400 text-left">Status</th>
                        <th className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-400 text-left">Customer</th>
                        <th className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-400 text-left">Address</th>
                        <th className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-400 text-left">Day</th>
                        <th className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-400 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zoneLocations.map(renderLocationRow)}
                    </tbody>
                  </table>
                )
              )}
            </div>
          );
        })}

        {zones.length === 0 && unassigned.length === 0 && (
          <EmptyState message="No zones or locations match the current filters." />
        )}
      </div>

      {/* Bulk Action Bar */}
      {someSelected && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white rounded-xl shadow-2xl px-5 py-3 flex items-center gap-4">
          <span className="text-sm font-bold">{selectedZones.size} zone{selectedZones.size !== 1 ? 's' : ''} selected</span>
          <button type="button" onClick={() => onSelectedChange(new Map())}
            className="text-xs text-gray-400 hover:text-white underline">Clear</button>
          <div className="w-px h-5 bg-gray-700" />
          {hasPendingSelected && (
            <>
              <button type="button" onClick={doBulkApprove} disabled={bulkProcessing}
                className="px-3 py-1.5 text-[10px] font-black uppercase rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                Approve ({selectedPendingIds.length})
              </button>
              <button type="button" onClick={() => setBulkRejectOpen(true)} disabled={bulkProcessing}
                className="px-3 py-1.5 text-[10px] font-black uppercase rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                Reject ({selectedPendingIds.length})
              </button>
            </>
          )}
          <button type="button" onClick={() => setConfirmDelete({ bulk: true })} disabled={bulkProcessing}
            className="px-3 py-1.5 text-[10px] font-black uppercase rounded-lg border border-red-400 text-red-400 hover:bg-red-900/30 disabled:opacity-50">
            Delete ({selectedZones.size})
          </button>
        </div>
      )}

      {/* Bulk Reject Modal */}
      {bulkRejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setBulkRejectOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-lg p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-black text-gray-900">Reject {selectedPendingIds.length} Zone{selectedPendingIds.length !== 1 ? 's' : ''}</h3>
            <input type="text" value={bulkRejectNotes} onChange={e => setBulkRejectNotes(e.target.value)}
              placeholder="Reason for rejection (optional)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
            <div className="flex gap-3 pt-2 border-t border-gray-200">
              <button type="button" onClick={() => setBulkRejectOpen(false)}
                className="flex-1 px-4 py-2 text-sm font-bold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={doBulkReject} disabled={bulkProcessing}
                className="flex-1 px-4 py-2 text-sm font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                {bulkProcessing ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={confirmDelete != null}
        title={confirmDelete?.bulk ? `Delete ${selectedZones.size} Zone${selectedZones.size !== 1 ? 's' : ''}?` : 'Delete Zone?'}
        message={confirmDelete?.bulk
          ? `This will permanently delete ${selectedZones.size} zone${selectedZones.size !== 1 ? 's' : ''}. This cannot be undone.`
          : 'This will permanently delete this zone. This cannot be undone.'}
        confirmLabel="Delete"
        isDangerous
        isLoading={!!processingId || bulkProcessing}
        onConfirm={() => { if (confirmDelete?.bulk) doBulkDelete(); else if (confirmDelete?.single) doDelete(confirmDelete.single); }}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Render the assign menu at the document root so card overflow does not clip it. */}
      {openLocation && typeof document !== 'undefined' && createPortal(
        <div
          ref={assignMenuRef}
          role="menu"
          aria-label={`Assign ${openLocation.owner_name || 'location'} to zone`}
          className="fixed z-40 w-[240px] max-h-[280px] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          style={{ top: assignMenuPosition.top, left: assignMenuPosition.left }}
        >
          {activeZones.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">No active zones</p>
          ) : activeZones.map(z => (
            <button
              key={z.id}
              type="button"
              onClick={() => {
                setOpenLocationId(null);
                void onCreateAssignmentRequest(openLocation.id, z.id);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-50"
            >
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: z.color }} />
              <span className="truncate font-bold">{z.name}</span>
              <span className="ml-auto truncate text-gray-400">{z.driver_name}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default ServiceAreasListView;
