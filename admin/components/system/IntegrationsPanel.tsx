import React, { useState, useEffect } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner } from '../ui/index.ts';

interface SettingItem {
  key: string;
  value: string;
  category: string;
  is_secret: boolean;
  label: string;
  source: 'db' | 'env';
  updated_at: string | null;
}

interface SectionConfig {
  category: string;
  title: string;
  description: string;
  guide: React.ReactNode;
}

const ExtLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="text-teal-600 underline hover:text-teal-800">{children}</a>
);

const SECTIONS: SectionConfig[] = [
  {
    category: 'twilio',
    title: 'Twilio (SMS)',
    description: 'SMS messaging for invitations and notifications',
    guide: (
      <ol className="list-decimal list-inside space-y-1">
        <li>Sign up at <ExtLink href="https://www.twilio.com/try-twilio">twilio.com/try-twilio</ExtLink></li>
        <li>Your <strong>Account SID</strong> and <strong>Auth Token</strong> are on the <ExtLink href="https://console.twilio.com">Console Dashboard</ExtLink></li>
        <li>Buy a phone number at <ExtLink href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming">Phone Numbers</ExtLink></li>
      </ol>
    ),
  },
  {
    category: 'stripe',
    title: 'Stripe (Payments)',
    description: 'Payment processing and subscriptions',
    guide: (
      <ol className="list-decimal list-inside space-y-1">
        <li>Sign up at <ExtLink href="https://dashboard.stripe.com/register">stripe.com</ExtLink></li>
        <li>Get your keys at <ExtLink href="https://dashboard.stripe.com/apikeys">API Keys</ExtLink></li>
        <li>Create a webhook at <ExtLink href="https://dashboard.stripe.com/webhooks">Webhooks</ExtLink> &mdash; set the endpoint to <code className="bg-gray-100 px-1 rounded text-xs">https://yourdomain.com/api/stripe/webhook</code></li>
      </ol>
    ),
  },
  {
    category: 'gmail',
    title: 'Gmail (Email)',
    description: 'Email sending via OAuth or service account',
    guide: (
      <div className="space-y-3">
        <div className="rounded-lg border border-sky-200 overflow-hidden">
          <div className="bg-sky-100 px-3 py-2 font-bold text-gray-800 text-sm">Option A &mdash; OAuth (personal Gmail)</div>
          <ol className="list-decimal list-inside space-y-1 px-3 py-2">
            <li>Create OAuth credentials at <ExtLink href="https://console.cloud.google.com/apis/credentials">Cloud Console &gt; Credentials</ExtLink></li>
            <li>Enable the <ExtLink href="https://console.cloud.google.com/apis/library/gmail.googleapis.com">Gmail API</ExtLink></li>
            <li>Use the <ExtLink href="https://developers.google.com/oauthplayground/">OAuth Playground</ExtLink> to generate a refresh token (select the <code className="bg-gray-100 px-1 rounded text-xs">gmail.send</code> scope)</li>
            <li>Fill in <strong>OAuth Client ID</strong>, <strong>OAuth Client Secret</strong>, and <strong>OAuth Refresh Token</strong> below</li>
          </ol>
        </div>
        <div className="rounded-lg border border-sky-200 overflow-hidden">
          <div className="bg-sky-100 px-3 py-2 font-bold text-gray-800 text-sm">Option B &mdash; Service Account (Google Workspace)</div>
          <ol className="list-decimal list-inside space-y-1 px-3 py-2">
            <li>Create a service account at <ExtLink href="https://console.cloud.google.com/iam-admin/serviceaccounts">IAM &gt; Service Accounts</ExtLink></li>
            <li>Enable domain-wide delegation and add the <code className="bg-gray-100 px-1 rounded text-xs">gmail.send</code> scope</li>
            <li>Download the JSON key file and upload it below using the upload button</li>
            <li>Set <strong>Sender Email</strong> to the Gmail address to send from</li>
          </ol>
        </div>
      </div>
    ),
  },
  {
    category: 'google_maps',
    title: 'Google Maps',
    description: 'Address autocomplete and geocoding',
    guide: (
      <ol className="list-decimal list-inside space-y-1">
        <li>Go to <ExtLink href="https://console.cloud.google.com/apis/credentials">Google Cloud Console &gt; Credentials</ExtLink> and create an API key</li>
        <li>Enable the <ExtLink href="https://console.cloud.google.com/apis/library/maps-backend.googleapis.com">Maps JavaScript API</ExtLink> and <ExtLink href="https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com">Geocoding API</ExtLink></li>
      </ol>
    ),
  },
  {
    category: 'optimoroute',
    title: 'OptimoRoute',
    description: 'Route optimization and driver scheduling',
    guide: (
      <ol className="list-decimal list-inside space-y-1">
        <li>Log into <ExtLink href="https://optimoroute.com">OptimoRoute</ExtLink></li>
        <li>Go to <strong>Settings &gt; Integrations &gt; API</strong> to find your API key</li>
      </ol>
    ),
  },
  {
    category: 'gemini',
    title: 'Gemini AI',
    description: 'AI-powered address parsing',
    guide: (
      <ol className="list-decimal list-inside space-y-1">
        <li>Get an API key at <ExtLink href="https://aistudio.google.com/apikey">Google AI Studio</ExtLink></li>
      </ol>
    ),
  },
  {
    category: 'app',
    title: 'App Config',
    description: 'Domain and CORS settings',
    guide: (
      <ul className="list-disc list-inside space-y-1">
        <li><strong>App Domain</strong> &mdash; Your public URL, e.g. <code className="bg-gray-100 px-1 rounded text-xs">https://app.ruralwm.com</code></li>
        <li><strong>CORS Origin</strong> &mdash; Allowed origins for cross-origin requests (usually same as your domain)</li>
      </ul>
    ),
  },
];

