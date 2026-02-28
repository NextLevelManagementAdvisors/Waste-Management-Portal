import React, { useState, useEffect } from 'react';
import type { NavFilter } from '../../../shared/types/index.ts';
import MissedPickupsList from './MissedPickupsList.tsx';
import AddressReviewPanel from './AddressReviewPanel.tsx';
import PlanningCalendar from './PlanningCalendar.tsx';
import RoutesList from './RoutesList.tsx';

// Kept for backward compat with App.tsx routing
export type OpsTabType = 'operations' | 'routes' | 'actions' | 'issues' | 'address-review';

interface OperationsViewProps {
  navFilter?: NavFilter | null;
  onFilterConsumed?: () => void;
  activeTab?: OpsTabType;
  onTabChange?: (tab: OpsTabType) => void;
  missedPickupsCount?: number;
  addressReviewsCount?: number;
  onActionResolved?: () => void;
}

const TAB_ITEMS: { key: OpsTabType; label: string }[] = [
  { key: 'operations', label: 'Calendar' },
  { key: 'routes', label: 'Routes' },
  { key: 'actions', label: 'Actions' },
];

type ActionSubTab = 'pickups' | 'addresses';

const OperationsView: React.FC<OperationsViewProps> = ({ navFilter, onFilterConsumed, activeTab = 'operations', onTabChange, missedPickupsCount = 0, addressReviewsCount = 0, onActionResolved }) => {
  const [actionSubTab, setActionSubTab] = useState<ActionSubTab>('pickups');

  useEffect(() => {
    if (navFilter?.tab) {
      if (navFilter.tab === 'issues') {
        onTabChange?.('actions');
        setActionSubTab('pickups');
      } else if (navFilter.tab === 'address-review') {
        onTabChange?.('actions');
        setActionSubTab('addresses');
      }
      onFilterConsumed?.();
    }
  }, [navFilter, onFilterConsumed, onTabChange]);

  const currentTab = activeTab || 'operations';
  const isActions = currentTab === 'actions' || currentTab === 'issues' || currentTab === 'address-review';
  const actionTotal = missedPickupsCount + addressReviewsCount;

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {TAB_ITEMS.map(tab => {
          const isActive = tab.key === 'actions' ? isActions : currentTab === tab.key;
          const badge = tab.key === 'actions' && actionTotal > 0 ? actionTotal : null;
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
      {isActions && (
        <div className="space-y-4">
          {/* Sub-tab pills */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActionSubTab('pickups')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                actionSubTab === 'pickups'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Missed Pickups
              {missedPickupsCount > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black ${
                  actionSubTab === 'pickups' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700'
                }`}>
                  {missedPickupsCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActionSubTab('addresses')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                actionSubTab === 'addresses'
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Address Review
              {addressReviewsCount > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black ${
                  actionSubTab === 'addresses' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                }`}>
                  {addressReviewsCount}
                </span>
              )}
            </button>
          </div>

          {actionSubTab === 'pickups' && <MissedPickupsList onActionResolved={onActionResolved} />}
          {actionSubTab === 'addresses' && <AddressReviewPanel onActionResolved={onActionResolved} />}
        </div>
      )}
    </div>
  );
};

export default OperationsView;
