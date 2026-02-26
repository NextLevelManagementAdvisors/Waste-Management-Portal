import React from 'react';
import type { SettingItem } from './types';
import SettingField from './SettingField.tsx';

interface GoogleOAuthCardProps {
  settings: SettingItem[];
  editingKey: string | null;
  editValue: string;
  saving: boolean;
  onStartEdit: (setting: SettingItem) => void;
  onSave: (key: string) => void;
  onCancel: () => void;
  onEditValueChange: (value: string) => void;
}

const GoogleOAuthCard: React.FC<GoogleOAuthCardProps> = ({
  settings,
  editingKey,
  editValue,
  saving,
  onStartEdit,
  onSave,
  onCancel,
  onEditValueChange,
}) => {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 italic">
        Shared by Gmail, SSO, and other Google services.
      </p>
      {settings.map(setting => (
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

export default GoogleOAuthCard;
