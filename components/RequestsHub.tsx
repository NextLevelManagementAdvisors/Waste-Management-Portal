import React, { useState } from 'react';
import SpecialPickup from './SpecialPickup.tsx';
import VacationHolds from './VacationHolds.tsx';
import { CalendarDaysIcon, PauseCircleIcon, ExclamationTriangleIcon } from './Icons.tsx';

type RequestView = 'extra' | 'hold';

const Tabs: React.FC<{
    activeTab: RequestView;
    setActiveTab: (tab: RequestView) => void;
}> = ({ activeTab, setActiveTab }) => {
    // Using 'as const' tells TypeScript to infer the most specific type possible for the array.
    // This is useful for preserving literal types, for example, making 'tab.id' have the type 'extra' | 'hold' | 'missed' 
    // instead of just 'string'.
    const tabs = [
        { id: 'extra', label: 'Extra Pickup', icon: <CalendarDaysIcon className="w-5 h-5" />, color: 'text-primary' },
        { id: 'hold', label: 'Vacation Hold', icon: <PauseCircleIcon className="w-5 h-5" />, color: 'text-orange-500' },
    ] as const;

    return (
        <div className="border-b border-base-200">
            <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`group inline-flex items-center gap-2 py-4 px-1 border-b-2 font-black uppercase text-[10px] tracking-widest transition-colors ${
                            activeTab === tab.id
                                ? `border-primary ${tab.color}`
                                : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300'
                        }`}
                        aria-current={activeTab === tab.id ? 'page' : undefined}
                    >
                        {tab.icon}
                        <span>{tab.label}</span>
                    </button>
                ))}
            </nav>
        </div>
    );
};

const RequestsHub: React.FC = () => {
    const [view, setView] = useState<RequestView>('extra');

    const renderContent = () => {
        switch (view) {
            case 'extra': return <SpecialPickup />;
            case 'hold': return <VacationHolds />;
            default: return <SpecialPickup />;
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <Tabs activeTab={view} setActiveTab={setView} />
            <div className="mt-8">
                {renderContent()}
            </div>
        </div>
    );
};

export default RequestsHub;