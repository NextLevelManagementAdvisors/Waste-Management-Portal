import React, { useState, useEffect, useMemo } from 'react';
import type { Driver } from '../../../shared/types/index.ts';

interface AdminProperty {
  id: string;
  address: string;
  serviceType: string;
  serviceStatus: string;
  ownerName: string;
  zoneName: string | null;
  zoneColor: string | null;
}

interface CreateRouteModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const CreateRouteModal: React.FC<CreateRouteModalProps> = ({ onClose, onCreated }) => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [properties, setProperties] = useState<AdminProperty[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [propertySearch, setPropertySearch] = useState('');
  const [form, setForm] = useState({
    title: '',
    scheduled_date: '',
    start_time: '',
    end_time: '',
    estimated_hours: '',
    base_pay: '',
    notes: '',
    assigned_driver_id: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/admin/drivers', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: Driver[] | { drivers: Driver[] }) => {
        setDrivers(Array.isArray(data) ? data : (data as any).drivers ?? []);
      })
      .catch(() => {});

    fetch('/api/admin/properties', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: AdminProperty[]) => {
        setProperties(data.filter(p => p.serviceStatus === 'approved'));
      })
      .catch(() => {});
  }, []);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const toggleProperty = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredProperties = useMemo(() => {
    const q = propertySearch.toLowerCase().trim();
    const list = q
      ? properties.filter(p =>
          p.address?.toLowerCase().includes(q) ||
          p.ownerName?.toLowerCase().includes(q) ||
          p.zoneName?.toLowerCase().includes(q)
        )
      : properties;

    // Selected items float to top
    return [...list].sort((a, b) => {
      const aSelected = selectedIds.has(a.id) ? 0 : 1;
      const bSelected = selectedIds.has(b.id) ? 0 : 1;
      return aSelected - bSelected;
    });
  }, [properties, propertySearch, selectedIds]);

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
      };
      if (form.start_time) body.start_time = form.start_time;
      if (form.end_time) body.end_time = form.end_time;
      if (form.estimated_hours) body.estimated_hours = Number(form.estimated_hours);
      if (form.base_pay) body.base_pay = Number(form.base_pay);
      if (form.notes.trim()) body.notes = form.notes.trim();
      if (form.assigned_driver_id) body.assigned_driver_id = form.assigned_driver_id;

      // Step 1: Create route
      const res = await fetch('/api/admin/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to create route.');
        return;
      }

      // Step 2: Add stops if any selected
      if (selectedIds.size > 0) {
        const route = await res.json();
        const stopsRes = await fetch(`/api/admin/routes/${route.id}/stops`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ propertyIds: [...selectedIds] }),
        });
        if (!stopsRes.ok) {
          // Route was created but stops failed — still close, user can add stops later
          console.error('Route created but failed to add stops');
        }
      }

      onCreated();
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
          <h2 className="text-lg font-black text-gray-900">Create Route</h2>
          <p className="text-sm text-gray-500 mt-0.5">Create a new route for driver assignment or bidding.</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Title <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.title}
              onChange={set('title')}
              placeholder="e.g. North Zone Residential Run"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          {/* Scheduled Date */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Scheduled Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={form.scheduled_date}
              onChange={set('scheduled_date')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          {/* Start / End time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Start Time</label>
              <input
                type="time"
                value={form.start_time}
                onChange={set('start_time')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">End Time</label>
              <input
                type="time"
                value={form.end_time}
                onChange={set('end_time')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
          </div>

          {/* Hours / Pay */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Est. Hours</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.estimated_hours}
                onChange={set('estimated_hours')}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Base Pay ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.base_pay}
                onChange={set('base_pay')}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
          </div>

          {/* Assign Driver */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Assign Driver <span className="text-gray-400 font-normal">(optional — leave blank for open bidding)</span></label>
            <select
              value={form.assigned_driver_id}
              onChange={set('assigned_driver_id')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="">Open for bidding</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Property / Stop Picker */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">
              Stops{selectedIds.size > 0 && <span className="ml-1 text-teal-600">({selectedIds.size} selected)</span>}
            </label>
            <input
              type="text"
              value={propertySearch}
              onChange={e => setPropertySearch(e.target.value)}
              placeholder="Search by address, customer, or zone..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
            <div className="mt-1 border border-gray-200 rounded-lg max-h-[200px] overflow-y-auto">
              {filteredProperties.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-gray-400">
                  {properties.length === 0 ? 'Loading properties...' : 'No matching properties'}
                </div>
              ) : (
                filteredProperties.map(p => {
                  const selected = selectedIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProperty(p.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0 ${
                        selected ? 'bg-teal-50' : ''
                      }`}
                    >
                      <span className={`w-4 h-4 flex-shrink-0 rounded border-2 flex items-center justify-center ${
                        selected ? 'bg-teal-600 border-teal-600' : 'border-gray-300'
                      }`}>
                        {selected && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        )}
                      </span>
                      {p.zoneColor && (
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.zoneColor }} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-gray-900 truncate">{p.address}</div>
                        <div className="text-xs text-gray-400 truncate">{p.ownerName}{p.zoneName ? ` — ${p.zoneName}` : ''}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={2}
              placeholder="Internal notes for this route..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Route'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateRouteModal;
