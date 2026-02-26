import React, { useState, useEffect } from 'react';
import { Button } from '../../../../components/Button.tsx';
import type { SettingItem } from './types';
import SettingField from './SettingField.tsx';

const GMAIL_OAUTH_KEYS = ['GMAIL_REFRESH_TOKEN'];
const GMAIL_SA_KEYS = ['GMAIL_SERVICE_ACCOUNT_JSON', 'GMAIL_SENDER_EMAIL'];

interface GmailCardProps {
  settings: SettingItem[];
  allSettings: SettingItem[];
  editingKey: string | null;
  editValue: string;
  saving: boolean;
  onStartEdit: (setting: SettingItem) => void;
  onSave: (key: string) => void;
  onCancel: () => void;
  onEditValueChange: (value: string) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  saveSetting: (key: string, value: string) => Promise<boolean>;
  flashSuccess: (msg: string) => void;
  fetchSettings: (silent?: boolean) => Promise<void>;
}

const GmailCard: React.FC<GmailCardProps> = ({
  settings,
  allSettings,
  editingKey,
  editValue,
  saving,
  onStartEdit,
  onSave,
  onCancel,
  onEditValueChange,
  onFileUpload,
  saveSetting,
  flashSuccess,
  fetchSettings,
}) => {
  const [gmailMode, setGmailMode] = useState<'oauth' | 'service_account'>('oauth');
  const [gmailAuthorizing, setGmailAuthorizing] = useState(false);

  // Read persisted gmail mode, fallback to credential inference
  useEffect(() => {
    const modeSetting = allSettings.find(s => s.key === 'GMAIL_AUTH_MODE');
    if (modeSetting?.value === 'oauth' || modeSetting?.value === 'service_account') {
      setGmailMode(modeSetting.value);
      return;
    }
    const hasServiceAcct = allSettings.some(s => s.key === 'GMAIL_SERVICE_ACCOUNT_JSON' && s.value && s.value !== '••••');
    const hasOAuth = allSettings.some(s => s.key === 'GOOGLE_OAUTH_CLIENT_ID' && s.value && s.value !== '••••');
    if (hasServiceAcct && !hasOAuth) setGmailMode('service_account');
    else if (hasOAuth) setGmailMode('oauth');
  }, [allSettings]);

  // Handle gmail_auth callback param from OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailAuth = params.get('gmail_auth');
    if (!gmailAuth) return;
    params.delete('gmail_auth');
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, '', newUrl);

    if (gmailAuth === 'success') {
      flashSuccess('Gmail authorized successfully! Refresh token has been saved.');
      fetchSettings(true);
    }
  }, [flashSuccess, fetchSettings]);

  const handleGmailModeChange = async (mode: 'oauth' | 'service_account') => {
    setGmailMode(mode);
    await saveSetting('GMAIL_AUTH_MODE', mode);
  };

  const authorizeGmail = async () => {
    setGmailAuthorizing(true);
    try {
      const res = await fetch('/api/admin/gmail/authorize', { credentials: 'include' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to start Gmail authorization');
        return;
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      alert('Failed to start Gmail authorization');
    } finally {
      setGmailAuthorizing(false);
    }
  };

  const hasClientCreds = allSettings.some(s => s.key === 'GOOGLE_OAUTH_CLIENT_ID' && s.value && s.value !== '••••')
    && allSettings.some(s => s.key === 'GOOGLE_OAUTH_CLIENT_SECRET' && s.value && s.value !== '••••');
  const hasRefreshToken = allSettings.some(s => s.key === 'GMAIL_REFRESH_TOKEN' && s.value && s.value !== '••••');

  const visibleKeys = gmailMode === 'oauth' ? GMAIL_OAUTH_KEYS : GMAIL_SA_KEYS;
  const filteredSettings = settings.filter(s => visibleKeys.includes(s.key));

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg w-fit">
          <button
            onClick={() => handleGmailModeChange('oauth')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${gmailMode === 'oauth' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            OAuth
          </button>
          <button
            onClick={() => handleGmailModeChange('service_account')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${gmailMode === 'service_account' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Service Account
          </button>
        </div>
        <span className="text-[10px] text-gray-400 font-medium">
          Server sends via {gmailMode === 'oauth' ? 'OAuth' : 'Service Account'}
        </span>
      </div>

      {/* Authorize Gmail button (OAuth mode only) */}
      {gmailMode === 'oauth' && hasClientCreds && (
        <div className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-lg">
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-800">
              {hasRefreshToken ? 'Re-authorize Gmail' : 'Authorize Gmail'}
            </p>
            <p className="text-xs text-gray-500">
              {hasRefreshToken
                ? 'Click to generate a new refresh token (replaces the existing one).'
                : 'Sign in with Google to automatically generate a refresh token.'}
            </p>
          </div>
          <Button size="sm" onClick={authorizeGmail} disabled={gmailAuthorizing}>
            {gmailAuthorizing ? 'Redirecting...' : hasRefreshToken ? 'Re-authorize' : 'Authorize Gmail'}
          </Button>
        </div>
      )}

      {/* Settings fields */}
      {filteredSettings.map(setting => (
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
          onFileUpload={onFileUpload}
        />
      ))}
    </div>
  );
};

export default GmailCard;
