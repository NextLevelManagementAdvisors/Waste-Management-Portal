import React, { useState } from 'react';
import type { AdminZone } from './ZonesPanel.tsx';
import { StatusBadge, EmptyState, ConfirmDialog } from '../ui/index.ts';

const relativeAge = (dateStr: string) => {
  const hours = Math.floor((Date.now() - new Date(dateStr).getTime()) / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const zoneDetail = (zone: AdminZone): string => {
  if (zone.zone_type === 'circle' && zone.radius_miles != null) return `${zone.radius_miles} mi radius`;
  if (zone.zone_type === 'polygon' && zone.polygon_coords) return `${zone.polygon_coords.length} vertices`;
  if (zone.zone_type === 'zip' && zone.zip_codes) return zone.zip_codes.join(', ');
  return '-';
};

const TYPE_STYLES: Record<string, string> = {
  circle: 'bg-blue-100 text-blue-700',
  polygon: 'bg-green-100 text-green-700',
  zip: 'bg-purple-100 text-purple-700',
};

interface ZoneListViewProps {
  zones: AdminZone[];
  selectedZones: Map<string, AdminZone>;
  onSelectedChange: (sel: Map<string, AdminZone>) => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, notes?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBulkDecision: (ids: string[], decision: 'approved' | 'rejected', notes?: string) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onViewOnMap: (id: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  typeFilter: string;
  onTypeFilterChange: (v: string) => void;
  driverFilter: string;
  onDriverFilterChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  uniqueDrivers: [string, string][];
}

const ZoneListView: React.FC<ZoneListViewProps> = ({
  zones, selectedZones, onSelectedChange, onApprove, onReject, onDelete,
  onBulkDecision, onBulkDelete, onViewOnMap,
  statusFilter, onStatusFilterChange, typeFilter, onTypeFilterChange,
  driverFilter, onDriverFilterChange, search, onSearchChange, uniqueDrivers,
}) => {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ single?: string; bulk?: boolean } | null>(null);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectNotes, setBulkRejectNotes] = useState('');

  const allOnPageSelected = zones.length > 0 && zones.every(z => selectedZones.has(z.id));
  const someSelected = selectedZones.size > 0;
  const selectedPendingIds = Array.from(selectedZones.values()).filter(z => z.status === 'pending_approval').map(z => z.id);
  const hasPendingSelected = selectedPendingIds.length > 0;

  const toggleSelect = (zone: AdminZone) => {
    const next = new Map(selectedZones);
    if (next.has(zone.id)) next.delete(zone.id);
    else next.set(zone.id, zone);
    onSelectedChange(next);
  };

  const toggleSelectAll = () => {
    const next = new Map(selectedZones);
    if (allOnPageSelected) {
      zones.forEach(z => next.delete(z.id));
    } else {
      zones.forEach(z => next.set(z.id, z));
    }
    onSelectedChange(next);
  };

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
    setConfirmDelete(null);
  };

  const doBulkApprove = async () => {
    setBulkProcessing(true);
    await onBulkDecision(selectedPendingIds, 'approved');
    setBulkProcessing(false);
  };

  const doBulkReject = async () => {
    setBulkProcessing(true);
    await onBulkDecision(selectedPendingIds, 'rejected', bulkRejectNotes || undefined);
    setBulkRejectOpen(false);
    setBulkRejectNotes('');
    setBulkProcessing(false);
  };

  const doBulkDelete = async () => {
    setBulkProcessing(true);
    await onBulkDelete(Array.from(selectedZones.keys()));
    setBulkProcessing(false);
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-3">
      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={e => onStatusFilterChange(e.target.value)}
          className="text-xs font-bold border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-400"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={typeFilter}
          onChange={e => onTypeFilterChange(e.target.value)}
          className="text-xs font-bold border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-400"
        >
          <option value="all">All Types</option>
          <option value="circle">Circle</option>
          <option value="polygon">Polygon</option>
          <option value="zip">ZIP</option>
        </select>
        <select
          value={driverFilter}
          onChange={e => onDriverFilterChange(e.target.value)}
          className="text-xs font-bold border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-400"
        >
          <option value="all">All Drivers</option>
          {uniqueDrivers.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search zone or driver..."
          className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-400 min-w-[180px]"
        />
        {(statusFilter !== 'all' || typeFilter !== 'all' || driverFilter !== 'all' || search) && (
          <button
            type="button"
            onClick={() => { onStatusFilterChange('all'); onTypeFilterChange('all'); onDriverFilterChange('all'); onSearchChange(''); }}
            className="text-xs font-bold text-gray-500 hover:text-gray-700"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {zones.length === 0 ? (
        <EmptyState message="No zones match the current filters." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allOnPageSelected; }}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                </th>
                <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Zone Name</th>
                <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Driver</th>
                <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Type</th>
                <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Detail</th>
                <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Status</th>
                <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Created</th>
                <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {zones.map(zone => {
                const isPending = zone.status === 'pending_approval';
                const isProcessing = processingId === zone.id;
                const isRejecting = rejectingId === zone.id;
                return (
                  <React.Fragment key={zone.id}>
                    <tr className={`border-b border-gray-50 hover:bg-gray-50 ${
                      isPending ? 'border-l-4 border-l-amber-400 bg-amber-50/50' : ''
                    }`}>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedZones.has(zone.id)}
                          onChange={() => toggleSelect(zone)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color || '#9CA3AF' }} />
                          <span className="font-bold text-gray-900">{zone.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-gray-900">{zone.driver_name}</p>
                        {zone.driver_email && <p className="text-[10px] text-gray-400">{zone.driver_email}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${TYPE_STYLES[zone.zone_type] || 'bg-gray-100 text-gray-600'}`}>
                          {zone.zone_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{zoneDetail(zone)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={zone.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-600 text-xs">{new Date(zone.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                        <div className="text-[10px] font-bold text-gray-400">{relativeAge(zone.created_at)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPending && (
                            <>
                              <button
                                type="button"
                                onClick={() => doApprove(zone.id)}
                                disabled={isProcessing}
                                className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                              >
                                {isProcessing ? '...' : 'Approve'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setRejectingId(isRejecting ? null : zone.id); setRejectNotes(''); }}
                                disabled={isProcessing}
                                className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setConfirmDelete({ single: zone.id })}
                            disabled={isProcessing}
                            className="px-2 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                            title="Delete zone"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => onViewOnMap(zone.id)}
                            className="px-2 py-1 text-[10px] font-bold rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                            title="View on map"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isRejecting && (
                      <tr className="bg-red-50">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <input
                              type="text"
                              value={rejectNotes}
                              onChange={e => setRejectNotes(e.target.value)}
                              placeholder="Reason for rejection (optional)"
                              className="flex-1 bg-white border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400"
                            />
                            <button
                              type="button"
                              onClick={() => doReject(zone.id)}
                              disabled={isProcessing}
                              className="px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                              {isProcessing ? 'Rejecting...' : 'Confirm Reject'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setRejectingId(null); setRejectNotes(''); }}
                              className="px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk Action Bar */}
      {someSelected && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white rounded-xl shadow-2xl px-5 py-3 flex items-center gap-4">
          <span className="text-sm font-bold">{selectedZones.size} zone{selectedZones.size !== 1 ? 's' : ''} selected</span>
          <button
            type="button"
            onClick={() => onSelectedChange(new Map())}
            className="text-xs text-gray-400 hover:text-white underline"
          >
            Clear
          </button>
          <div className="w-px h-5 bg-gray-700" />
          {hasPendingSelected && (
            <>
              <button
                type="button"
                onClick={doBulkApprove}
                disabled={bulkProcessing}
                className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                Approve ({selectedPendingIds.length})
              </button>
              <button
                type="button"
                onClick={() => setBulkRejectOpen(true)}
                disabled={bulkProcessing}
                className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Reject ({selectedPendingIds.length})
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setConfirmDelete({ bulk: true })}
            disabled={bulkProcessing}
            className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg border border-red-400 text-red-400 hover:bg-red-900/30 disabled:opacity-50 transition-colors"
          >
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
            <input
              type="text"
              value={bulkRejectNotes}
              onChange={e => setBulkRejectNotes(e.target.value)}
              placeholder="Reason for rejection (optional)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400"
            />
            <div className="flex gap-3 pt-2 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setBulkRejectOpen(false)}
                className="flex-1 px-4 py-2 text-sm font-bold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doBulkReject}
                disabled={bulkProcessing}
                className="flex-1 px-4 py-2 text-sm font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
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
        onConfirm={() => {
          if (confirmDelete?.bulk) doBulkDelete();
          else if (confirmDelete?.single) doDelete(confirmDelete.single);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};

export default ZoneListView;
