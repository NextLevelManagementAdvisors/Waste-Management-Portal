import React, { useState, useEffect } from 'react';
import { Button } from '../../../../components/Button.tsx';
import type { SettingItem } from './types';
import SettingField from './SettingField.tsx';

interface OptimoRouteCardProps {
  settings: SettingItem[];
  allSettings: SettingItem[];
  editingKey: string | null;
  editValue: string;
  saving: boolean;
  onStartEdit: (setting: SettingItem) => void;
  onSave: (key: string) => void;
  onCancel: () => void;
  onEditValueChange: (value: string) => void;
  saveSetting: (key: string, value: string) => Promise<boolean>;
  flashSuccess: (msg: string) => void;
  flashError: (msg: string) => void;
}

const CUSTOM_UI_KEYS = [
  'OPTIMO_SYNC_ENABLED', 'OPTIMO_SYNC_HOUR', 'OPTIMO_SYNC_WINDOW_DAYS',
  'PICKUP_OPTIMIZATION_WINDOW_DAYS', 'PICKUP_OPTIMIZATION_METRIC',
  'PICKUP_AUTO_ASSIGN', 'PICKUP_AUTO_APPROVE',
  'PICKUP_AUTO_APPROVE_MAX_MILES', 'PICKUP_AUTO_APPROVE_MAX_MINUTES',
];

