import React, { useState } from 'react';
import InboxTab from './InboxTab.tsx';
import ComposeTab from './ComposeTab.tsx';
import TemplatesTab from './TemplatesTab.tsx';
import ActivityLogTab from './ActivityLogTab.tsx';

export type CommsTabType = 'inbox' | 'compose' | 'templates' | 'activity';

interface CommunicationsViewProps {
  activeTab?: CommsTabType;
  onTabChange?: (tab: CommsTabType) => void;
}

const CommunicationsView: React.FC<CommunicationsViewProps> = ({ activeTab: controlledTab, onTabChange }) => {
  const [internalTab, setInternalTab] = useState<CommsTabType>('inbox');
  const activeTab = controlledTab ?? internalTab;

  const setActiveTab = (tab: CommsTabType) => {
    if (onTabChange) onTabChange(tab);
    else setInternalTab(tab);
  };

  const tabs: { key: CommsTabType; label: string }[] = [
    { key: 'inbox', label: 'Inbox' },
    { key: 'compose', label: 'Compose' },
    { key: 'templates', label: 'Templates' },
    { key: 'activity', label: 'Activity Log' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
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

      {activeTab === 'inbox' && <InboxTab />}
      {activeTab === 'compose' && <ComposeTab onSent={() => setActiveTab('activity')} />}
      {activeTab === 'templates' && <TemplatesTab onUseTemplate={() => setActiveTab('compose')} />}
      {activeTab === 'activity' && <ActivityLogTab />}
    </div>
  );
};

export default CommunicationsView;
