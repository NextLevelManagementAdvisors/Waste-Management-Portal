import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner, EmptyState } from '../ui/index.ts';

interface LocationClaim {
  id: string;
  property_id: string;
  driver_id: string;
  status: string;
  claimed_at: string;
  revoked_at: string | null;
  notes: string | null;
  driver_name: string;
  driver_rating: number | null;
  address: string;
  customer_name: string;
  zone_id: string | null;
  zone_name: string | null;
  zone_color: string | null;
  pickup_day: string | null;
}

interface ServiceZone {
  id: string;
  name: string;
  color: string;
}

interface Driver {
  id: string;
  name: string;
}

const ClaimsPanel: React.FC = () => {
  const [claims, setClaims] = useState<LocationClaim[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [assignModal, setAssignModal] = useState<{ propertyId: string; address: string } | null>(null);
  const [assignDriverId, setAssignDriverId] = useState('');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const limit = 50;

  const loadClaims = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (zoneFilter !== 'all') params.set('zone_id', zoneFilter);
      params.set('page', String(page));
      params.set('limit', String(limit));

      const res = await fetch(`/api/admin/location-claims?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setClaims(data.claims || []);
        setTotal(data.total || 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [statusFilter, zoneFilter, page]);

  const loadMeta = useCallback(async () => {
    try {
      const [zonesRes, driversRes] = await Promise.all([
        fetch('/api/admin/service-zones', { credentials: 'include' }),
        fetch('/api/admin/drivers', { credentials: 'include' }),
      ]);
      if (zonesRes.ok) {
        const d = await zonesRes.json();
        setZones(d.zones || d.data || []);
      }
      if (driversRes.ok) {
        const d = await driversRes.json();
        setDrivers(d.drivers || d.data || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadClaims(); }, [loadClaims]);

  const revokeClaim = useCallback(async (claimId: string) => {
    if (!confirm('Revoke this claim? The driver will lose this location.')) return;
    setRevoking(claimId);
    try {
      const res = await fetch(`/api/admin/location-claims/${claimId}/revoke`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Admin revoked' }),
      });
      if (res.ok) {
        await loadClaims();
      }
    } catch {
      // ignore
    } finally {
      setRevoking(null);
    }
  }, [loadClaims]);

  const assignDriver = useCallback(async () => {
    if (!assignModal || !assignDriverId) return;
    try {
      const res = await fetch(`/api/admin/properties/${assignModal.propertyId}/assign-driver`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: assignDriverId }),
      });
      if (res.ok) {
        setAssignModal(null);
        setAssignDriverId('');
        await loadClaims();
      }
    } catch {
      // ignore
    }
  }, [assignModal, assignDriverId, loadClaims]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-800">Location Claims</h3>
          <p className="text-sm text-gray-500">
            {total} claim{total !== 1 ? 's' : ''} found
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
          <option value="released">Released</option>
          <option value="">All Statuses</option>
        </select>

        <select
          value={zoneFilter}
          onChange={e => { setZoneFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="all">All Zones</option>
          {zones.map(z => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : claims.length === 0 ? (
        <EmptyState message="No location claims found" />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Address</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Driver</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Rating</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Zone</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Claimed</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {claims.map(claim => (
                  <tr key={claim.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-800 max-w-[200px] truncate">{claim.address}</td>
                    <td className="px-4 py-3 text-gray-600">{claim.customer_name}</td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{claim.driver_name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {claim.driver_rating != null ? Number(claim.driver_rating).toFixed(1) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {claim.zone_name ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: claim.zone_color || '#10B981' }} />
                          {claim.zone_name}
                        </span>
                      ) : (
                        <span className="text-gray-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded-full ${
                        claim.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : claim.status === 'revoked'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {claim.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(claim.claimed_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        {claim.status === 'active' && (
                          <button
                            onClick={() => revokeClaim(claim.id)}
                            disabled={revoking === claim.id}
                            className="px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50 rounded"
                          >
                            {revoking === claim.id ? '...' : 'Revoke'}
                          </button>
                        )}
                        <button
                          onClick={() => setAssignModal({ propertyId: claim.property_id, address: claim.address })}
                          className="px-2 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded"
                        >
                          Assign
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Assign Modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setAssignModal(null)}>
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-800 mb-1">Assign Driver</h3>
            <p className="text-sm text-gray-500 mb-4 truncate">{assignModal.address}</p>
            <select
              value={assignDriverId}
              onChange={e => setAssignDriverId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-4"
            >
              <option value="">Select a driver...</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setAssignModal(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={assignDriver}
                disabled={!assignDriverId}
                className="px-4 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClaimsPanel;
