import React, { useState, useEffect } from 'react';
import type { NavFilter } from '../../../shared/types/index.ts';
import MissedPickupsList from './MissedPickupsList.tsx';
import PickupSchedule from './PickupSchedule.tsx';
import ActivityFeed from './ActivityFeed.tsx';
import NotificationSender from './NotificationSender.tsx';

type TabType = 'missed-pickups' | 'pickup-schedule' | 'activity' | 'notifications';

const OperationsView: React.FC<{ navFilter?: NavFilter | null; onFilterConsumed?: () => void }> = ({ navFilter, onFilterConsumed }) => {
  const [activeTab, setActiveTab] = useState<TabType>('missed-pickups');

  useEffect(() => {
    if (navFilter?.tab) {
      const validTabs: TabType[] = ['missed-pickups', 'pickup-schedule', 'activity', 'notifications'];
      if (validTabs.includes(navFilter.tab as TabType)) {
        setActiveTab(navFilter.tab as TabType);
      }
      onFilterConsumed?.();
    }
  }, [navFilter, onFilterConsumed]);

  const tabs: { key: TabType; label: string }[] = [
    { key: 'missed-pickups', label: 'Missed Pickups' },
    { key: 'pickup-schedule', label: 'Pickup Schedule' },
    { key: 'activity', label: 'Recent Activity' },
    { key: 'notifications', label: 'Notifications' },
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
        {activeTab === 'missed-pickups' && <MissedPickupsList />}
        {activeTab === 'pickup-schedule' && <PickupSchedule />}
        {activeTab === 'activity' && <ActivityFeed />}
        {activeTab === 'notifications' && <NotificationSender />}
      </div>
    </div>
  );
};

export default OperationsView;
