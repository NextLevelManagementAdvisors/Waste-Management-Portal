import React, { useState, useEffect, useMemo } from 'react';
import type { Driver, Route, RouteStop } from '../../../shared/types/index.ts';

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

const EditRouteModal: React.FC<EditRouteModalProps> = ({ route, onClose, onUpdated }) => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [form, setForm] = useState({
    title: route.title,
    scheduled_date: route.scheduled_date?.split('T')[0] ?? '',
    start_time: route.start_time ?? '',
    end_time: route.end_time ?? '',
    estimated_hours: route.estimated_hours != null ? String(route.estimated_hours) : '',
    base_pay: route.base_pay != null ? String(route.base_pay) : '',
    notes: route.notes ?? '',
    assigned_driver_id: route.assigned_driver_id ?? '',
    status: route.status,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Stop management state
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [stopsLoading, setStopsLoading] = useState(true);
  const [properties, setProperties] = useState<AdminProperty[]>([]);
  const [propertySearch, setPropertySearch] = useState('');
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());
  const [addingStops, setAddingStops] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const isReadOnly = route.status === 'completed' || route.status === 'cancelled';

  useEffect(() => {
    fetch('/api/admin/drivers', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: Driver[] | { drivers: Driver[] }) => {
        setDrivers(Array.isArray(data) ? data : (data as any).drivers ?? []);
      })
      .catch(() => {});

    fetchStops();

    if (!isReadOnly) {
      fetch('/api/admin/properties', { credentials: 'include' })
        .then(r => r.ok ? r.json() : [])
        .then((data: AdminProperty[]) => setProperties(data.filter(p => p.serviceStatus === 'approved')))
        .catch(() => {});
    }
  }, []);

  const fetchStops = async () => {
    setStopsLoading(true);
    try {
      const res = await fetch(`/api/admin/routes/${route.id}/stops`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStops(data.stops ?? []);
      }
    } catch (e) {
      console.error('Failed to load stops:', e);
    } finally {
      setStopsLoading(false);
    }
  };

  const handleRemoveStop = async (stopId: string) => {
    try {
      const res = await fetch(`/api/admin/routes/${route.id}/stops/${stopId}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setStops(prev => prev.filter(s => s.id !== stopId));
      }
    } catch (e) {
      console.error('Failed to remove stop:', e);
    }
  };

  const handleAddStops = async () => {
    if (selectedPropertyIds.size === 0) return;
    setAddingStops(true);
    try {
      const res = await fetch(`/api/admin/routes/${route.id}/stops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ propertyIds: [...selectedPropertyIds] }),
      });
      if (res.ok) {
        setSelectedPropertyIds(new Set());
        setPropertySearch('');
        setShowPicker(false);
        await fetchStops();
      }
    } catch (e) {
      console.error('Failed to add stops:', e);
    } finally {
      setAddingStops(false);
    }
  };

  const toggleProperty = (id: string) => {
    setSelectedPropertyIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Filter out properties already on the route
  const existingPropertyIds = useMemo(() => new Set(stops.map(s => s.property_id).filter(Boolean)), [stops]);

  const filteredProperties = useMemo(() => {
    const available = properties.filter(p => !existingPropertyIds.has(p.id));
    const q = propertySearch.toLowerCase().trim();
    const list = q
      ? available.filter(p =>
          p.address?.toLowerCase().includes(q) ||
          p.ownerName?.toLowerCase().includes(q) ||
          p.zoneName?.toLowerCase().includes(q)
        )
      : available;
    return [...list].sort((a, b) => {
      const aSelected = selectedPropertyIds.has(a.id) ? 0 : 1;
      const bSelected = selectedPropertyIds.has(b.id) ? 0 : 1;
      return aSelected - bSelected;
    });
  }, [properties, propertySearch, selectedPropertyIds, existingPropertyIds]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim() || !form.scheduled_date) {
      setError('Title and scheduled date are required.');
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, any> = {
        title: form.title.trim(),
        scheduled_date: form.scheduled_date,
        status: form.status,
      };
      if (form.start_time) body.start_time = form.start_time;
      else body.start_time = null;
      if (form.end_time) body.end_time = form.end_time;
      else body.end_time = null;
      if (form.estimated_hours) body.estimated_hours = Number(form.estimated_hours);
      else body.estimated_hours = null;
      if (form.base_pay) body.base_pay = Number(form.base_pay);
      else body.base_pay = null;
      if (form.notes.trim()) body.notes = form.notes.trim();
      else body.notes = null;
      if (form.assigned_driver_id) body.assigned_driver_id = form.assigned_driver_id;
      else body.assigned_driver_id = null;

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
          <p className="text-sm text-gray-500 mt-0.5">Update route details, manage stops, or assign a driver.</p>
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
            <input type="date" value={form.scheduled_date} onChange={set('scheduled_date')}
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
              <input type="number" min="0" step="0.01" value={form.base_pay} onChange={set('base_pay')} placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>
          </div>

          {/* Stops Section */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">
              Stops <span className="text-teal-600">({stops.length})</span>
            </label>

            {stopsLoading ? (
              <div className="text-xs text-gray-400 py-2">Loading stops...</div>
            ) : stops.length === 0 ? (
              <div className="text-xs text-gray-400 py-2">No stops on this route yet.</div>
            ) : (
              <div className="border border-gray-200 rounded-lg max-h-[160px] overflow-y-auto divide-y divide-gray-50">
                {stops.map(s => (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <div className="text-gray-900 truncate">{s.address}</div>
                      <div className="text-xs text-gray-400 truncate">{s.customer_name}</div>
                    </div>
                    <span className={`text-[10px] font-bold flex-shrink-0 ${
                      s.order_type === 'special' ? 'text-purple-600' : s.order_type === 'missed_redo' ? 'text-red-600' : 'text-gray-400'
                    }`}>{s.order_type}</span>
                    {!isReadOnly && (
                      <button type="button" onClick={() => handleRemoveStop(s.id)}
                        className="text-red-400 hover:text-red-600 font-bold flex-shrink-0" title="Remove stop">
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add stops picker */}
            {!isReadOnly && (
              <div className="mt-2">
                {!showPicker ? (
                  <button type="button" onClick={() => setShowPicker(true)}
                    className="text-xs font-bold text-teal-600 hover:text-teal-800 transition-colors">
                    + Add Stops
                  </button>
                ) : (
                  <div className="border border-teal-200 rounded-lg p-2 bg-teal-50/30">
                    <input type="text" value={propertySearch} onChange={e => setPropertySearch(e.target.value)}
                      placeholder="Search by address, customer, or zone..."
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white" />
                    <div className="mt-1 border border-gray-200 rounded-lg max-h-[150px] overflow-y-auto bg-white">
                      {filteredProperties.length === 0 ? (
                        <div className="px-3 py-3 text-center text-xs text-gray-400">
                          {properties.length === 0 ? 'Loading...' : 'No matching properties'}
                        </div>
                      ) : (
                        filteredProperties.map(p => {
                          const selected = selectedPropertyIds.has(p.id);
                          return (
                            <button key={p.id} type="button" onClick={() => toggleProperty(p.id)}
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
                      <button type="button" onClick={() => { setShowPicker(false); setSelectedPropertyIds(new Set()); setPropertySearch(''); }}
                        className="text-xs font-bold text-gray-500 hover:text-gray-700">Cancel</button>
                      <button type="button" onClick={handleAddStops} disabled={selectedPropertyIds.size === 0 || addingStops}
                        className="px-3 py-1 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg transition-colors">
                        {addingStops ? 'Adding...' : `Add ${selectedPropertyIds.size} Stop${selectedPropertyIds.size !== 1 ? 's' : ''}`}
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
            <select value={form.assigned_driver_id} onChange={set('assigned_driver_id')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500">
              <option value="">Unassigned</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

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
