import React from 'react';
import { TerritoryManager } from './TerritoryManager';
import { SwapDashboard } from './SwapDashboard';

const Providers: React.FC = () => {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Provider Management</h1>
      <p className="mb-4">
        Here you can onboard new providers, manage their territories, and oversee the network.
      </p>
      <TerritoryManager />
      <SwapDashboard />
    </div>
  );
};

export default Providers;