const IntegrationsPanel: React.FC = () => {
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [openGuide, setOpenGuide] = useState<string | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings', { credentials: 'include' });
      if (!res.ok) {
        setError(res.status === 403 ? 'You do not have permission to view settings' : 'Failed to load settings');
        return;
      }
      setSettings(await res.json());
    } catch {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleSave = async (key: string) => {
    setSaving(true);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key, value: editValue }),
      });
      if (res.ok) {
        setEditingKey(null);
        setEditValue('');
        setSuccessMsg(`${key} updated successfully`);
        setTimeout(() => setSuccessMsg(null), 3000);
        await fetchSettings();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save setting');
      }
    } catch {
      alert('Failed to save setting');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (setting: SettingItem) => {
    setEditingKey(setting.key);
    setEditValue(setting.is_secret ? '' : (setting.source === 'db' || !setting.is_secret ? stripMask(setting.value) : ''));
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setEditValue('');
  };

  const stripMask = (val: string) => val.startsWith('••') ? '' : val;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        JSON.parse(text); // validate it's valid JSON
        setEditValue(text);
      } catch {
        alert('Invalid JSON file. Please upload a valid service account JSON key file.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset so same file can be re-selected
  };

  const getSettingsForCategory = (category: string) =>
    settings.filter(s => s.category === category);

  const hasValue = (setting: SettingItem) =>
    setting.value && setting.value !== '' && setting.value !== '••••';

  if (loading) return <LoadingSpinner />;

  if (error) {
    return (
      <Card className="p-6 bg-red-50 border border-red-200">
        <p className="text-red-800 text-sm">{error}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-gray-900">Integrations</h3>
          <p className="text-sm text-gray-500 mt-1">Configure third-party service credentials. Changes take effect immediately.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchSettings}>Refresh</Button>
      </div>

      {successMsg && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
          {successMsg}
        </div>
      )}

      {SECTIONS.map(section => {
        const sectionSettings = getSettingsForCategory(section.category);
        if (sectionSettings.length === 0) return null;
        const guideOpen = openGuide === section.category;

        return (
          <Card key={section.category} className="p-4 sm:p-6">
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <h4 className="text-base font-black text-gray-900">{section.title}</h4>
                <button
                  onClick={() => setOpenGuide(guideOpen ? null : section.category)}
                  className="text-xs font-semibold text-teal-600 hover:text-teal-800 flex items-center gap-1"
                >
                  <svg className={`w-3.5 h-3.5 transition-transform ${guideOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  Setup Guide
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{section.description}</p>
            </div>

            {guideOpen && (
              <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-lg text-sm text-gray-700">
                {section.guide}
              </div>
            )}

            <div className="space-y-3">
              {sectionSettings.map(setting => (
                <div key={setting.key} className="flex flex-col sm:flex-row sm:items-center gap-2 py-2 border-b border-gray-100 last:border-0">
                  <div className="sm:w-48 flex-shrink-0">
                    <span className="text-sm font-bold text-gray-700">{setting.label}</span>
                    <span className="text-xs text-gray-400 block font-mono">{setting.key}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    {editingKey === setting.key ? (
                      <div className="flex items-center gap-2">
                        {setting.key === 'GMAIL_SERVICE_ACCOUNT_JSON' ? (
                          <div className="w-full space-y-2">
                            <div className="flex items-center gap-2">
                              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 border border-teal-300 rounded-lg text-sm font-semibold text-teal-700 hover:bg-teal-100 transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                Upload JSON
                                <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
                              </label>
                              <span className="text-xs text-gray-500">or paste below</span>
                            </div>
                            <textarea
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              placeholder="Paste service account JSON key here..."
                              className="w-full px-3 py-1.5 border border-teal-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-y"
                              rows={4}
                            />
                          </div>
                        ) : (
                          <input
                            type={setting.is_secret ? 'password' : 'text'}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
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
                    {editingKey === setting.key ? (
                      <>
                        <Button size="sm" onClick={() => handleSave(setting.key)} disabled={saving || !editValue.trim()}>
                          {saving ? 'Saving...' : 'Save'}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={cancelEditing} disabled={saving}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => startEditing(setting)}>
                        {hasValue(setting) ? 'Edit' : 'Set'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      <Card className="p-4 sm:p-6 bg-amber-50 border border-amber-200">
        <h4 className="text-sm font-black text-gray-900 mb-1">Environment-Only Settings</h4>
        <p className="text-xs text-gray-600">
          These settings cannot be changed from the UI and must be configured in the server's .env file:
          <span className="font-mono"> DATABASE_URL</span>,
          <span className="font-mono"> SESSION_SECRET</span>,
          <span className="font-mono"> ENCRYPTION_KEY</span>.
          VITE_* variables require a frontend rebuild to take effect.
        </p>
      </Card>
    </div>
  );
};

export default IntegrationsPanel;
