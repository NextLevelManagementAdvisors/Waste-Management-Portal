import React, { useState, useEffect } from 'react';
import type { NavFilter } from '../../../shared/types/index.ts';
import MissedPickupsList from './MissedPickupsList.tsx';
import PickupSchedule from './PickupSchedule.tsx';
import RouteJobsList from './RouteJobsList.tsx';
import RoutesView from './RoutesView.tsx';
import OrdersView from './OrdersView.tsx';
import CustomerSyncPanel from './CustomerSyncPanel.tsx';
import AddressReviewPanel from './AddressReviewPanel.tsx';

export type OpsTabType = 'address-review' | 'routes' | 'orders' | 'route-jobs' | 'missed-pickups' | 'pickup-schedule' | 'customer-sync';

interface OperationsViewProps {
  navFilter?: NavFilter | null;
  onFilterConsumed?: () => void;
  activeTab?: OpsTabType;
  onTabChange?: (tab: OpsTabType) => void;
}

const OperationsView: React.FC<OperationsViewProps> = ({ navFilter, onFilterConsumed, activeTab: controlledTab, onTabChange }) => {
  const [internalTab, setInternalTab] = useState<OpsTabType>('routes');
  const activeTab = controlledTab ?? internalTab;

  const setActiveTab = (tab: OpsTabType) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  useEffect(() => {
    if (navFilter?.tab) {
      const validTabs: OpsTabType[] = ['address-review', 'routes', 'orders', 'route-jobs', 'missed-pickups', 'pickup-schedule', 'customer-sync'];
      if (validTabs.includes(navFilter.tab as OpsTabType)) {
        setActiveTab(navFilter.tab as OpsTabType);
      }
      onFilterConsumed?.();
    }
  }, [navFilter, onFilterConsumed]);

  const tabs: { key: OpsTabType; label: string }[] = [
    { key: 'address-review', label: 'Address Review' },
    { key: 'routes', label: 'Routes' },
    { key: 'orders', label: 'Orders' },
    { key: 'route-jobs', label: 'Route Jobs' },
    { key: 'missed-pickups', label: 'Missed Pickups' },
    { key: 'pickup-schedule', label: 'Special Pickups' },
    { key: 'customer-sync', label: 'Customer Sync' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'text-teal-700 border-teal-600'
                : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'address-review' && <AddressReviewPanel />}
        {activeTab === 'routes' && <RoutesView />}
        {activeTab === 'orders' && <OrdersView />}
        {activeTab === 'route-jobs' && <RouteJobsList />}
        {activeTab === 'missed-pickups' && <MissedPickupsList />}
        {activeTab === 'pickup-schedule' && <PickupSchedule />}
        {activeTab === 'customer-sync' && <CustomerSyncPanel />}
      </div>
    </div>
  );
};

export default OperationsView;
