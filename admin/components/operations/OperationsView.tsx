import React, { useState, useEffect } from 'react';
import type { NavFilter } from '../../../shared/types/index.ts';
import MissedPickupsList from './MissedPickupsList.tsx';
import AddressReviewPanel from './AddressReviewPanel.tsx';
import PlanningCalendar from './PlanningCalendar.tsx';
import RoutesList from './RoutesList.tsx';

// Kept for backward compat with App.tsx routing
export type OpsTabType = 'operations' | 'issues' | 'address-review';

interface OperationsViewProps {
  navFilter?: NavFilter | null;
  onFilterConsumed?: () => void;
  activeTab?: OpsTabType;
  onTabChange?: (tab: OpsTabType) => void;
}

const OperationsView: React.FC<OperationsViewProps> = ({ navFilter, onFilterConsumed, activeTab, onTabChange }) => {
  const [issueCount, setIssueCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [expandedAction, setExpandedAction] = useState<'issues' | 'reviews' | null>(null);
  const [showRouteList, setShowRouteList] = useState(false);

  // Fetch action item counts on mount
  useEffect(() => {
    fetch('/api/admin/missed-pickups?status=pending&limit=1', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setIssueCount(data.total ?? 0); })
      .catch(() => {});

    fetch('/api/admin/address-reviews', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setReviewCount(data.properties?.length ?? 0); })
      .catch(() => {});
  }, []);

  // Handle URL-based navigation (e.g. /admin/operations/issues)
  useEffect(() => {
    if (activeTab === 'issues') setExpandedAction('issues');
    else if (activeTab === 'address-review') setExpandedAction('reviews');
  }, [activeTab]);

  useEffect(() => {
    if (navFilter?.tab) {
      if (navFilter.tab === 'issues') setExpandedAction('issues');
      else if (navFilter.tab === 'address-review') setExpandedAction('reviews');
      onFilterConsumed?.();
    }
  }, [navFilter, onFilterConsumed]);

  const toggleAction = (action: 'issues' | 'reviews') => {
    const newValue = expandedAction === action ? null : action;
    setExpandedAction(newValue);
    if (onTabChange) {
      onTabChange(newValue === 'issues' ? 'issues' : newValue === 'reviews' ? 'address-review' : 'operations');
    }
  };

  return (
    <div className="space-y-4">
      {/* Action Items */}
      {(issueCount > 0 || reviewCount > 0) && (
        <div className="flex gap-3">
          {issueCount > 0 && (
            <button type="button" onClick={() => toggleAction('issues')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                expandedAction === 'issues'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
              }`}>
              <span className="w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-black">{issueCount}</span>
              Missed Pickup{issueCount !== 1 ? 's' : ''} Need Attention
            </button>
          )}
          {reviewCount > 0 && (
            <button type="button" onClick={() => toggleAction('reviews')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                expandedAction === 'reviews'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
              }`}>
              <span className="w-5 h-5 flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-black">{reviewCount}</span>
              Address{reviewCount !== 1 ? 'es' : ''} Pending Review
            </button>
          )}
        </div>
      )}

      {/* Expanded Action Panel */}
      {expandedAction === 'issues' && <MissedPickupsList />}
      {expandedAction === 'reviews' && <AddressReviewPanel />}

      {/* Calendar + Side Panel */}
      <PlanningCalendar />

      {/* Collapsible Route List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowRouteList(!showRouteList)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
        >
          <span className="text-sm font-black uppercase tracking-widest text-gray-500">Route List</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${showRouteList ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        {showRouteList && (
          <div className="border-t border-gray-200 p-4">
            <RoutesList />
          </div>
        )}
      </div>
    </div>
  );
};

export default OperationsView;
