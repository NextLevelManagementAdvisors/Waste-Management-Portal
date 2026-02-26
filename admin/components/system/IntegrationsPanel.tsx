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

interface IntegrationTestResult {
  status: 'connected' | 'not_configured' | 'error';
  message: string;
  latencyMs?: number;
}

interface SectionConfig {
  category: string;
  title: string;
  description: string;
  guide: React.ReactNode | 'gmail';
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
    guide: 'gmail', // rendered dynamically based on gmailMode
  },
  {
    category: 'google_sso',
    title: 'Google SSO (Sign-In)',
    description: 'Google sign-in for customer and team login pages',
    guide: (
      <div className="space-y-2">
        <p>Google SSO uses the same OAuth credentials configured in the <strong>Gmail</strong> section above.</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Ensure <strong>OAuth Client ID</strong> and <strong>Client Secret</strong> are configured in the Gmail section</li>
          <li>The toggle below enables or disables the "Sign in with Google" buttons on login pages</li>
          <li>When disabled, users must use email/password to sign in</li>
        </ul>
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
  const [integrationStatus, setIntegrationStatus] = useState<Record<string, IntegrationTestResult>>({});
  const [testingAll, setTestingAll] = useState(false);
  const [testingOne, setTestingOne] = useState<string | null>(null);
  const [gmailMode, setGmailMode] = useState<'oauth' | 'service_account'>('oauth');
  const [gmailAuthorizing, setGmailAuthorizing] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(true);

  const fetchSettings = async (silent = false) => {
    if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  // Read persisted gmail mode, fall back to credential inference
  useEffect(() => {
    const modeSetting = settings.find(s => s.key === 'GMAIL_AUTH_MODE');
    if (modeSetting?.value === 'oauth' || modeSetting?.value === 'service_account') {
      setGmailMode(modeSetting.value);
      return;
    }
    // Fallback: infer from which credentials exist
    const hasServiceAcct = settings.some(s => s.key === 'GMAIL_SERVICE_ACCOUNT_JSON' && s.value && s.value !== '••••');
    const hasOAuth = settings.some(s => s.key === 'GOOGLE_OAUTH_CLIENT_ID' && s.value && s.value !== '••••');
    if (hasServiceAcct && !hasOAuth) setGmailMode('service_account');
    else if (hasOAuth) setGmailMode('oauth');
  }, [settings]);

  // Read SSO enabled state from settings
  useEffect(() => {
    const ssoSetting = settings.find(s => s.key === 'GOOGLE_SSO_ENABLED');
    if (ssoSetting?.value === 'true' || ssoSetting?.value === 'false') {
      setSsoEnabled(ssoSetting.value === 'true');
    } else {
      // No explicit setting — default to enabled if credentials exist
      const hasCreds = settings.some(s => s.key === 'GOOGLE_OAUTH_CLIENT_ID' && s.value && s.value !== '••••')
        && settings.some(s => s.key === 'GOOGLE_OAUTH_CLIENT_SECRET' && s.value && s.value !== '••••');
      setSsoEnabled(hasCreds);
    }
  }, [settings]);

  // Handle gmail_auth callback param from OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailAuth = params.get('gmail_auth');
    if (!gmailAuth) return;
    // Clean the URL param
    params.delete('gmail_auth');
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, '', newUrl);

    if (gmailAuth === 'success') {
      setSuccessMsg('Gmail authorized successfully! Refresh token has been saved.');
      setTimeout(() => setSuccessMsg(null), 5000);
      fetchSettings(true);
    } else {
      const messages: Record<string, string> = {
        denied: 'Gmail authorization was denied.',
        state_mismatch: 'Authorization failed (state mismatch). Please try again.',
        missing_credentials: 'OAuth Client ID or Secret is missing.',
        no_refresh_token: 'No refresh token returned. Please try again.',
        error: 'Gmail authorization failed. Please try again.',
      };
      setError(messages[gmailAuth] || 'Gmail authorization failed.');
      setTimeout(() => setError(null), 5000);
    }
  }, []);

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
        await fetchSettings(true);
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

  const testAllConnections = async () => {
    setTestingAll(true);
    try {
      const res = await fetch('/api/admin/integrations/status', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setIntegrationStatus(data.results);
      }
    } catch { /* ignore */ }
    finally { setTestingAll(false); }
  };

  const testSingleConnection = async (category: string) => {
    setTestingOne(category);
    try {
      let url = `/api/admin/integrations/status?integration=${category}`;
      if (category === 'gmail') url += `&mode=${gmailMode}`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setIntegrationStatus(prev => ({ ...prev, ...data.results }));
      }
    } catch { /* ignore */ }
    finally { setTestingOne(null); }
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

  const handleGmailModeChange = async (mode: 'oauth' | 'service_account') => {
    setGmailMode(mode);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key: 'GMAIL_AUTH_MODE', value: mode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('Failed to save Gmail mode:', data.error || res.status);
        setError(`Failed to save Gmail mode: ${data.error || res.statusText}`);
        setTimeout(() => setError(null), 5000);
        return;
      }
      await fetchSettings(true);
    } catch (err) {
      console.error('Failed to save Gmail mode:', err);
      setError('Failed to save Gmail mode — network error');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleSsoToggle = async () => {
    const newValue = !ssoEnabled;
    setSsoEnabled(newValue);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key: 'GOOGLE_SSO_ENABLED', value: String(newValue) }),
      });
      if (!res.ok) {
        setSsoEnabled(!newValue);
        const data = await res.json().catch(() => ({}));
        setError(`Failed to update SSO setting: ${data.error || res.statusText}`);
        setTimeout(() => setError(null), 5000);
        return;
      }
      setSuccessMsg(`Google SSO ${newValue ? 'enabled' : 'disabled'}`);
      setTimeout(() => setSuccessMsg(null), 3000);
      await fetchSettings(true);
    } catch {
      setSsoEnabled(!newValue);
      setError('Failed to update SSO setting — network error');
      setTimeout(() => setError(null), 5000);
    }
  };

  const gmailHasClientCreds = settings.some(s => s.key === 'GOOGLE_OAUTH_CLIENT_ID' && s.value && s.value !== '••••')
    && settings.some(s => s.key === 'GOOGLE_OAUTH_CLIENT_SECRET' && s.value && s.value !== '••••');
  const gmailHasRefreshToken = settings.some(s => s.key === 'GMAIL_REFRESH_TOKEN' && s.value && s.value !== '••••');

  const GMAIL_OAUTH_KEYS = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'];
  const GMAIL_SA_KEYS = ['GMAIL_SERVICE_ACCOUNT_JSON', 'GMAIL_SENDER_EMAIL'];

  const getSettingsForCategory = (category: string) => {
    let filtered = settings.filter(s => s.category === category);
    if (category === 'gmail') {
      const visibleKeys = gmailMode === 'oauth' ? GMAIL_OAUTH_KEYS : GMAIL_SA_KEYS;
      filtered = filtered.filter(s => s.key !== 'GMAIL_AUTH_MODE' && visibleKeys.includes(s.key));
    }
    // SSO toggle is rendered separately, hide from text fields
    if (category === 'google_sso') {
      filtered = filtered.filter(s => s.key !== 'GOOGLE_SSO_ENABLED');
    }
    return filtered;
  };

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
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={testAllConnections} disabled={testingAll}>
            {testingAll ? 'Testing...' : 'Test All'}
          </Button>
          <Button variant="secondary" size="sm" onClick={fetchSettings}>Refresh</Button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
          {successMsg}
        </div>
      )}

      {SECTIONS.map(section => {
        const sectionSettings = getSettingsForCategory(section.category);
        if (sectionSettings.length === 0 && section.category !== 'google_sso') return null;
        const guideOpen = openGuide === section.category;

        return (
          <Card key={section.category} className="p-4 sm:p-6">
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <h4 className="text-base font-black text-gray-900">{section.title}</h4>
                {(() => {
                  const st = integrationStatus[section.category];
                  const isTesting = testingAll || testingOne === section.category;
                  if (isTesting) return (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex items-center gap-1">
                      <span className="animate-spin inline-block w-2.5 h-2.5 border-2 border-gray-300 border-t-gray-600 rounded-full" />
                      Testing
                    </span>
                  );
                  if (!st) return null;
                  const styles = { connected: 'bg-green-100 text-green-800', not_configured: 'bg-yellow-100 text-yellow-800', error: 'bg-red-100 text-red-800' };
                  const labels = { connected: 'Connected', not_configured: 'Not Configured', error: 'Error' };
                  return (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${styles[st.status]} cursor-help`} title={st.message + (st.latencyMs ? ` (${st.latencyMs}ms)` : '')}>
                      {labels[st.status]}
                    </span>
                  );
                })()}
                <button
                  onClick={() => setOpenGuide(guideOpen ? null : section.category)}
                  className="text-xs font-semibold text-teal-600 hover:text-teal-800 flex items-center gap-1"
                >
                  <svg className={`w-3.5 h-3.5 transition-transform ${guideOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  Setup Guide
                </button>
                <button
                  onClick={() => testSingleConnection(section.category)}
                  disabled={testingAll || testingOne === section.category}
                  className="ml-auto text-xs font-semibold text-gray-500 hover:text-teal-600 disabled:opacity-50 flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Test
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{section.description}</p>
              {integrationStatus[section.category]?.status === 'error' && (
                <div className="mt-1 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {integrationStatus[section.category].message}
                </div>
              )}
            </div>

            {guideOpen && (
              <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-lg text-sm text-gray-700">
                {section.guide === 'gmail' ? (
                  gmailMode === 'oauth' ? (
                    <div className="space-y-3">
                      <p className="font-semibold text-gray-800">OAuth lets you send email from a personal Gmail or Workspace account. Best for most setups.</p>
                      <ol className="list-decimal list-inside space-y-2">
                        <li>
                          Go to <ExtLink href="https://console.cloud.google.com/apis/credentials">Google Cloud Console &gt; Credentials</ExtLink>
                          <ul className="list-disc list-inside ml-5 mt-1 text-xs text-gray-600 space-y-0.5">
                            <li>Click <strong>+ Create Credentials</strong> &rarr; <strong>OAuth client ID</strong></li>
                            <li>Application type: <strong>Web application</strong></li>
                            <li>Name it anything (e.g. "Waste Portal Gmail")</li>
                          </ul>
                        </li>
                        <li>
                          Under <strong>Authorized redirect URIs</strong>, add:
                          <div className="mt-1 ml-5">
                            <code className="bg-gray-100 px-2 py-1 rounded text-xs block w-fit select-all">{window.location.origin}/api/admin/gmail/callback</code>
                          </div>
                          <p className="text-xs text-gray-500 ml-5 mt-0.5">This must match exactly &mdash; including http vs https and port number.</p>
                        </li>
                        <li>
                          Enable the <ExtLink href="https://console.cloud.google.com/apis/library/gmail.googleapis.com">Gmail API</ExtLink>
                          <ul className="list-disc list-inside ml-5 mt-1 text-xs text-gray-600 space-y-0.5">
                            <li>Search for "Gmail API" in the API Library and click <strong>Enable</strong></li>
                            <li>If not enabled, you'll see an "unauthorized_client" error when testing</li>
                          </ul>
                        </li>
                        <li>
                          Configure the <ExtLink href="https://console.cloud.google.com/apis/credentials/consent">OAuth consent screen</ExtLink>
                          <ul className="list-disc list-inside ml-5 mt-1 text-xs text-gray-600 space-y-0.5">
                            <li>User type: <strong>External</strong> (or Internal if using Google Workspace)</li>
                            <li>Add scope: <code className="bg-gray-100 px-1 rounded">https://www.googleapis.com/auth/gmail.send</code></li>
                            <li>While in "Testing" mode, add your Gmail as a test user under <strong>Test users</strong></li>
                          </ul>
                        </li>
                        <li>
                          Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> from the credentials page and enter them below
                        </li>
                        <li>
                          Click <strong>Authorize Gmail</strong> below to sign in with Google &mdash; the refresh token will be saved automatically
                        </li>
                      </ol>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="font-semibold text-gray-800">Service Account uses domain-wide delegation to send as any user. Requires Google Workspace (not personal Gmail).</p>
                      <ol className="list-decimal list-inside space-y-2">
                        <li>
                          Go to <ExtLink href="https://console.cloud.google.com/iam-admin/serviceaccounts">Google Cloud Console &gt; IAM &gt; Service Accounts</ExtLink>
                          <ul className="list-disc list-inside ml-5 mt-1 text-xs text-gray-600 space-y-0.5">
                            <li>Click <strong>+ Create Service Account</strong></li>
                            <li>Name it (e.g. "waste-portal-mailer") and click <strong>Create and Continue</strong></li>
                            <li>Skip the optional role/access steps and click <strong>Done</strong></li>
                          </ul>
                        </li>
                        <li>
                          Enable domain-wide delegation
                          <ul className="list-disc list-inside ml-5 mt-1 text-xs text-gray-600 space-y-0.5">
                            <li>Click the service account &rarr; <strong>Details</strong> tab &rarr; check <strong>Enable Google Workspace Domain-wide Delegation</strong></li>
                            <li>Note the <strong>Client ID</strong> (numeric) shown on the details page</li>
                          </ul>
                        </li>
                        <li>
                          Authorize the scope in Google Workspace Admin
                          <ul className="list-disc list-inside ml-5 mt-1 text-xs text-gray-600 space-y-0.5">
                            <li>Go to <ExtLink href="https://admin.google.com/ac/owl/domainwidedelegation">admin.google.com &gt; Security &gt; API controls &gt; Domain-wide Delegation</ExtLink></li>
                            <li>Click <strong>Add new</strong>, paste the Client ID</li>
                            <li>Add scope: <code className="bg-gray-100 px-1 rounded">https://www.googleapis.com/auth/gmail.send</code></li>
                          </ul>
                        </li>
                        <li>
                          Enable the <ExtLink href="https://console.cloud.google.com/apis/library/gmail.googleapis.com">Gmail API</ExtLink> in your Google Cloud project
                        </li>
                        <li>
                          Create a JSON key
                          <ul className="list-disc list-inside ml-5 mt-1 text-xs text-gray-600 space-y-0.5">
                            <li>Click the service account &rarr; <strong>Keys</strong> tab &rarr; <strong>Add Key</strong> &rarr; <strong>Create new key</strong> &rarr; <strong>JSON</strong></li>
                            <li>Upload the downloaded file below using the upload button</li>
                          </ul>
                        </li>
                        <li>
                          Set <strong>Sender Email</strong> to the Google Workspace email address to send from (e.g. <code className="bg-gray-100 px-1 rounded text-xs">noreply@yourcompany.com</code>)
                        </li>
                      </ol>
                    </div>
                  )
                ) : section.guide}
              </div>
            )}

            {section.category === 'gmail' && (
              <div className="mb-4 space-y-3">
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
                {gmailMode === 'oauth' && gmailHasClientCreds && (
                  <div className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">
                        {gmailHasRefreshToken ? 'Re-authorize Gmail' : 'Authorize Gmail'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {gmailHasRefreshToken
                          ? 'Click to generate a new refresh token (replaces the existing one).'
                          : 'Sign in with Google to automatically generate a refresh token.'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={authorizeGmail}
                      disabled={gmailAuthorizing}
                    >
                      {gmailAuthorizing ? 'Redirecting...' : gmailHasRefreshToken ? 'Re-authorize' : 'Authorize Gmail'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {section.category === 'google_sso' && (
              <div className="mb-4 space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div>
                    <p className="text-sm font-bold text-gray-800">Google Sign-In</p>
                    <p className="text-xs text-gray-500">
                      {gmailHasClientCreds
                        ? 'OAuth credentials are configured. Toggle to enable/disable SSO on login pages.'
                        : 'OAuth credentials are not configured. Set them in the Gmail section first.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    title={ssoEnabled ? 'Disable Google SSO' : 'Enable Google SSO'}
                    onClick={handleSsoToggle}
                    disabled={!gmailHasClientCreds || saving}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${ssoEnabled ? 'bg-teal-600' : 'bg-gray-200'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${ssoEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {!gmailHasClientCreds && (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                    Configure OAuth Client ID and Client Secret in the Gmail section to enable Google SSO.
                  </div>
                )}
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
