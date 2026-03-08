import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';

const EQUIPMENT_OPTIONS = [
  'residential_truck',
  'commercial_dumpster',
  'bulk_trailer',
  'roll_off',
  'front_load',
  'rear_load',
];

const CERTIFICATION_OPTIONS = [
  'hazmat',
  'cdl_a',
  'cdl_b',
  'gated_community',
  'medical_waste',
  'construction_debris',
];

interface DriverQualificationsCardProps {
  driverId: string;
}

interface Qualifications {
  equipmentTypes: string[];
  certifications: string[];
  maxOrdersPerDay: number;
  minRatingForAssignment: number;
}

const DriverQualificationsCard: React.FC<DriverQualificationsCardProps> = ({ driverId }) => {
  const [quals, setQuals] = useState<Qualifications | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<Qualifications>({ equipmentTypes: [], certifications: [], maxOrdersPerDay: 50, minRatingForAssignment: 0 });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/drivers/${driverId}/qualifications`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setQuals(data.qualifications);
        setForm(data.qualifications);
      }
    } catch { /* ignore */ }
  }, [driverId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/drivers/${driverId}/qualifications`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      const data = await res.json();
      setQuals(data.qualifications);
      setForm(data.qualifications);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving');
    } finally {
      setSaving(false);
    }
  };

  const toggleArrayItem = (field: 'equipmentTypes' | 'certifications', item: string) => {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(item) ? prev[field].filter(i => i !== item) : [...prev[field], item],
    }));
  };

  const formatLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <Card className="p-6 lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-black text-gray-500 uppercase tracking-wider">Qualifications</h3>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-teal-600 hover:text-teal-700 font-medium">
            Edit
          </button>
        )}
      </div>

      {error && <div className="text-xs text-red-600 mb-3">{error}</div>}

      {!editing ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-[10px] font-bold text-gray-400 uppercase mb-1">Equipment Types</dt>
            <dd className="flex flex-wrap gap-1">
              {(quals?.equipmentTypes || []).length > 0
                ? quals!.equipmentTypes.map(e => (
                  <span key={e} className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{formatLabel(e)}</span>
                ))
                : <span className="text-xs text-gray-400">None set</span>
              }
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold text-gray-400 uppercase mb-1">Certifications</dt>
            <dd className="flex flex-wrap gap-1">
              {(quals?.certifications || []).length > 0
                ? quals!.certifications.map(c => (
                  <span key={c} className="text-[10px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">{formatLabel(c)}</span>
                ))
                : <span className="text-xs text-gray-400">None set</span>
              }
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold text-gray-400 uppercase mb-1">Max Orders/Day</dt>
            <dd className="text-sm font-medium text-gray-900">{quals?.maxOrdersPerDay ?? 50}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold text-gray-400 uppercase mb-1">Min Rating for Assignment</dt>
            <dd className="text-sm font-medium text-gray-900">{Number(quals?.minRatingForAssignment ?? 0).toFixed(1)}</dd>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Equipment Types</label>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_OPTIONS.map(opt => (
                <button key={opt} type="button" onClick={() => toggleArrayItem('equipmentTypes', opt)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
                    form.equipmentTypes.includes(opt) ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}>
                  {formatLabel(opt)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Certifications</label>
            <div className="flex flex-wrap gap-2">
              {CERTIFICATION_OPTIONS.map(opt => (
                <button key={opt} type="button" onClick={() => toggleArrayItem('certifications', opt)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
                    form.certifications.includes(opt) ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}>
                  {formatLabel(opt)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Max Orders/Day</label>
              <input type="number" min="1" max="200" value={form.maxOrdersPerDay}
                onChange={e => setForm({ ...form, maxOrdersPerDay: parseInt(e.target.value) || 50 })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Min Rating for Assignment</label>
              <input type="number" step="0.1" min="0" max="5" value={form.minRatingForAssignment}
                onChange={e => setForm({ ...form, minRatingForAssignment: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-1.5 bg-teal-600 text-white text-sm font-medium rounded hover:bg-teal-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => { setEditing(false); setForm(quals || { equipmentTypes: [], certifications: [], maxOrdersPerDay: 50, minRatingForAssignment: 0 }); setError(''); }}
              className="px-4 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
};

export default DriverQualificationsCard;
