import React, { useState, useEffect, useCallback } from 'react';
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

const PickupSchedule: React.FC = () => {
  const [requests, setRequests] = useState<PickupScheduleRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Service</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Pickup Date</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Created</th>
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
                      <div className="text-sm font-semibold text-gray-900">${request.servicePrice.toFixed(2)}</div>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination total={total} limit={limit} offset={offset} onChange={setOffset} />
        </>
      )}
    </div>
  );
};

export default PickupSchedule;
