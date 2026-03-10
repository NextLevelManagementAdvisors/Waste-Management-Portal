import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

const VEHICLE_TYPES = [
  { value: 'front_loader', label: 'Front Loader' },
  { value: 'rear_loader', label: 'Rear Loader' },
  { value: 'roll_off', label: 'Roll-Off' },
  { value: 'side_loader', label: 'Side Loader' },
  { value: 'other', label: 'Other' },
];

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  vehicle_type: string;
  ownership: string;
  vin?: string;
  license_plate?: string;
  dot_number?: string;
  registration_expires_at?: string;
  last_inspection_date?: string;
  status: string;
  notes?: string;
}

const blank = (): Omit<Vehicle, 'id'> => ({
  make: '', model: '', year: new Date().getFullYear(), vehicle_type: 'rear_loader',
  ownership: 'owned', vin: '', license_plate: '', dot_number: '',
  registration_expires_at: '', last_inspection_date: '', status: 'active', notes: '',
});

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return Math.ceil(diff);
}

function ComplianceBadge({ daysLeft, label }: { daysLeft: number | null; label: string }) {
  if (daysLeft === null) return null;
  if (daysLeft < 0) return <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">{label} expired</span>;
  if (daysLeft <= 30) return <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{label} in {daysLeft}d</span>;
  return null;
}

const ProviderFleetPanel: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/team/my-provider/vehicles', { credentials: 'include' });
      if (res.ok) setVehicles((await res.json()).vehicles || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const showMsg = (msg: string, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 4000);
  };

  const startAdd = () => { setForm(blank()); setEditingId(null); setShowForm(true); };
  const startEdit = (v: Vehicle) => {
    setForm({
      make: v.make, model: v.model, year: v.year, vehicle_type: v.vehicle_type,
      ownership: v.ownership, vin: v.vin || '', license_plate: v.license_plate || '',
      dot_number: v.dot_number || '', registration_expires_at: v.registration_expires_at?.slice(0, 10) || '',
      last_inspection_date: v.last_inspection_date?.slice(0, 10) || '', status: v.status, notes: v.notes || '',
    });
    setEditingId(v.id);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingId ? `/api/team/my-provider/vehicles/${editingId}` : '/api/team/my-provider/vehicles';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      showMsg(editingId ? 'Vehicle updated' : 'Vehicle added');
      setShowForm(false);
      setEditingId(null);
      load();
    } catch (err: any) {
      showMsg(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Remove ${label} from your fleet?`)) return;
    try {
      const res = await fetch(`/api/team/my-provider/vehicles/${id}`, { method: 'DELETE', credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to delete');
      showMsg('Vehicle removed');
      load();
    } catch (err: any) {
      showMsg(err.message, true);
    }
  };

  const field = (key: keyof typeof form, val: any) => setForm(f => ({ ...f, [key]: val }));

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Loading fleet...</div>;

  return (
    <div className="space-y-6">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-gray-900">Fleet ({vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''})</h3>
            <p className="text-xs text-gray-500 mt-0.5">Manage your trucks and equipment</p>
          </div>
          <Button size="sm" onClick={startAdd}>+ Add Vehicle</Button>
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <form onSubmit={handleSave} className="border border-gray-200 rounded-xl p-5 mb-5 bg-gray-50 space-y-4">
            <h4 className="font-bold text-sm text-gray-900">{editingId ? 'Edit Vehicle' : 'Add Vehicle'}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Make *</label>
                <input type="text" value={form.make} onChange={e => field('make', e.target.value)} required placeholder="e.g. Mack" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Model *</label>
                <input type="text" value={form.model} onChange={e => field('model', e.target.value)} required placeholder="e.g. LR" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Year *</label>
                <input type="number" value={form.year} onChange={e => field('year', parseInt(e.target.value))} required min={1990} max={new Date().getFullYear() + 1} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Vehicle Type</label>
                <select value={form.vehicle_type} onChange={e => field('vehicle_type', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {VEHICLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Ownership</label>
                <select value={form.ownership} onChange={e => field('ownership', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="owned">Owned</option>
                  <option value="leased">Leased</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Status</label>
                <select value={form.status} onChange={e => field('status', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">VIN</label>
                <input type="text" value={form.vin} onChange={e => field('vin', e.target.value)} placeholder="1HGBH41JXMN109186" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">License Plate</label>
                <input type="text" value={form.license_plate} onChange={e => field('license_plate', e.target.value)} placeholder="ABC-1234" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">DOT Number</label>
                <input type="text" value={form.dot_number} onChange={e => field('dot_number', e.target.value)} placeholder="1234567" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Registration Expires</label>
                <input type="date" value={form.registration_expires_at} onChange={e => field('registration_expires_at', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Last Inspection Date</label>
                <input type="date" value={form.last_inspection_date} onChange={e => field('last_inspection_date', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => field('notes', e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update' : 'Add Vehicle'}</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
            </div>
          </form>
        )}

        {vehicles.length === 0 && !showForm ? (
          <div className="py-8 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
            No vehicles in your fleet yet. Add your first truck above.
          </div>
        ) : (
          <div className="grid gap-4">
            {vehicles.map(v => {
              const regDays = daysUntil(v.registration_expires_at);
              const inspDays = v.last_inspection_date ? Math.ceil((Date.now() - new Date(v.last_inspection_date).getTime()) / (1000 * 60 * 60 * 24)) : null;
              const inspWarning = inspDays !== null && inspDays > 365;
              const regExpired = regDays !== null && regDays < 0;
              const label = `${v.year} ${v.make} ${v.model}`;

              return (
                <div key={v.id} className={`border rounded-xl p-4 ${regExpired ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-gray-900">{label}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          v.status === 'active' ? 'bg-green-100 text-green-800' :
                          v.status === 'maintenance' ? 'bg-amber-100 text-amber-800' :
                          'bg-gray-100 text-gray-600'
                        }`}>{v.status}</span>
                        <span className="text-xs text-gray-500 capitalize">{v.ownership}</span>
                        <span className="text-xs text-gray-500">{VEHICLE_TYPES.find(t => t.value === v.vehicle_type)?.label || v.vehicle_type}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                        {v.license_plate && <span>Plate: {v.license_plate}</span>}
                        {v.dot_number && <span>DOT: {v.dot_number}</span>}
                        {v.vin && <span>VIN: {v.vin}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <ComplianceBadge daysLeft={regDays} label="Registration" />
                        {inspWarning && (
                          <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            Inspection {inspDays}d ago
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-3 flex-shrink-0">
                      <button type="button" onClick={() => startEdit(v)} className="text-xs text-blue-600 hover:underline">Edit</button>
                      <button type="button" onClick={() => handleDelete(v.id, label)} className="text-xs text-red-600 hover:underline">Remove</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

export default ProviderFleetPanel;
