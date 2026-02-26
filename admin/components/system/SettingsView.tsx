import React, { useState } from 'react';
import AuditLog from './AuditLog.tsx';
import AdminRoles from './AdminRoles.tsx';
import ErrorLogs from './ErrorLogs.tsx';
import IntegrationsPanel from './IntegrationsPanel.tsx';
import SyncAutomationPanel from './SyncAutomationPanel.tsx';

export type SettingsTabType = 'integrations' | 'roles' | 'sync' | 'audit' | 'errors';

interface SettingsViewProps {
  activeTab?: SettingsTabType;
  onTabChange?: (tab: SettingsTabType) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ activeTab: controlledTab, onTabChange }) => {
  const [internalTab, setInternalTab] = useState<SettingsTabType>('integrations');
  const activeTab = controlledTab ?? internalTab;

  const setActiveTab = (tab: SettingsTabType) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  const tabs: { key: SettingsTabType; label: string }[] = [
    { key: 'integrations', label: 'Integrations' },
    { key: 'roles', label: 'Team & Roles' },
    { key: 'sync', label: 'Sync & Automation' },
    { key: 'audit', label: 'Audit Log' },
    { key: 'errors', label: 'Error Logs' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 sm:px-5 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'text-teal-700 border-teal-600'
                : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'integrations' && <IntegrationsPanel />}
      {activeTab === 'roles' && <AdminRoles />}
      {activeTab === 'sync' && <SyncAutomationPanel />}
      {activeTab === 'audit' && <AuditLog />}
      {activeTab === 'errors' && <ErrorLogs />}
    </div>
  );
};

export default SettingsView;
