import React from 'react';
import { Button } from '../../../../components/Button.tsx';
import type { SettingItem } from './types';

interface SettingFieldProps {
  setting: SettingItem;
  isEditing: boolean;
  editValue: string;
  saving: boolean;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onEditValueChange: (value: string) => void;
  onFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const hasValue = (setting: SettingItem) =>
  setting.value && setting.value !== '' && setting.value !== '••••';

const SettingField: React.FC<SettingFieldProps> = ({
  setting,
  isEditing,
  editValue,
  saving,
  onStartEdit,
  onSave,
  onCancel,
  onEditValueChange,
  onFileUpload,
}) => {
  // Hidden fields are not rendered
  if (setting.display_type === 'hidden') return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-2 border-b border-gray-100 last:border-0">
      <div className="sm:w-48 flex-shrink-0">
        <span className="text-sm font-bold text-gray-700">{setting.label}</span>
        <span className="text-xs text-gray-400 block font-mono">{setting.key}</span>
      </div>

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-2">
            {setting.display_type === 'file_json' ? (
              <div className="w-full space-y-2">
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 border border-teal-300 rounded-lg text-sm font-semibold text-teal-700 hover:bg-teal-100 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Upload JSON
                    <input type="file" accept=".json" onChange={onFileUpload} className="hidden" />
                  </label>
                  <span className="text-xs text-gray-500">or paste below</span>
                </div>
                <textarea
                  value={editValue}
                  onChange={e => onEditValueChange(e.target.value)}
                  placeholder="Paste service account JSON key here..."
                  className="w-full px-3 py-1.5 border border-teal-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-y"
                  rows={4}
                />
              </div>
            ) : (
              <input
                type={setting.is_secret ? 'password' : 'text'}
                value={editValue}
                onChange={e => onEditValueChange(e.target.value)}
                placeholder={setting.is_secret ? 'Enter new value...' : 'Enter value...'}
                className="w-full px-3 py-1.5 border border-teal-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                autoFocus
              />
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {hasValue(setting) ? (
              <span className="text-sm font-mono text-gray-600 truncate">{setting.value}</span>
            ) : (
              <span className="text-sm text-gray-400 italic">Not configured</span>
            )}
            {setting.source === 'db' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-600 font-bold flex-shrink-0">DB</span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {isEditing ? (
          <>
            <Button size="sm" onClick={onSave} disabled={saving || !editValue.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={onStartEdit}>
            {hasValue(setting) ? 'Edit' : 'Set'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default SettingField;
