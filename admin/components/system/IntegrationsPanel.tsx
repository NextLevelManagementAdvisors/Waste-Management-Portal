import React from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner } from '../ui/index.ts';
import type { SectionConfig } from './integrations/types';
import { useIntegrationSettings } from './integrations/useIntegrationSettings';
import IntegrationCard from './integrations/IntegrationCard.tsx';
import SettingField from './integrations/SettingField.tsx';
import GoogleOAuthCard from './integrations/GoogleOAuthCard.tsx';
import GmailCard from './integrations/GmailCard.tsx';
import GoogleSsoCard from './integrations/GoogleSsoCard.tsx';
import OptimoRouteCard from './integrations/OptimoRouteCard.tsx';
import { GUIDES, getGmailGuide } from './integrations/guides.tsx';

const SECTIONS: SectionConfig[] = [
  // Third-party services
  { category: 'twilio',       title: 'Twilio (SMS)',           description: 'SMS messaging for invitations and notifications',    renderMode: 'standard' },
  { category: 'stripe',       title: 'Stripe (Payments)',      description: 'Payment processing and subscriptions',               renderMode: 'standard' },
  // Google Cloud group
  { category: 'google_oauth', title: 'Google OAuth',           description: 'Shared OAuth credentials for Google services',       group: 'google', renderMode: 'custom' },
  { category: 'gmail',        title: 'Gmail (Email)',           description: 'Email sending via OAuth or service account',         group: 'google', renderMode: 'custom' },
  { category: 'google_sso',   title: 'Google SSO (Sign-In)',   description: 'Google sign-in for customer and team login pages',   group: 'google', renderMode: 'custom' },
  { category: 'google_maps',  title: 'Google Maps',            description: 'Address autocomplete and geocoding',                 group: 'google', renderMode: 'standard' },
  { category: 'gemini',       title: 'Gemini AI',              description: 'AI-powered address parsing',                         group: 'google', renderMode: 'standard' },
  // Infrastructure
  { category: 'optimoroute',  title: 'OptimoRoute',            description: 'Route optimization and driver scheduling',           renderMode: 'custom' },
  { category: 'app',          title: 'App Config',             description: 'Domain and CORS settings',                           renderMode: 'standard' },
];

const IntegrationsPanel: React.FC = () => {
  const hook = useIntegrationSettings();
  const {
    settings,
    loading,
    error,
    successMsg,
    editingKey,
    editValue,
    saving,
    integrationStatus,
    testingAll,
    testingOne,
    fetchSettings,
    handleSave,
    saveSetting,
    startEditing,
    cancelEditing,
    setEditValue,
    handleFileUpload,
    testAllConnections,
    testSingleConnection,
    getSettingsForCategory,
    flashSuccess,
    flashError,
  } = hook;

  if (loading) return <LoadingSpinner />;

  if (error && !settings.length) {
    return (
      <Card className="p-6 bg-red-50 border border-red-200">
        <p className="text-red-800 text-sm">{error}</p>
      </Card>
    );
  }

  const renderStandardFields = (category: string) => {
    const sectionSettings = getSettingsForCategory(category);
    return (
      <div className="space-y-3">
        {sectionSettings.map(setting => (
          <SettingField
            key={setting.key}
            setting={setting}
            isEditing={editingKey === setting.key}
            editValue={editValue}
            saving={saving}
            onStartEdit={() => startEditing(setting)}
            onSave={() => handleSave(setting.key)}
            onCancel={cancelEditing}
            onEditValueChange={setEditValue}
            onFileUpload={handleFileUpload}
          />
        ))}
      </div>
    );
  };

  const renderCustomContent = (section: SectionConfig) => {
    switch (section.category) {
      case 'google_oauth':
        return (
          <GoogleOAuthCard
            settings={getSettingsForCategory('google_oauth')}
            editingKey={editingKey}
            editValue={editValue}
            saving={saving}
            onStartEdit={startEditing}
            onSave={handleSave}
            onCancel={cancelEditing}
            onEditValueChange={setEditValue}
          />
        );
      case 'gmail':
        return (
          <GmailCard
            settings={getSettingsForCategory('gmail')}
            allSettings={settings}
            editingKey={editingKey}
            editValue={editValue}
            saving={saving}
            onStartEdit={startEditing}
            onSave={handleSave}
            onCancel={cancelEditing}
            onEditValueChange={setEditValue}
            onFileUpload={handleFileUpload}
            saveSetting={saveSetting}
            flashSuccess={flashSuccess}
            fetchSettings={fetchSettings}
          />
        );
      case 'google_sso':
        return (
          <GoogleSsoCard
            allSettings={settings}
            saving={saving}
            saveSetting={saveSetting}
            flashSuccess={flashSuccess}
          />
        );
      case 'optimoroute':
        return (
          <OptimoRouteCard
            settings={getSettingsForCategory('optimoroute')}
            allSettings={settings}
            editingKey={editingKey}
            editValue={editValue}
            saving={saving}
            onStartEdit={startEditing}
            onSave={handleSave}
            onCancel={cancelEditing}
            onEditValueChange={setEditValue}
            saveSetting={saveSetting}
            flashSuccess={flashSuccess}
            flashError={flashError}
          />
        );
      default:
        return renderStandardFields(section.category);
    }
  };

  const getGuide = (category: string) => {
    if (category === 'gmail') return getGmailGuide('oauth');
    return GUIDES[category];
  };

  // Group sections for visual rendering
  const googleSections = SECTIONS.filter(s => s.group === 'google');
  const otherSections = SECTIONS.filter(s => !s.group);

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
          <Button variant="secondary" size="sm" onClick={() => fetchSettings()}>Refresh</Button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
          {successMsg}
        </div>
      )}

      {error && settings.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* Third-party services */}
      {otherSections.slice(0, 2).map(section => (
        <IntegrationCard
          key={section.category}
          section={section}
          status={integrationStatus[section.category]}
          isTesting={testingAll || testingOne === section.category}
          onTest={() => testSingleConnection(section.category)}
          guide={getGuide(section.category)}
        >
          {section.renderMode === 'custom'
            ? renderCustomContent(section)
            : renderStandardFields(section.category)}
        </IntegrationCard>
      ))}

      {/* Google Cloud group */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pt-2">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Google Cloud</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>
        {googleSections.map(section => (
          <IntegrationCard
            key={section.category}
            section={section}
            status={integrationStatus[section.category]}
            isTesting={testingAll || testingOne === section.category}
            onTest={() => testSingleConnection(section.category)}
            guide={getGuide(section.category)}
          >
            {section.renderMode === 'custom'
              ? renderCustomContent(section)
              : renderStandardFields(section.category)}
          </IntegrationCard>
        ))}
      </div>

      {/* OptimoRoute + App Config */}
      {otherSections.slice(2).map(section => (
        <IntegrationCard
          key={section.category}
          section={section}
          status={integrationStatus[section.category]}
          isTesting={testingAll || testingOne === section.category}
          onTest={() => testSingleConnection(section.category)}
          guide={getGuide(section.category)}
        >
          {section.renderMode === 'custom'
            ? renderCustomContent(section)
            : renderStandardFields(section.category)}
        </IntegrationCard>
      ))}

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
