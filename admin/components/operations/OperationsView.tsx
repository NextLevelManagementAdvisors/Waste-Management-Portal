import React, { useEffect } from 'react';
import type { NavFilter } from '../../../shared/types/index.ts';
import MissedCollectionsList from './MissedCollectionsList.tsx';
import PlanningCalendar from './PlanningCalendar.tsx';
import RoutesList from './RoutesList.tsx';
import ServiceAreasPanel from './ServiceAreasPanel.tsx';
import ContractsPanel from './ContractsPanel.tsx';
import OpportunitiesPanel from './OpportunitiesPanel.tsx';
import Providers from '../providers/Providers.tsx';

// Kept for backward compat with App.tsx routing
export type OpsTabType = 'operations' | 'routes' | 'service-areas' | 'providers' | 'contracts' | 'opportunities' | 'issues' | 'actions' | 'address-review'
  | 'locations' | 'zones' | 'zone-approvals'; // backward compat aliases

interface OperationsViewProps {
  navFilter?: NavFilter | null;
  onFilterConsumed?: () => void;
  activeTab?: OpsTabType;
  onTabChange?: (tab: OpsTabType) => void;
  missedCollectionsCount?: number;
  pendingZonesCount?: number;
  contractAlertsCount?: number;
  onActionResolved?: () => void;
}

const TAB_ITEMS: { key: OpsTabType; label: string }[] = [
  { key: 'operations', label: 'Calendar' },
  { key: 'routes', label: 'Routes' },
  { key: 'service-areas', label: 'Service Areas' },
  { key: 'providers', label: 'Providers' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'opportunities', label: 'Opportunities' },
  { key: 'issues', label: 'Issues' },
];

const OperationsView: React.FC<OperationsViewProps> = ({ navFilter, onFilterConsumed, activeTab = 'operations', onTabChange, missedCollectionsCount = 0, pendingZonesCount = 0, contractAlertsCount = 0, onActionResolved }) => {

  useEffect(() => {
    if (navFilter?.tab) {
      if (navFilter.tab === 'issues' || navFilter.tab === 'actions') {
        onTabChange?.('issues');
      } else if (navFilter.tab === 'zone-approvals' || navFilter.tab === 'zones' || navFilter.tab === 'locations') {
        onTabChange?.('service-areas');
      }
      onFilterConsumed?.();
    }
  }, [navFilter, onFilterConsumed, onTabChange]);

  // Normalize legacy tab values
  const normalizedTab = (['zones', 'zone-approvals', 'locations'].includes(activeTab) ? 'service-areas' : activeTab) || 'operations';
  const currentTab = normalizedTab;
  const isIssues = currentTab === 'issues' || currentTab === 'actions' || currentTab === 'address-review';

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {TAB_ITEMS.map(tab => {
          const isActive = tab.key === 'issues' ? isIssues : currentTab === tab.key;
          const badge =
            (tab.key === 'issues' && missedCollectionsCount > 0) ? missedCollectionsCount :
            (tab.key === 'service-areas' && pendingZonesCount > 0) ? pendingZonesCount :
            (tab.key === 'contracts' && contractAlertsCount > 0) ? contractAlertsCount :
            null;
          const badgeColor = tab.key === 'service-areas' ? 'bg-blue-500' : tab.key === 'contracts' ? 'bg-amber-500' : 'bg-red-500';
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
                <span className={`ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black text-white ${badgeColor}`}>
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
      {currentTab === 'service-areas' && <ServiceAreasPanel onActionResolved={onActionResolved} />}
      {currentTab === 'providers' && <Providers />}
      {currentTab === 'contracts' && <ContractsPanel />}
      {currentTab === 'opportunities' && <OpportunitiesPanel />}
      {isIssues && <MissedCollectionsList onActionResolved={onActionResolved} />}
    </div>
  );
};

export default OperationsView;
