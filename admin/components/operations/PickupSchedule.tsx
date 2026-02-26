import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../../components/Button.tsx';
import { Card } from '../../../components/Card.tsx';
import { LoadingSpinner, Pagination, StatusBadge, EmptyState, FilterBar } from '../ui/index.ts';
import type { PickupScheduleRequest } from '../../../shared/types/index.ts';

interface PickupScheduleResponse {
  requests: PickupScheduleRequest[];
  total: number;
}

interface DriverOption {
  id: string;
  name: string;
  email: string;
}

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

// ── Detail/Edit Modal ──
interface DetailModalProps {
  isOpen: boolean;
  request: PickupScheduleRequest | null;
  drivers: DriverOption[];
  onClose: () => void;
  onSaved: () => void;
}

const DetailModal: React.FC<DetailModalProps> = ({ isOpen, request, drivers, onClose, onSaved }) => {
  const [status, setStatus] = useState('pending');
  const [adminNotes, setAdminNotes] = useState('');
  const [assignedDriverId, setAssignedDriverId] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [servicePrice, setServicePrice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (request) {
      setStatus(request.status);
      setAdminNotes(request.adminNotes || '');
      setAssignedDriverId(request.assignedDriverId || '');
      setPickupDate(request.pickupDate ? request.pickupDate.split('T')[0] : '');
      setServicePrice(String(Number(request.servicePrice).toFixed(2)));
      setError('');
    }
  }, [request]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request) return;
    setSaving(true);
    setError('');
    try {
      const body: any = {};
      if (status !== request.status) body.status = status;
      if (adminNotes !== (request.adminNotes || '')) body.adminNotes = adminNotes;
      if (assignedDriverId !== (request.assignedDriverId || '')) body.assignedDriverId = assignedDriverId || null;
      const dateVal = pickupDate.split('T')[0];
      const origDate = (request.pickupDate || '').split('T')[0];
      if (dateVal !== origDate) body.pickupDate = dateVal;
      const priceNum = parseFloat(servicePrice);
      if (!isNaN(priceNum) && priceNum !== Number(request.servicePrice)) body.servicePrice = priceNum;

      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }

      const res = await fetch(`/api/admin/pickup-schedule/${request.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onSaved();
        onClose();
      } else {
        const json = await res.json();
        setError(json.error || 'Failed to update');
      }
    } catch {
      setError('Failed to update request');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !request) return null;

  const photos = request.photos || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-lg">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-black text-gray-900">{request.customerName}</h2>
            <p className="text-sm text-gray-500">{request.customerEmail}</p>
            <p className="text-sm text-gray-500">{request.address}</p>
          </div>
          <StatusBadge status={request.status} />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-4">{error}</p>}

        {/* Customer notes */}
        {request.notes && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Customer Notes</p>
            <p className="text-sm text-gray-700">{request.notes}</p>
          </div>
        )}

        {/* Photos gallery */}
        {photos.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Customer Photos</p>
            <div className="flex flex-wrap gap-2">
              {photos.map((url: string, i: number) => (
                <button type="button" key={i} onClick={() => setLightboxPhoto(url)} className="w-24 h-24 rounded-lg overflow-hidden border-2 border-gray-200 hover:border-teal-500 transition-colors" title="View full size">
                  <img src={url} alt={`Pickup item ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI Estimate */}
        {request.aiEstimate && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">AI Estimate</p>
            <p className="text-xl font-black text-gray-900">${Number(request.aiEstimate).toFixed(2)}</p>
            {request.aiReasoning && <p className="text-xs text-gray-500 mt-1">{request.aiReasoning}</p>}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 border-t border-gray-200 pt-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500">
                <option value="pending">Pending</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Driver Assignment */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Assign Driver</label>
              <select value={assignedDriverId} onChange={e => setAssignedDriverId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500">
                <option value="">Unassigned</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            {/* Pickup Date */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Pickup Date</label>
              <input type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>

            {/* Price Override */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Price ($)</label>
              <input type="number" step="0.01" min="0" value={servicePrice} onChange={e => setServicePrice(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>
          </div>

          {/* Admin Notes */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Admin Notes</label>
            <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={3} placeholder="Internal notes (not visible to customer)..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none" />
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button variant="secondary" size="sm" type="button" onClick={onClose} disabled={saving} className="flex-1">Cancel</Button>
            <Button size="sm" type="submit" disabled={saving} className="flex-1">{saving ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        </form>
      </Card>

      {/* Photo Lightbox */}
      {lightboxPhoto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 cursor-pointer" onClick={() => setLightboxPhoto(null)}>
          <div className="absolute inset-0 bg-black/80" />
          <img src={lightboxPhoto} alt="Full size" className="relative max-w-full max-h-full rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
};

// ── Main Component ──
const PickupSchedule: React.FC = () => {
  const [requests, setRequests] = useState<PickupScheduleRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<PickupScheduleRequest | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);

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

  const loadDrivers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/drivers', { credentials: 'include' });
      if (res.ok) setDrivers(await res.json());
    } catch {}
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);
  useEffect(() => { loadDrivers(); }, [loadDrivers]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <FilterBar>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setOffset(0); }}
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
        <EmptyState title="No Pickup Requests" message="There are no pickup requests matching your filters." />
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
                    <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Info</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {requests.map(request => {
                    const photoCount = request.photos?.length || 0;
                    const hasNotes = !!request.notes;
                    const hasAi = !!request.aiEstimate;
                    return (
                      <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-gray-900">{request.customerName}</div>
                          <div className="text-xs text-gray-500">{request.customerEmail}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-700 max-w-[200px] truncate">{request.address}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-700">{request.serviceName}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-gray-900">${Number(request.servicePrice).toFixed(2)}</div>
                          {hasAi && <div className="text-[10px] text-blue-500 font-medium">AI: ${Number(request.aiEstimate).toFixed(0)}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-700">{formatDate(request.pickupDate)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={request.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5 text-xs text-gray-400">
                            {photoCount > 0 && <span title={`${photoCount} photo(s)`} className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">{photoCount} img</span>}
                            {hasNotes && <span title="Has customer notes" className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">notes</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="secondary" onClick={() => { setSelectedRequest(request); setShowModal(true); }}>
                            {request.status === 'pending' ? 'Review' : 'Manage'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination total={total} limit={limit} offset={offset} onChange={setOffset} />
        </>
      )}

      <DetailModal
        isOpen={showModal}
        request={selectedRequest}
        drivers={drivers}
        onClose={() => setShowModal(false)}
        onSaved={loadRequests}
      />
    </div>
  );
};

export default PickupSchedule;
