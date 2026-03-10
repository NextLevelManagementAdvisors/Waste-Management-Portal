import React, { useState, useEffect, useMemo } from 'react';
import type { Driver, Route, RouteOrder } from '../../../shared/types/index.ts';

interface AdminProperty {
  id: string;
  address: string;
  serviceType: string;
  serviceStatus: string;
  ownerName: string;
  zoneName: string | null;
  zoneColor: string | null;
}

interface EditRouteModalProps {
  route: Route;
  onClose: () => void;
  onUpdated: () => void;
}

interface ProviderOption {
  id: string;
  name: string;
}

const EditRouteModal: React.FC<EditRouteModalProps> = ({ route, onClose, onUpdated }) => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [form, setForm] = useState({
    title: route.title,
    scheduledDate: route.scheduledDate?.split('T')[0] ?? '',
    start_time: route.startTime ?? '',
    end_time: route.endTime ?? '',
    estimated_hours: route.estimatedHours != null ? String(route.estimatedHours) : '',
    basePay: route.basePay != null ? String(route.basePay) : '',
    notes: route.notes ?? '',
    assignedDriverId: route.assignedDriverId ?? '',
    status: route.status,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Provider assignment state
  const [showProviderAssign, setShowProviderAssign] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState((route as any).assigned_provider_id ?? '');
  const [providerRate, setProviderRate] = useState((route as any).provider_per_stop_rate ? String((route as any).provider_per_stop_rate) : '');
  const [providerAssigning, setProviderAssigning] = useState(false);
  const [providerMsg, setProviderMsg] = useState('');

  // Order management state
  const [orders, setOrders] = useState<RouteOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [locations, setLocations] = useState<AdminProperty[]>([]);
  const [locationSearch, setLocationSearch] = useState('');
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set());
  const [addingOrders, setAddingOrders] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const isReadOnly = route.status === 'completed' || route.status === 'cancelled';

  useEffect(() => {
    fetch('/api/admin/drivers', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: Driver[] | { drivers: Driver[] }) => {
        setDrivers(Array.isArray(data) ? data : (data as any).drivers ?? []);
      })
      .catch(() => {});

    fetch('/api/admin/providers', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { providers: [] })
      .then(d => setProviders((d.providers || []).filter((p: any) => p.approval_status === 'approved')))
      .catch(() => {});

    fetchOrders();

    if (!isReadOnly) {
      fetch('/api/admin/locations', { credentials: 'include' })
        .then(r => r.ok ? r.json() : [])
        .then((data: AdminProperty[]) => setLocations(data.filter(p => p.serviceStatus === 'approved')))
        .catch(() => {});
    }
  }, []);

  // Auto-load contract rate when provider changes
  useEffect(() => {
    if (!selectedProviderId) return;
    fetch(`/api/admin/providers/${selectedProviderId}/contracts?zone_id=${(route as any).zone_id || ''}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : { contracts: [] })
      .then(d => {
        const active = (d.contracts || []).find((c: any) => c.status === 'active');
        if (active) setProviderRate(String(active.per_stop_rate));
      })
      .catch(() => {});
  }, [selectedProviderId]);

  const handleAssignProvider = async () => {
    setProviderAssigning(true);
    setProviderMsg('');
    try {
      const res = await fetch(`/api/admin/routes/${route.id}/assign-provider`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          providerId: selectedProviderId || null,
          perStopRate: providerRate ? parseFloat(providerRate) : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to assign provider');
      setProviderMsg(selectedProviderId ? 'Provider assigned successfully' : 'Provider assignment cleared');
      onUpdated();
    } catch (err: any) {
      setProviderMsg(err.message);
    } finally {
      setProviderAssigning(false);
    }
  };

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch(`/api/admin/routes/${route.id}/orders`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders ?? []);
      }
    } catch (e) {
      console.error('Failed to load orders:', e);
    } finally {
      setOrdersLoading(false);
    }
  };

  const handleRemoveOrder = async (orderId: string) => {
    try {
      const res = await fetch(`/api/admin/routes/${route.id}/orders/${orderId}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setOrders(prev => prev.filter(s => s.id !== orderId));
      }
    } catch (e) {
      console.error('Failed to remove order:', e);
    }
  };

  const handleAddOrders = async () => {
    if (selectedLocationIds.size === 0) return;
    setAddingOrders(true);
    try {
      const res = await fetch(`/api/admin/routes/${route.id}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ locationIds: [...selectedLocationIds] }),
      });
      if (res.ok) {
        setSelectedLocationIds(new Set());
        setLocationSearch('');
        setShowPicker(false);
        await fetchOrders();
      }
    } catch (e) {
      console.error('Failed to add orders:', e);
    } finally {
      setAddingOrders(false);
    }
  };

  const toggleLocation = (id: string) => {
    setSelectedLocationIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Filter out properties already on the route
  const existingLocationIds = useMemo(() => new Set(orders.map(s => s.locationId).filter(Boolean)), [orders]);

  const filteredLocations = useMemo(() => {
    const available = locations.filter(p => !existingLocationIds.has(p.id));
    const q = locationSearch.toLowerCase().trim();
    const list = q
      ? available.filter(p =>
          p.address?.toLowerCase().includes(q) ||
          p.ownerName?.toLowerCase().includes(q) ||
          p.zoneName?.toLowerCase().includes(q)
        )
      : available;
    return [...list].sort((a, b) => {
      const aSelected = selectedLocationIds.has(a.id) ? 0 : 1;
      const bSelected = selectedLocationIds.has(b.id) ? 0 : 1;
      return aSelected - bSelected;
    });
  }, [locations, locationSearch, selectedLocationIds, existingLocationIds]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim() || !form.scheduledDate) {
      setError('Title and scheduled date are required.');
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, any> = {
        title: form.title.trim(),
        scheduledDate: form.scheduledDate,
        status: form.status,
      };
      if (form.start_time) body.start_time = form.start_time;
      else body.start_time = null;
      if (form.end_time) body.end_time = form.end_time;
      else body.end_time = null;
      if (form.estimated_hours) body.estimated_hours = Number(form.estimated_hours);
      else body.estimated_hours = null;
      if (form.basePay) body.basePay = Number(form.basePay);
      else body.basePay = null;
      if (form.notes.trim()) body.notes = form.notes.trim();
      else body.notes = null;
      if (form.assignedDriverId) body.assignedDriverId = form.assignedDriverId;
      else body.assignedDriverId = null;

      const res = await fetch(`/api/admin/routes/${route.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to update route.');
        return;
      }
      onUpdated();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-black text-gray-900">Edit Route</h2>
          <p className="text-sm text-gray-500 mt-0.5">Update route details, manage orders, or assign a driver.</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Title <span className="text-red-500">*</span></label>
            <input type="text" value={form.title} onChange={set('title')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
          </div>

          {/* Scheduled Date */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Scheduled Date <span className="text-red-500">*</span></label>
            <input type="date" value={form.scheduledDate} onChange={set('scheduledDate')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
          </div>

          {/* Start / End time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Start Time</label>
              <input type="time" value={form.start_time} onChange={set('start_time')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">End Time</label>
              <input type="time" value={form.end_time} onChange={set('end_time')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>
          </div>

          {/* Hours / Pay */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Est. Hours</label>
              <input type="number" min="0" step="0.5" value={form.estimated_hours} onChange={set('estimated_hours')} placeholder="0"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Base Pay ($)</label>
              <input type="number" min="0" step="0.01" value={form.basePay} onChange={set('basePay')} placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>
          </div>

          {/* Orders Section */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">
              Orders <span className="text-teal-600">({orders.length})</span>
            </label>

            {ordersLoading ? (
              <div className="text-xs text-gray-400 py-2">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="text-xs text-gray-400 py-2">No orders on this route yet.</div>
            ) : (
              <div className="border border-gray-200 rounded-lg max-h-[160px] overflow-y-auto divide-y divide-gray-50">
                {orders.map(s => (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <div className="text-gray-900 truncate">{s.address}</div>
                      <div className="text-xs text-gray-400 truncate">{s.customerName}</div>
                    </div>
                    <span className={`text-[10px] font-bold flex-shrink-0 ${
                      s.orderType === 'special' ? 'text-purple-600' : s.orderType === 'missed_redo' ? 'text-red-600' : 'text-gray-400'
                    }`}>{s.orderType}</span>
                    {!isReadOnly && (
                      <button type="button" onClick={() => handleRemoveOrder(s.id)}
                        className="text-red-400 hover:text-red-600 font-bold flex-shrink-0" title="Remove order">
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add orders picker */}
            {!isReadOnly && (
              <div className="mt-2">
                {!showPicker ? (
                  <button type="button" onClick={() => setShowPicker(true)}
                    className="text-xs font-bold text-teal-600 hover:text-teal-800 transition-colors">
                    + Add Orders
                  </button>
                ) : (
                  <div className="border border-teal-200 rounded-lg p-2 bg-teal-50/30">
                    <input type="text" value={locationSearch} onChange={e => setLocationSearch(e.target.value)}
                      placeholder="Search by address, customer, or zone..."
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white" />
                    <div className="mt-1 border border-gray-200 rounded-lg max-h-[150px] overflow-y-auto bg-white">
                      {filteredLocations.length === 0 ? (
                        <div className="px-3 py-3 text-center text-xs text-gray-400">
                          {locations.length === 0 ? 'Loading...' : 'No matching locations'}
                        </div>
                      ) : (
                        filteredLocations.map(p => {
                          const selected = selectedLocationIds.has(p.id);
                          return (
                            <button key={p.id} type="button" onClick={() => toggleLocation(p.id)}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0 ${
                                selected ? 'bg-teal-50' : ''
                              }`}>
                              <span className={`w-4 h-4 flex-shrink-0 rounded border-2 flex items-center justify-center ${
                                selected ? 'bg-teal-600 border-teal-600' : 'border-gray-300'
                              }`}>
                                {selected && (
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                  </svg>
                                )}
                              </span>
                              {p.zoneColor && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.zoneColor }} />}
                              <div className="min-w-0 flex-1">
                                <div className="text-gray-900 truncate">{p.address}</div>
                                <div className="text-xs text-gray-400 truncate">{p.ownerName}{p.zoneName ? ` — ${p.zoneName}` : ''}</div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <button type="button" onClick={() => { setShowPicker(false); setSelectedLocationIds(new Set()); setLocationSearch(''); }}
                        className="text-xs font-bold text-gray-500 hover:text-gray-700">Cancel</button>
                      <button type="button" onClick={handleAddOrders} disabled={selectedLocationIds.size === 0 || addingOrders}
                        className="px-3 py-1 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg transition-colors">
                        {addingOrders ? 'Adding...' : `Add ${selectedLocationIds.size} Order${selectedLocationIds.size !== 1 ? 's' : ''}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Status</label>
            <select value={form.status} onChange={set('status')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500">
              <option value="open">Open</option>
              <option value="bidding">Bidding</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Assign Driver */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Assign Driver <span className="text-gray-400 font-normal">(optional)</span></label>
            <select value={form.assignedDriverId} onChange={set('assignedDriverId')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500">
              <option value="">Unassigned</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Assign to Provider */}
          {providers.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowProviderAssign(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Assign to Provider Company
                  {selectedProviderId && <span className="text-xs font-normal text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">Assigned</span>}
                </span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${showProviderAssign ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showProviderAssign && (
                <div className="px-4 py-4 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Provider Company</label>
                    <select
                      value={selectedProviderId}
                      onChange={e => { setSelectedProviderId(e.target.value); setProviderRate(''); }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    >
                      <option value="">— No provider (clear assignment) —</option>
                      {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  {selectedProviderId && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">
                        Per-Stop Rate <span className="text-gray-400 font-normal">(auto-filled from contract if available)</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={providerRate}
                          onChange={e => setProviderRate(e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        />
                      </div>
                    </div>
                  )}
                  {providerMsg && (
                    <p className={`text-xs ${providerMsg.includes('success') || providerMsg.includes('cleared') ? 'text-teal-700' : 'text-red-600'}`}>{providerMsg}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleAssignProvider}
                    disabled={providerAssigning}
                    className="w-full px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {providerAssigning ? 'Saving...' : selectedProviderId ? 'Assign Provider' : 'Clear Provider Assignment'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="Internal notes for this route..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
            <button type="submit" disabled={submitting}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50">
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditRouteModal;
