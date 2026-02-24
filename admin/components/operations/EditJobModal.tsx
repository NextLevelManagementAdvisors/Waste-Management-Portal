import React, { useState, useEffect } from 'react';
import type { Driver, RouteJob } from '../../../shared/types/index.ts';
import AddressAutocomplete from '../../../components/AddressAutocomplete.tsx';

interface EditJobModalProps {
  job: RouteJob;
  onClose: () => void;
  onUpdated: () => void;
}

const EditJobModal: React.FC<EditJobModalProps> = ({ job, onClose, onUpdated }) => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [form, setForm] = useState({
    title: job.title,
    area: job.area ?? '',
    scheduled_date: job.scheduled_date?.split('T')[0] ?? '',
    start_time: job.start_time ?? '',
    end_time: job.end_time ?? '',
    estimated_stops: job.estimated_stops != null ? String(job.estimated_stops) : '',
    estimated_hours: job.estimated_hours != null ? String(job.estimated_hours) : '',
    base_pay: job.base_pay != null ? String(job.base_pay) : '',
    notes: job.notes ?? '',
    assigned_driver_id: job.assigned_driver_id ?? '',
    status: job.status,
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
  }, []);

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
      if (form.area.trim()) body.area = form.area.trim();
      else body.area = null;
      if (form.start_time) body.start_time = form.start_time;
      else body.start_time = null;
      if (form.end_time) body.end_time = form.end_time;
      else body.end_time = null;
      if (form.estimated_stops) body.estimated_stops = Number(form.estimated_stops);
      else body.estimated_stops = null;
      if (form.estimated_hours) body.estimated_hours = Number(form.estimated_hours);
      else body.estimated_hours = null;
      if (form.base_pay) body.base_pay = Number(form.base_pay);
      else body.base_pay = null;
      if (form.notes.trim()) body.notes = form.notes.trim();
      else body.notes = null;
      if (form.assigned_driver_id) body.assigned_driver_id = form.assigned_driver_id;
      else body.assigned_driver_id = null;

      const res = await fetch(`/api/admin/jobs/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to update job.');
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
          <h2 className="text-lg font-black text-gray-900">Edit Route Job</h2>
          <p className="text-sm text-gray-500 mt-0.5">Update job details, status, or driver assignment.</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Title <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.title}
              onChange={set('title')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          {/* Address + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Address</label>
              <AddressAutocomplete
                value={form.area}
                onChange={(val) => setForm(prev => ({ ...prev, area: val }))}
                onAddressSelect={(addr) => setForm(prev => ({ ...prev, area: `${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}`.replace(/^, |, $/g, '') }))}
                placeholder="e.g. 123 Main St"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Scheduled Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={form.scheduled_date}
                onChange={set('scheduled_date')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
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

          {/* Stops / Hours / Pay */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Est. Stops</label>
              <input
                type="number"
                min="0"
                value={form.estimated_stops}
                onChange={set('estimated_stops')}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
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

          {/* Status */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Status</label>
            <select
              value={form.status}
              onChange={set('status')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
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
            <select
              value={form.assigned_driver_id}
              onChange={set('assigned_driver_id')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="">Unassigned</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={3}
              placeholder="Internal notes for this job..."
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
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditJobModal;
