import React, { useState, useEffect, useCallback } from 'react';

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

const DAY_CHANGE_OPTIONS = [
  { value: 'flexible', label: 'Flexible' },
  { value: 'prefer_current', label: 'Prefer Current' },
  { value: 'do_not_change', label: 'Do Not Change' },
];

interface Requirements {
  difficultyScore: number;
  customRate: number | null;
  requiredEquipment: string[];
  requiredCertifications: string[];
  minDriverRating: number;
  dayChangePreference: string;
}

interface LocationRequirementsCardProps {
  locationId: string;
}

const LocationRequirementsCard: React.FC<LocationRequirementsCardProps> = ({ locationId }) => {
  const [reqs, setReqs] = useState<Requirements | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<Requirements>({
    difficultyScore: 1.0, customRate: null, requiredEquipment: [], requiredCertifications: [], minDriverRating: 0, dayChangePreference: 'flexible',
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/locations/${locationId}/requirements`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setReqs(data.requirements);
        setForm(data.requirements);
      }
    } catch { /* ignore */ }
  }, [locationId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const body = {
        ...form,
        customRate: form.customRate != null ? Number(form.customRate) : null,
      };
      const res = await fetch(`/api/admin/locations/${locationId}/requirements`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      const data = await res.json();
      setReqs(data.requirements);
      setForm(data.requirements);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving');
    } finally {
      setSaving(false);
    }
  };

  const toggleArrayItem = (field: 'requiredEquipment' | 'requiredCertifications', item: string) => {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(item) ? prev[field].filter(i => i !== item) : [...prev[field], item],
    }));
  };

  const formatLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // Don't render anything until loaded to avoid layout shift
  const hasRequirements = reqs && (
    reqs.difficultyScore !== 1.0 ||
    reqs.customRate != null ||
    reqs.requiredEquipment.length > 0 ||
    reqs.requiredCertifications.length > 0 ||
    reqs.minDriverRating > 0 ||
    reqs.dayChangePreference !== 'flexible'
  );

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Compensation & Requirements</h4>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-[10px] text-teal-600 hover:text-teal-700 font-medium">
            {hasRequirements ? 'Edit' : 'Configure'}
          </button>
        )}
      </div>

      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}

      {!editing ? (
        hasRequirements ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
            {reqs!.customRate != null && <span>Custom rate: ${reqs!.customRate.toFixed(2)}</span>}
            {reqs!.difficultyScore !== 1.0 && <span>Difficulty: {reqs!.difficultyScore}</span>}
            {reqs!.minDriverRating > 0 && <span>Min rating: {reqs!.minDriverRating.toFixed(1)}</span>}
            {reqs!.requiredEquipment.length > 0 && (
              <span>Equipment: {reqs!.requiredEquipment.map(formatLabel).join(', ')}</span>
            )}
            {reqs!.requiredCertifications.length > 0 && (
              <span>Certs: {reqs!.requiredCertifications.map(formatLabel).join(', ')}</span>
            )}
            {reqs!.dayChangePreference !== 'flexible' && (
              <span>Day change: {DAY_CHANGE_OPTIONS.find(o => o.value === reqs!.dayChangePreference)?.label}</span>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400">Using default compensation rules</p>
        )
      ) : (
        <div className="space-y-3 bg-gray-50 rounded-lg p-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Difficulty Score</label>
              <input type="number" step="0.1" min="0.1" max="5.0" value={form.difficultyScore}
                onChange={e => setForm({ ...form, difficultyScore: parseFloat(e.target.value) || 1.0 })}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <p className="text-[9px] text-gray-400 mt-0.5">1.0 = standard</p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Custom Rate ($)</label>
              <input type="number" step="0.01" min="0" value={form.customRate ?? ''}
                onChange={e => setForm({ ...form, customRate: e.target.value ? parseFloat(e.target.value) : null })}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Auto" />
              <p className="text-[9px] text-gray-400 mt-0.5">Overrides rules engine</p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Min Driver Rating</label>
              <input type="number" step="0.1" min="0" max="5" value={form.minDriverRating}
                onChange={e => setForm({ ...form, minDriverRating: parseFloat(e.target.value) || 0 })}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Day Change Preference</label>
            <select value={form.dayChangePreference}
              onChange={e => setForm({ ...form, dayChangePreference: e.target.value })}
              className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              {DAY_CHANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Required Equipment</label>
            <div className="flex flex-wrap gap-1.5">
              {EQUIPMENT_OPTIONS.map(opt => (
                <button key={opt} type="button" onClick={() => toggleArrayItem('requiredEquipment', opt)}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                    form.requiredEquipment.includes(opt) ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-400 border-gray-200'
                  }`}>
                  {formatLabel(opt)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Required Certifications</label>
            <div className="flex flex-wrap gap-1.5">
              {CERTIFICATION_OPTIONS.map(opt => (
                <button key={opt} type="button" onClick={() => toggleArrayItem('requiredCertifications', opt)}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                    form.requiredCertifications.includes(opt) ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-white text-gray-400 border-gray-200'
                  }`}>
                  {formatLabel(opt)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="px-3 py-1 bg-teal-600 text-white text-xs font-medium rounded hover:bg-teal-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => { setEditing(false); if (reqs) setForm(reqs); setError(''); }}
              className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationRequirementsCard;