const OptimoRouteCard: React.FC<OptimoRouteCardProps> = ({
  settings,
  allSettings,
  editingKey,
  editValue,
  saving,
  onStartEdit,
  onSave,
  onCancel,
  onEditValueChange,
  saveSetting,
  flashSuccess,
  flashError,
}) => {
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [syncHour, setSyncHour] = useState('6');
  const [syncWindow, setSyncWindow] = useState('28');
  const [savingSync, setSavingSync] = useState(false);

  // Optimization settings
  const [optWindowDays, setOptWindowDays] = useState('7');
  const [optMetric, setOptMetric] = useState<'distance' | 'time' | 'both'>('distance');
  const [autoAssign, setAutoAssign] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
  const [maxMiles, setMaxMiles] = useState('');
  const [maxMinutes, setMaxMinutes] = useState('');
  const [savingOpt, setSavingOpt] = useState(false);

  useEffect(() => {
    const enabledSetting = allSettings.find(s => s.key === 'OPTIMO_SYNC_ENABLED');
    if (enabledSetting?.value === 'true' || enabledSetting?.value === 'false') {
      setSyncEnabled(enabledSetting.value === 'true');
    }
    const hourSetting = allSettings.find(s => s.key === 'OPTIMO_SYNC_HOUR');
    if (hourSetting?.value) setSyncHour(hourSetting.value);
    const windowSetting = allSettings.find(s => s.key === 'OPTIMO_SYNC_WINDOW_DAYS');
    if (windowSetting?.value) setSyncWindow(windowSetting.value);

    // Optimization settings
    const optWindow = allSettings.find(s => s.key === 'PICKUP_OPTIMIZATION_WINDOW_DAYS');
    if (optWindow?.value) setOptWindowDays(optWindow.value);

    const metric = allSettings.find(s => s.key === 'PICKUP_OPTIMIZATION_METRIC');
    if (metric?.value && ['distance', 'time', 'both'].includes(metric.value)) {
      setOptMetric(metric.value as 'distance' | 'time' | 'both');
    }

    const autoAssignSetting = allSettings.find(s => s.key === 'PICKUP_AUTO_ASSIGN');
    if (autoAssignSetting?.value === 'true' || autoAssignSetting?.value === 'false') {
      setAutoAssign(autoAssignSetting.value === 'true');
    }

    const autoApproveSetting = allSettings.find(s => s.key === 'PICKUP_AUTO_APPROVE');
    if (autoApproveSetting?.value === 'true' || autoApproveSetting?.value === 'false') {
      setAutoApprove(autoApproveSetting.value === 'true');
    }

    const maxMilesSetting = allSettings.find(s => s.key === 'PICKUP_AUTO_APPROVE_MAX_MILES');
    if (maxMilesSetting?.value && maxMilesSetting.value !== '0') setMaxMiles(maxMilesSetting.value);

    const maxMinutesSetting = allSettings.find(s => s.key === 'PICKUP_AUTO_APPROVE_MAX_MINUTES');
    if (maxMinutesSetting?.value && maxMinutesSetting.value !== '0') setMaxMinutes(maxMinutesSetting.value);
  }, [allSettings]);

  const handleSyncToggle = async () => {
    const newValue = !syncEnabled;
    setSyncEnabled(newValue);
    setSavingSync(true);
    const ok = await saveSetting('OPTIMO_SYNC_ENABLED', String(newValue));
    if (ok) flashSuccess(`Auto sync ${newValue ? 'enabled' : 'disabled'}`);
    else setSyncEnabled(!newValue);
    setSavingSync(false);
  };

  const handleSyncHourSave = async () => {
    const h = parseInt(syncHour, 10);
    if (isNaN(h) || h < 0 || h > 23) {
      flashError('Sync hour must be 0-23');
      return;
    }
    setSavingSync(true);
    const ok = await saveSetting('OPTIMO_SYNC_HOUR', String(h));
    if (ok) flashSuccess('Sync hour updated');
    setSavingSync(false);
  };

  const handleSyncWindowSave = async () => {
    const w = parseInt(syncWindow, 10);
    if (isNaN(w) || w < 7 || w > 90) {
      flashError('Sync window must be 7-90 days');
      return;
    }
    setSavingSync(true);
    const ok = await saveSetting('OPTIMO_SYNC_WINDOW_DAYS', String(w));
    if (ok) flashSuccess('Sync window updated');
    setSavingSync(false);
  };

  // --- Optimization handlers ---

  const handleOptWindowSave = async () => {
    const w = parseInt(optWindowDays, 10);
    if (isNaN(w) || w < 1 || w > 90) {
      flashError('Optimization window must be 1\u201390 days');
      return;
    }
    setSavingOpt(true);
    const ok = await saveSetting('PICKUP_OPTIMIZATION_WINDOW_DAYS', String(w));
    if (ok) flashSuccess('Optimization window updated');
    setSavingOpt(false);
  };

  const handleOptMetricSave = async (value: 'distance' | 'time' | 'both') => {
    const prev = optMetric;
    setOptMetric(value);
    setSavingOpt(true);
    const ok = await saveSetting('PICKUP_OPTIMIZATION_METRIC', value);
    if (ok) flashSuccess('Optimization metric updated');
    else setOptMetric(prev);
    setSavingOpt(false);
  };

  const handleAutoAssignToggle = async () => {
    const newValue = !autoAssign;
    setAutoAssign(newValue);
    setSavingOpt(true);
    const ok = await saveSetting('PICKUP_AUTO_ASSIGN', String(newValue));
    if (ok) flashSuccess(`Auto-assign pickup day ${newValue ? 'enabled' : 'disabled'}`);
    else setAutoAssign(!newValue);
    setSavingOpt(false);
  };

  const handleAutoApproveToggle = async () => {
    const newValue = !autoApprove;
    setAutoApprove(newValue);
    setSavingOpt(true);
    const ok = await saveSetting('PICKUP_AUTO_APPROVE', String(newValue));
    if (ok) flashSuccess(`Auto-approve ${newValue ? 'enabled' : 'disabled'}`);
    else setAutoApprove(!newValue);
    setSavingOpt(false);
  };

  const handleMaxMilesSave = async () => {
    if (maxMiles !== '' && maxMiles !== '0') {
      const v = parseFloat(maxMiles);
      if (isNaN(v) || v < 0) {
        flashError('Max distance must be a positive number or empty (no limit)');
        return;
      }
    }
    setSavingOpt(true);
    const ok = await saveSetting('PICKUP_AUTO_APPROVE_MAX_MILES', maxMiles || '0');
    if (ok) flashSuccess(maxMiles && maxMiles !== '0' ? `Max distance set to ${maxMiles} miles` : 'Max distance limit removed');
    setSavingOpt(false);
  };

  const handleMaxMinutesSave = async () => {
    if (maxMinutes !== '' && maxMinutes !== '0') {
      const v = parseFloat(maxMinutes);
      if (isNaN(v) || v < 0) {
        flashError('Max time must be a positive number or empty (no limit)');
        return;
      }
    }
    setSavingOpt(true);
    const ok = await saveSetting('PICKUP_AUTO_APPROVE_MAX_MINUTES', maxMinutes || '0');
    if (ok) flashSuccess(maxMinutes && maxMinutes !== '0' ? `Max time set to ${maxMinutes} minutes` : 'Max time limit removed');
    setSavingOpt(false);
  };

  // Standard settings (API key) — exclude settings that have custom UI
  const standardSettings = settings.filter(s => !CUSTOM_UI_KEYS.includes(s.key));

  return (
    <div className="space-y-3">
      {/* Sync Enabled Toggle */}
      <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div>
          <p className="text-sm font-bold text-gray-800">Automated Daily Sync</p>
          <p className="text-xs text-gray-500">Automatically create pickup orders in OptimoRoute each day</p>
        </div>
        <button
          type="button"
          title={syncEnabled ? 'Disable auto sync' : 'Enable auto sync'}
          onClick={handleSyncToggle}
          disabled={savingSync}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${syncEnabled ? 'bg-teal-600' : 'bg-gray-200'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${syncEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Sync Hour + Window */}
      <div className="flex items-end gap-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="flex-1">
          <label className="block text-xs font-bold text-gray-500 mb-1">Run sync at (hour, 0-23)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={23}
              value={syncHour}
              onChange={e => setSyncHour(e.target.value)}
              className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <span className="text-xs text-gray-400">:00 server time</span>
            <Button size="sm" variant="secondary" onClick={handleSyncHourSave} disabled={savingSync}>
              Save
            </Button>
          </div>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold text-gray-500 mb-1">Plan ahead (days)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={7}
              max={90}
              value={syncWindow}
              onChange={e => setSyncWindow(e.target.value)}
              className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <span className="text-xs text-gray-400">days</span>
            <Button size="sm" variant="secondary" onClick={handleSyncWindowSave} disabled={savingSync}>
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* ── Pickup Day Optimization ── */}
      <div className="flex items-center gap-2 pt-2 pb-1">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Pickup Day Optimization</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {/* Auto-Assign Toggle */}
      <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div>
          <p className="text-sm font-bold text-gray-800">Auto-Assign Pickup Day</p>
          <p className="text-xs text-gray-500">Automatically determine the optimal pickup day when a customer signs up</p>
        </div>
        <button
          type="button"
          title={autoAssign ? 'Disable auto-assign' : 'Enable auto-assign'}
          onClick={handleAutoAssignToggle}
          disabled={savingOpt}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${autoAssign ? 'bg-teal-600' : 'bg-gray-200'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${autoAssign ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Auto-Approve Toggle */}
      <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div>
          <p className="text-sm font-bold text-gray-800">Auto-Approve Addresses in Zone</p>
          <p className="text-xs text-gray-500">Automatically approve new addresses that fall within a recognized service zone</p>
        </div>
        <button
          type="button"
          title={autoApprove ? 'Disable auto-approve' : 'Enable auto-approve'}
          onClick={handleAutoApproveToggle}
          disabled={savingOpt || !autoAssign}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${autoApprove && autoAssign ? 'bg-teal-600' : 'bg-gray-200'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${autoApprove && autoAssign ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Auto-Approve Thresholds (only shown when auto-approve is enabled) */}
      {autoApprove && autoAssign && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-3 ml-4 border-l-4 border-l-teal-200">
          <p className="text-xs font-bold text-gray-500">Auto-Approve Thresholds</p>
          <p className="text-xs text-gray-400">
            Set maximum route insertion costs for auto-approval. Leave empty or 0 for no limit.
            If either threshold is exceeded, the address stays as pending review.
          </p>
          {/* Max Distance */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Max Distance Increase</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={0.5}
                value={maxMiles}
                onChange={e => setMaxMiles(e.target.value)}
                placeholder="No limit"
                className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <span className="text-xs text-gray-400">miles</span>
              <Button size="sm" variant="secondary" onClick={handleMaxMilesSave} disabled={savingOpt}>
                Save
              </Button>
            </div>
          </div>
          {/* Max Time */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Max Time Increase</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={1}
                value={maxMinutes}
                onChange={e => setMaxMinutes(e.target.value)}
                placeholder="No limit"
                className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <span className="text-xs text-gray-400">minutes</span>
              <Button size="sm" variant="secondary" onClick={handleMaxMinutesSave} disabled={savingOpt}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Optimization Window + Metric */}
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
        {/* Window Days */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">Route History Window</label>
          <p className="text-xs text-gray-400 mb-1.5">How many days of past route data to analyze when calculating optimal pickup days</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={90}
              value={optWindowDays}
              onChange={e => setOptWindowDays(e.target.value)}
              className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <span className="text-xs text-gray-400">days</span>
            <Button size="sm" variant="secondary" onClick={handleOptWindowSave} disabled={savingOpt}>
              Save
            </Button>
          </div>
        </div>

        {/* Optimization Metric */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">Optimization Metric</label>
          <p className="text-xs text-gray-400 mb-1.5">Which factor to prioritize when choosing the best pickup day</p>
          <div className="flex flex-wrap gap-2">
            {([
              { value: 'distance' as const, label: 'Distance', desc: 'Minimize extra miles' },
              { value: 'time' as const, label: 'Time', desc: 'Minimize travel time' },
              { value: 'both' as const, label: 'Both', desc: 'Balance distance & time' },
            ]).map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleOptMetricSave(option.value)}
                disabled={savingOpt}
                className={`px-3 py-2 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50 ${
                  optMetric === option.value
                    ? 'bg-teal-50 border-teal-300 text-teal-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="block">{option.label}</span>
                <span className="block text-[10px] font-normal opacity-70">{option.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Standard settings (API Key) */}
      {standardSettings.map(setting => (
        <SettingField
          key={setting.key}
          setting={setting}
          isEditing={editingKey === setting.key}
          editValue={editValue}
          saving={saving}
          onStartEdit={() => onStartEdit(setting)}
          onSave={() => onSave(setting.key)}
          onCancel={onCancel}
          onEditValueChange={onEditValueChange}
        />
      ))}
    </div>
  );
};

export default OptimoRouteCard;
