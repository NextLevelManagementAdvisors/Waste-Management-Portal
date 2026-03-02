import React, { useState, useEffect, useCallback } from 'react';
import type { LocationDirectoryItem } from '../../../shared/types/operations.ts';
import { FilterBar } from '../ui/FilterBar.tsx';
import { Pagination } from '../ui/Pagination.tsx';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
  pending_review: 'bg-yellow-100 text-yellow-800',
  denied: 'bg-red-100 text-red-800',
  waitlist: 'bg-blue-100 text-blue-800',
};

const STATUS_LABELS: Record<string, string> = {
  approved: 'Active',
  pending_review: 'Pending',
  denied: 'Denied',
  waitlist: 'Waitlisted',
};

interface DriverZone {
  id: string;
  name: string;
  driver_name: string;
  status: string;
}

const COL_SPAN = 8;

const LocationsList: React.FC = () => {
  const [locations, setLocations] = useState<LocationDirectoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const [zones, setZones] = useState<DriverZone[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (dayFilter !== 'all') params.set('collectionDay', dayFilter);
    const page = Math.floor(offset / limit) + 1;
    params.set('page', String(page));
    params.set('limit', String(limit));

    try {
      const res = await fetch(`/api/admin/locations?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLocations(data.locations || []);
        setTotal(data.total || 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, dayFilter, offset, limit]);

  useEffect(() => { loadLocations(); }, [loadLocations]);

  // Reset to first page when filters change
  useEffect(() => { setOffset(0); }, [search, statusFilter, dayFilter]);

  // Fetch active zones once
  useEffect(() => {
    fetch('/api/admin/driver-zones', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setZones((data.zones || []).filter((z: DriverZone) => z.status === 'active'));
      })
      .catch(() => {});
  }, []);

  // ── Action handlers ──

  const handleDecision = async (locationId: string, decision: 'approved' | 'waitlist') => {
    setSaving(locationId);
    try {
      const res = await fetch(`/api/admin/address-reviews/${locationId}/decision`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        setExpandedId(null);
        loadLocations();
      }
    } catch {
      // ignore
    } finally {
      setSaving(null);
    }
  };

  const handleAssignZone = async (locationId: string, zoneId: string) => {
    setSaving(locationId);
    try {
      const res = await fetch(`/api/admin/locations/${locationId}/assign-zone`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ zoneId }),
      });
      if (res.ok) loadLocations();
    } catch {
      // ignore
    } finally {
      setSaving(null);
    }
  };

  const handleChangeDay = async (locationId: string, collectionDay: string) => {
    setSaving(locationId);
    try {
      const res = await fetch(`/api/admin/locations/${locationId}/collection-day`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ collectionDay }),
      });
      if (res.ok) loadLocations();
    } catch {
      // ignore
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Location Directory</h2>
          <p className="text-sm text-gray-500">{total} locations total</p>
        </div>
      </div>

      {/* Filters */}
      <FilterBar>
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search by address or customer name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="all">All Statuses</option>
          <option value="approved">Approved</option>
          <option value="pending_review">Pending Review</option>
          <option value="waitlist">Waitlisted</option>
          <option value="denied">Denied</option>
        </select>
        <select
          value={dayFilter}
          onChange={e => setDayFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="all">All Collection Days</option>
          {DAYS.map(d => (
            <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
          ))}
        </select>
      </FilterBar>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Address</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Collection Day</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Frequency</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Latitude</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Longitude</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={COL_SPAN} className="px-4 py-12 text-center text-gray-400">Loading...</td>
                </tr>
              ) : locations.length === 0 ? (
                <tr>
                  <td colSpan={COL_SPAN} className="px-4 py-12 text-center text-gray-400">No locations found</td>
                </tr>
              ) : (
                locations.map(loc => (
                  <React.Fragment key={loc.id}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[loc.serviceStatus] || 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABELS[loc.serviceStatus] || loc.serviceStatus || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{loc.ownerName || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{loc.address}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 capitalize">{loc.collectionDay || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 capitalize">{loc.collectionFrequency || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 text-right font-mono">{loc.latitude ? Number(loc.latitude).toFixed(7) : '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 text-right font-mono">{loc.longitude ? Number(loc.longitude).toFixed(7) : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setExpandedId(expandedId === loc.id ? null : loc.id)}
                          className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          {expandedId === loc.id ? 'Close' : 'Actions'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === loc.id && (
                      <tr className="bg-gray-50">
                        <td colSpan={COL_SPAN} className="px-4 py-4">
                          <div className="flex flex-wrap items-end gap-6">
                            {/* Status actions */}
                            {loc.serviceStatus === 'denied' ? (
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Status</span>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleDecision(loc.id, 'approved')}
                                    disabled={saving !== null}
                                    className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                                  >
                                    {saving === loc.id ? 'Saving...' : 'Approve'}
                                  </button>
                                  <button
                                    onClick={() => handleDecision(loc.id, 'waitlist')}
                                    disabled={saving !== null}
                                    className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                  >
                                    Waitlist
                                  </button>
                                </div>
                              </div>
                            ) : loc.serviceStatus !== 'approved' && (
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Status</span>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleDecision(loc.id, 'approved')}
                                    disabled={saving !== null}
                                    className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                                  >
                                    {saving === loc.id ? 'Saving...' : 'Approve'}
                                  </button>
                                  {loc.serviceStatus !== 'waitlist' && (
                                    <button
                                      onClick={() => handleDecision(loc.id, 'waitlist')}
                                      disabled={saving !== null}
                                      className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                    >
                                      Waitlist
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Assign zone */}
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Assign Zone</span>
                              <select
                                defaultValue={loc.coverageZoneId || ''}
                                onChange={e => { if (e.target.value) handleAssignZone(loc.id, e.target.value); }}
                                disabled={saving !== null}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white disabled:opacity-50"
                              >
                                <option value="" disabled>Select zone...</option>
                                {zones.map(z => (
                                  <option key={z.id} value={z.id}>{z.name} ({z.driver_name})</option>
                                ))}
                              </select>
                            </div>

                            {/* Change collection day */}
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Collection Day</span>
                              <select
                                defaultValue={loc.collectionDay || ''}
                                onChange={e => { if (e.target.value) handleChangeDay(loc.id, e.target.value); }}
                                disabled={saving !== null}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white disabled:opacity-50"
                              >
                                <option value="" disabled>Select day...</option>
                                {DAYS.map(d => (
                                  <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {total > limit && (
        <Pagination total={total} limit={limit} offset={offset} onChange={setOffset} />
      )}
    </div>
  );
};

export default LocationsList;
