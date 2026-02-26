import React, { useState } from 'react';
import { Card } from '../../../components/Card.tsx';
import CustomerSyncPanel from '../operations/CustomerSyncPanel.tsx';
import DriverSyncPanel from '../operations/DriverSyncPanel.tsx';

type SyncSection = 'customer' | 'driver';

const SyncAutomationPanel: React.FC = () => {
  const [activeSection, setActiveSection] = useState<SyncSection>('customer');

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h3 className="text-base font-black text-gray-900">Sync & Automation</h3>
        <p className="text-sm text-gray-500 mt-1">
          Manage automated syncing between the portal and OptimoRoute.
          Schedule settings (sync hour, window, enable/disable) are configured in
          <span className="font-semibold text-teal-700"> Integrations &gt; OptimoRoute</span>.
        </p>
      </Card>

      <div className="flex gap-2">
        <button
          onClick={() => setActiveSection('customer')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
            activeSection === 'customer'
              ? 'bg-teal-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Customer Order Sync
        </button>
        <button
          onClick={() => setActiveSection('driver')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
            activeSection === 'driver'
              ? 'bg-teal-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Driver Sync
        </button>
      </div>

      {activeSection === 'customer' && <CustomerSyncPanel />}
      {activeSection === 'driver' && <DriverSyncPanel />}
    </div>
  );
};

export default SyncAutomationPanel;
