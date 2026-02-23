import React, { useState } from 'react';
import AuditLog from './AuditLog.tsx';
import AdminRoles from './AdminRoles.tsx';
import ErrorLogs from './ErrorLogs.tsx';
import IntegrationsPanel from './IntegrationsPanel.tsx';

type TabType = 'audit' | 'settings' | 'errors' | 'integrations';

const SystemView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('audit');

  const tabs: { key: TabType; label: string }[] = [
    { key: 'audit', label: 'Audit Log' },
    { key: 'errors', label: 'Error Logs' },
    { key: 'settings', label: 'Admin Roles' },
    { key: 'integrations', label: 'Integrations' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-x-auto border-b border-gray-200 sticky top-0 bg-white z-10 pb-0">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-3 font-semibold border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'audit' && <AuditLog />}
      {activeTab === 'errors' && <ErrorLogs />}
      {activeTab === 'settings' && <AdminRoles />}
      {activeTab === 'integrations' && <IntegrationsPanel />}
    </div>
  );
};

export default SystemView;
