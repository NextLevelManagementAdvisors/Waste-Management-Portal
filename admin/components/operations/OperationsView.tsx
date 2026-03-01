import React, { useEffect } from 'react';
import type { NavFilter } from '../../../shared/types/index.ts';
import LocationsList from './LocationsList.tsx';
import MissedPickupsList from './MissedPickupsList.tsx';
import PlanningCalendar from './PlanningCalendar.tsx';
import RoutesList from './RoutesList.tsx';
import ZonesPanel from './ZonesPanel.tsx';
import ClaimsPanel from './ClaimsPanel.tsx';

// Kept for backward compat with App.tsx routing
export type OpsTabType = 'operations' | 'routes' | 'locations' | 'zones' | 'claims' | 'issues' | 'actions' | 'address-review';

interface OperationsViewProps {
  navFilter?: NavFilter | null;
  onFilterConsumed?: () => void;
  activeTab?: OpsTabType;
  onTabChange?: (tab: OpsTabType) => void;
  missedPickupsCount?: number;
  onActionResolved?: () => void;
}

const TAB_ITEMS: { key: OpsTabType; label: string }[] = [
  { key: 'operations', label: 'Calendar' },
  { key: 'routes', label: 'Routes' },
  { key: 'locations', label: 'Locations' },
  { key: 'zones', label: 'Zones' },
  { key: 'claims', label: 'Claims' },
  { key: 'issues', label: 'Issues' },
];

const OperationsView: React.FC<OperationsViewProps> = ({ navFilter, onFilterConsumed, activeTab = 'operations', onTabChange, missedPickupsCount = 0, onActionResolved }) => {

  useEffect(() => {
    if (navFilter?.tab) {
      if (navFilter.tab === 'issues' || navFilter.tab === 'actions') {
        onTabChange?.('issues');
      }
      onFilterConsumed?.();
    }
  }, [navFilter, onFilterConsumed, onTabChange]);

  const currentTab = activeTab || 'operations';
  const isIssues = currentTab === 'issues' || currentTab === 'actions' || currentTab === 'address-review';

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {TAB_ITEMS.map(tab => {
          const isActive = tab.key === 'issues' ? isIssues : currentTab === tab.key;
          const badge = tab.key === 'issues' && missedPickupsCount > 0 ? missedPickupsCount : null;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange?.(tab.key)}
              className={`relative px-4 py-2.5 text-sm font-bold transition-colors ${
                isActive
                  ? 'text-teal-700 border-b-2 border-teal-600 -mb-px'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {badge != null && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black text-white bg-red-500">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {currentTab === 'operations' && <PlanningCalendar />}
      {currentTab === 'routes' && <RoutesList />}
      {currentTab === 'locations' && <LocationsList />}
      {currentTab === 'zones' && <ZonesPanel />}
      {currentTab === 'claims' && <ClaimsPanel />}
      {isIssues && <MissedPickupsList onActionResolved={onActionResolved} />}
    </div>
  );
};

export default OperationsView;
