import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../../components/Button.tsx';
import { Card } from '../../../components/Card.tsx';
import { LoadingSpinner, Pagination, StatusBadge, EmptyState, FilterBar } from '../ui/index.ts';
import type { PickupScheduleRequest } from '../../../shared/types/index.ts';

interface PickupScheduleResponse {
  requests: PickupScheduleRequest[];
  total: number;
}

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const formatTime = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

interface StatusModalProps {
  isOpen: boolean;
  request: PickupScheduleRequest | null;
  onClose: () => void;
  onSaved: () => void;
}

const StatusModal: React.FC<StatusModalProps> = ({ isOpen, request, onClose, onSaved }) => {
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (request) {
      setStatus(request.status);
      setError('');
    }
  }, [request]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/pickup-schedule/${request.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        onSaved();
        onClose();
      } else {
        const json = await res.json();
        setError(json.error || 'Failed to update status');
      }
    } catch {
      setError('Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !request) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative w-full max-w-lg p-6 shadow-lg">
        <h2 className="text-lg font-black text-gray-900 mb-1">Update Pickup Status</h2>
        <p className="text-sm text-gray-500 mb-4">{request.customerName} — {request.serviceName}</p>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="pending">Pending</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button variant="secondary" size="sm" type="button" onClick={onClose} disabled={saving} className="flex-1">
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={saving} className="flex-1">
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

const PickupSchedule: React.FC = () => {
  const [requests, setRequests] = useState<PickupScheduleRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<PickupScheduleRequest | null>(null);
  const [showModal, setShowModal] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      query.set('status', statusFilter);
      query.set('limit', String(limit));
      query.set('offset', String(offset));
      const res = await fetch(`/api/admin/pickup-schedule?${query}`, { credentials: 'include' });
      if (res.ok) {
        const data: PickupScheduleResponse = await res.json();
        setRequests(data.requests);
        setTotal(data.total);
      }
    } catch (e) {
      console.error('Failed to load pickup schedule:', e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, limit, offset]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <FilterBar>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value);
              setOffset(0);
            }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </FilterBar>

      {requests.length === 0 ? (
        <EmptyState
          title="No Pickup Requests"
          message="There are no pickup requests matching your filters."
        />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Service</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Pickup Date</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {requests.map(request => (
                  <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-gray-900">{request.customerName}</div>
                      <div className="text-xs text-gray-500">{request.customerEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700">{request.address}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700">{request.serviceName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-gray-900">${Number(request.servicePrice).toFixed(2)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700">{formatDate(request.pickupDate)}</div>
                      <div className="text-xs text-gray-500">{formatTime(request.pickupDate)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={request.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700">{formatDate(request.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="secondary" onClick={() => { setSelectedRequest(request); setShowModal(true); }}>
                        {request.status === 'pending' ? 'Schedule' : request.status === 'scheduled' ? 'Update' : 'View'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>

          <Pagination total={total} limit={limit} offset={offset} onChange={setOffset} />
        </>
      )}

      <StatusModal
        isOpen={showModal}
        request={selectedRequest}
        onClose={() => setShowModal(false)}
        onSaved={loadRequests}
      />
    </div>
  );
};

export default PickupSchedule;
