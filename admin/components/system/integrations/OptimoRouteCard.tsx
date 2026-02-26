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

const SYNC_KEYS = ['OPTIMO_SYNC_ENABLED', 'OPTIMO_SYNC_HOUR', 'OPTIMO_SYNC_WINDOW_DAYS'];

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

  useEffect(() => {
    const enabledSetting = allSettings.find(s => s.key === 'OPTIMO_SYNC_ENABLED');
    if (enabledSetting?.value === 'true' || enabledSetting?.value === 'false') {
      setSyncEnabled(enabledSetting.value === 'true');
    }
    const hourSetting = allSettings.find(s => s.key === 'OPTIMO_SYNC_HOUR');
    if (hourSetting?.value) setSyncHour(hourSetting.value);
    const windowSetting = allSettings.find(s => s.key === 'OPTIMO_SYNC_WINDOW_DAYS');
    if (windowSetting?.value) setSyncWindow(windowSetting.value);
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

  // Standard settings (API key) — exclude sync settings that have custom UI
  const standardSettings = settings.filter(s => !SYNC_KEYS.includes(s.key));

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
