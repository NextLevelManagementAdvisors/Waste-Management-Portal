import React, { useState, useEffect } from 'react';
import type { NavFilter } from '../../../shared/types/index.ts';
import MissedPickupsList from './MissedPickupsList.tsx';
import RouteJobsList from './RouteJobsList.tsx';
import RoutesView from './RoutesView.tsx';
import AddressReviewPanel from './AddressReviewPanel.tsx';
import PlanningCalendar from './PlanningCalendar.tsx';
import RoutePlanner from './RoutePlanner.tsx';

export type OpsTabType = 'planning' | 'route-planner' | 'job-board' | 'live-ops' | 'issues' | 'address-review';

interface OperationsViewProps {
  navFilter?: NavFilter | null;
  onFilterConsumed?: () => void;
  activeTab?: OpsTabType;
  onTabChange?: (tab: OpsTabType) => void;
}

const OperationsView: React.FC<OperationsViewProps> = ({ navFilter, onFilterConsumed, activeTab: controlledTab, onTabChange }) => {
  const [internalTab, setInternalTab] = useState<OpsTabType>('planning');
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
      const validTabs: OpsTabType[] = ['planning', 'route-planner', 'job-board', 'live-ops', 'issues', 'address-review'];
      if (validTabs.includes(navFilter.tab as OpsTabType)) {
        setActiveTab(navFilter.tab as OpsTabType);
      }
      onFilterConsumed?.();
    }
  }, [navFilter, onFilterConsumed]);

  const tabs: { key: OpsTabType; label: string }[] = [
    { key: 'planning', label: 'Planning' },
    { key: 'route-planner', label: 'Route Planner' },
    { key: 'job-board', label: 'Job Board' },
    { key: 'live-ops', label: 'Live Ops' },
    { key: 'issues', label: 'Issues' },
    { key: 'address-review', label: 'Address Review' },
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

      <div>
        {activeTab === 'planning' && <PlanningCalendar />}
        {activeTab === 'route-planner' && <RoutePlanner />}
        {activeTab === 'job-board' && <RouteJobsList />}
        {activeTab === 'live-ops' && <RoutesView />}
        {activeTab === 'issues' && <MissedPickupsList />}
        {activeTab === 'address-review' && <AddressReviewPanel />}
      </div>
    </div>
  );
};

export default OperationsView;
