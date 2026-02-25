import React from 'react';

export interface TabItem {
    id: string;
    label: string;
    icon: React.ReactNode;
}

interface TabBarProps {
    tabs: TabItem[];
    activeTab: string;
    onTabChange: (id: string) => void;
}

const TabBar: React.FC<TabBarProps> = ({ tabs, activeTab, onTabChange }) => (
    <nav className="flex items-center justify-around sm:justify-start sm:gap-2 border-b border-base-200 px-2 sm:px-6 overflow-x-auto no-scrollbar">
        {tabs.map(tab => (
            <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`group inline-flex flex-shrink-0 items-center justify-center sm:justify-start gap-2 whitespace-nowrap py-4 px-3 sm:px-4 border-b-2 font-medium transition-colors text-sm
                    ${activeTab === tab.id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                aria-label={tab.label}
            >
                {tab.icon}
                <span className="font-bold hidden sm:inline">{tab.label}</span>
            </button>
        ))}
    </nav>
);

export default TabBar;
