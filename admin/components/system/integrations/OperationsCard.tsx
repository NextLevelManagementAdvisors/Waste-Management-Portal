import React, { useState, useEffect } from 'react';
import { Button } from '../../../../components/Button.tsx';
import type { SettingItem } from './types';

interface OperationsCardProps {
  allSettings: SettingItem[];
  saving: boolean;
  saveSetting: (key: string, value: string) => Promise<boolean>;
  flashSuccess: (msg: string) => void;
}

const CONFLICT_STRATEGIES = [
  { value: 'skip', label: 'Skip', description: 'Leave unassigned if multiple zones match' },
  { value: 'nearest_center', label: 'Nearest Center', description: 'Assign to the zone whose center is closest' },
  { value: 'first_created', label: 'First Created', description: 'Assign to the oldest matching zone' },
] as const;

interface NumberFieldProps {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

function NumberField({ label, description, value, onChange, unit, min = 0, max, step = 1, placeholder }: NumberFieldProps) {
  const numVal = value ? Number(value) : undefined;
  const hasError = value !== '' && (isNaN(Number(value)) || (numVal !== undefined && (numVal < min || (max !== undefined && numVal > max))));

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-bold text-gray-700">{label}</label>
      <p className="text-xs text-gray-500">{description}</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          className={`w-32 px-3 py-1.5 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 transition-colors ${
            hasError
              ? 'border-red-300 focus:ring-red-500/30 bg-red-50'
              : 'border-gray-300 focus:ring-teal-500/30'
          }`}
        />
        <span className="text-xs text-gray-500">{unit}</span>
      </div>
      {hasError && (
        <p className="text-xs text-red-600">
          {isNaN(Number(value))
            ? 'Must be a number'
            : max !== undefined
              ? `Must be between ${min} and ${max}`
              : `Must be ${min} or greater`}
        </p>
      )}
    </div>
  );
}

const OperationsCard: React.FC<OperationsCardProps> = ({
  allSettings,
  saving: parentSaving,
  saveSetting,
  flashSuccess,
}) => {
  const [bidWindowHours, setBidWindowHours] = useState('');
  const [sameDayMinutes, setSameDayMinutes] = useState('');
  const [deadlineHours, setDeadlineHours] = useState('');
  const [conflictStrategy, setConflictStrategy] = useState('');
  const [localSaving, setLocalSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Track original values to detect changes
  const [originals, setOriginals] = useState({ bidWindowHours: '', sameDayMinutes: '', deadlineHours: '', conflictStrategy: '' });

  useEffect(() => {
    const get = (key: string) => allSettings.find(s => s.key === key)?.value || '';
    const vals = {
      bidWindowHours: get('BID_WINDOW_HOURS'),
      sameDayMinutes: get('SAME_DAY_BID_WINDOW_MINUTES'),
      deadlineHours: get('ZONE_ASSIGNMENT_DEADLINE_HOURS'),
      conflictStrategy: get('ZONE_AUTO_ASSIGN_CONFLICT_STRATEGY'),
    };
    setBidWindowHours(vals.bidWindowHours);
    setSameDayMinutes(vals.sameDayMinutes);
    setDeadlineHours(vals.deadlineHours);
    setConflictStrategy(vals.conflictStrategy);
    setOriginals(vals);
    setDirty(false);
  }, [allSettings]);

  // Track dirty state
  useEffect(() => {
    setDirty(
      bidWindowHours !== originals.bidWindowHours ||
      sameDayMinutes !== originals.sameDayMinutes ||
      deadlineHours !== originals.deadlineHours ||
      conflictStrategy !== originals.conflictStrategy
    );
  }, [bidWindowHours, sameDayMinutes, deadlineHours, conflictStrategy, originals]);

  const isValid = () => {
    const validNum = (v: string, min: number, max: number) =>
      v === '' || (!isNaN(Number(v)) && Number(v) >= min && Number(v) <= max);
    const validStrategy = (v: string) =>
      v === '' || CONFLICT_STRATEGIES.some(s => s.value === v);

    return (
      validNum(bidWindowHours, 1, 720) &&
      validNum(sameDayMinutes, 5, 1440) &&
      validNum(deadlineHours, 1, 720) &&
      validStrategy(conflictStrategy)
    );
  };

  const handleSave = async () => {
    if (!isValid()) return;
    setLocalSaving(true);

    const updates: [string, string][] = [];
    if (bidWindowHours !== originals.bidWindowHours) updates.push(['BID_WINDOW_HOURS', bidWindowHours]);
    if (sameDayMinutes !== originals.sameDayMinutes) updates.push(['SAME_DAY_BID_WINDOW_MINUTES', sameDayMinutes]);
    if (deadlineHours !== originals.deadlineHours) updates.push(['ZONE_ASSIGNMENT_DEADLINE_HOURS', deadlineHours]);
    if (conflictStrategy !== originals.conflictStrategy) updates.push(['ZONE_AUTO_ASSIGN_CONFLICT_STRATEGY', conflictStrategy]);

    let allOk = true;
    for (const [key, value] of updates) {
      const ok = await saveSetting(key, value);
      if (!ok) { allOk = false; break; }
    }

    if (allOk && updates.length > 0) {
      flashSuccess('Operations settings saved');
    }
    setLocalSaving(false);
  };

  const handleReset = () => {
    setBidWindowHours(originals.bidWindowHours);
    setSameDayMinutes(originals.sameDayMinutes);
    setDeadlineHours(originals.deadlineHours);
    setConflictStrategy(originals.conflictStrategy);
  };

  const isSaving = localSaving || parentSaving;

  return (
    <div className="space-y-5">
      {/* Bidding Settings */}
      <div>
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Bidding</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberField
            label="Advance Route Bid Window"
            description="How long drivers have to bid on routes scheduled in advance."
            value={bidWindowHours}
            onChange={setBidWindowHours}
            unit="hours"
            min={1}
            max={720}
            placeholder="e.g. 24"
          />
          <NumberField
            label="Same-Day Route Bid Window"
            description="How long drivers have to bid on same-day or urgent routes."
            value={sameDayMinutes}
            onChange={setSameDayMinutes}
            unit="minutes"
            min={5}
            max={1440}
            step={5}
            placeholder="e.g. 30"
          />
        </div>
      </div>

      {/* Zone Settings */}
      <div>
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Zone Assignment</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberField
            label="Assignment Deadline"
            description="How far in advance a zone must be assigned before the route date."
            value={deadlineHours}
            onChange={setDeadlineHours}
            unit="hours"
            min={1}
            max={720}
            placeholder="e.g. 72"
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-gray-700">Multi-Zone Conflict Strategy</label>
            <p className="text-xs text-gray-500">
              What happens when a location falls within multiple zones.
            </p>
            <select
              value={conflictStrategy}
              onChange={e => setConflictStrategy(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 bg-white"
            >
              <option value="">Not configured</option>
              {CONFLICT_STRATEGIES.map(s => (
                <option key={s.value} value={s.value}>{s.label} — {s.description}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Save / Reset */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <Button size="sm" onClick={handleSave} disabled={!dirty || !isValid() || isSaving}>
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
        {dirty && (
          <Button variant="secondary" size="sm" onClick={handleReset} disabled={isSaving}>
            Reset
          </Button>
        )}
        {!dirty && (
          <span className="text-xs text-gray-400">No unsaved changes</span>
        )}
      </div>
    </div>
  );
};

export default OperationsCard;
