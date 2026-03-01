import React, { useState, useEffect, useCallback } from 'react';
import type { LocationDirectoryItem, ServiceZone } from '../../../shared/types/operations.ts';
import { FilterBar } from '../ui/FilterBar.tsx';
import { Pagination } from '../ui/Pagination.tsx';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
  pending_review: 'bg-yellow-100 text-yellow-800',
  denied: 'bg-red-100 text-red-800',
};

const LocationsList: React.FC = () => {
  const [locations, setLocations] = useState<LocationDirectoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('all');
  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [loading, setLoading] = useState(true);

  // Load zones for filter dropdown
  useEffect(() => {
    fetch('/api/admin/zones', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setZones(data.zones || data || []))
      .catch(() => {});
  }, []);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (zoneFilter !== 'all') params.set('zone', zoneFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (dayFilter !== 'all') params.set('pickupDay', dayFilter);
    const page = Math.floor(offset / limit) + 1;
    params.set('page', String(page));
    params.set('limit', String(limit));

    try {
      const res = await fetch(`/api/admin/properties?${params}`, { credentials: 'include' });
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
  }, [search, zoneFilter, statusFilter, dayFilter, offset, limit]);

  useEffect(() => { loadLocations(); }, [loadLocations]);

  // Reset to first page when filters change
  useEffect(() => { setOffset(0); }, [search, zoneFilter, statusFilter, dayFilter]);

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
          value={zoneFilter}
          onChange={e => setZoneFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="all">All Zones</option>
          {zones.map(z => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="all">All Statuses</option>
          <option value="approved">Approved</option>
          <option value="pending_review">Pending Review</option>
          <option value="denied">Denied</option>
        </select>
        <select
          value={dayFilter}
          onChange={e => setDayFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="all">All Pickup Days</option>
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
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Zone</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Pickup Day</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Frequency</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Latitude</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Longitude</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">Loading...</td>
                </tr>
              ) : locations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">No locations found</td>
                </tr>
              ) : (
                locations.map(loc => (
                  <tr key={loc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[loc.serviceStatus] || 'bg-gray-100 text-gray-600'}`}>
                        {loc.serviceStatus === 'approved' ? 'Active' : loc.serviceStatus === 'pending_review' ? 'Pending' : loc.serviceStatus || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{loc.ownerName || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{loc.address}</td>
                    <td className="px-4 py-3">
                      {loc.zoneName ? (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: loc.zoneColor || '#9ca3af' }} />
                          {loc.zoneName}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 capitalize">{loc.pickupDay || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 capitalize">{loc.pickupFrequency || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right font-mono">{loc.latitude ? Number(loc.latitude).toFixed(7) : '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right font-mono">{loc.longitude ? Number(loc.longitude).toFixed(7) : '—'}</td>
                  </tr>
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
