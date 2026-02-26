import React, { useState, useEffect } from 'react';
import type { SettingItem } from './types';

interface GoogleSsoCardProps {
  allSettings: SettingItem[];
  saving: boolean;
  saveSetting: (key: string, value: string) => Promise<boolean>;
  flashSuccess: (msg: string) => void;
}

const GoogleSsoCard: React.FC<GoogleSsoCardProps> = ({
  allSettings,
  saving,
  saveSetting,
  flashSuccess,
}) => {
  const [ssoEnabled, setSsoEnabled] = useState(true);

  const hasOAuthCreds = allSettings.some(s => s.key === 'GOOGLE_OAUTH_CLIENT_ID' && s.value && s.value !== '••••')
    && allSettings.some(s => s.key === 'GOOGLE_OAUTH_CLIENT_SECRET' && s.value && s.value !== '••••');

  useEffect(() => {
    const ssoSetting = allSettings.find(s => s.key === 'GOOGLE_SSO_ENABLED');
    if (ssoSetting?.value === 'true' || ssoSetting?.value === 'false') {
      setSsoEnabled(ssoSetting.value === 'true');
    } else {
      setSsoEnabled(hasOAuthCreds);
    }
  }, [allSettings, hasOAuthCreds]);

  const handleSsoToggle = async () => {
    const newValue = !ssoEnabled;
    setSsoEnabled(newValue);
    const ok = await saveSetting('GOOGLE_SSO_ENABLED', String(newValue));
    if (ok) {
      flashSuccess(`Google SSO ${newValue ? 'enabled' : 'disabled'}`);
    } else {
      setSsoEnabled(!newValue); // revert
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div>
          <p className="text-sm font-bold text-gray-800">Google Sign-In</p>
          <p className="text-xs text-gray-500">
            {hasOAuthCreds
              ? 'OAuth credentials are configured. Toggle to enable/disable SSO on login pages.'
              : 'OAuth credentials are not configured. Set them in the Google OAuth section first.'}
          </p>
        </div>
        <button
          type="button"
          title={ssoEnabled ? 'Disable Google SSO' : 'Enable Google SSO'}
          onClick={handleSsoToggle}
          disabled={!hasOAuthCreds || saving}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${ssoEnabled ? 'bg-teal-600' : 'bg-gray-200'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${ssoEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>
      {!hasOAuthCreds && (
        <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          Configure OAuth Client ID and Client Secret in the Google OAuth section to enable Google SSO.
        </div>
      )}
    </div>
  );
};

export default GoogleSsoCard;
