import React, { useState, useEffect } from 'react';
import SpecialPickup from './SpecialPickup.tsx';
import VacationHolds from './VacationHolds.tsx';
import MissedPickup from './MissedPickup.tsx';
import { useProperty } from '../PropertyContext.tsx';
import { CalendarDaysIcon, PauseCircleIcon, ExclamationTriangleIcon, HomeIcon, PlusCircleIcon } from './Icons.tsx';
import { Button } from './Button.tsx';

type RequestView = 'extra' | 'hold' | 'missed';

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
        { id: 'missed', label: 'Report Issue', icon: <ExclamationTriangleIcon className="w-5 h-5" />, color: 'text-red-500' },
    ] as const;

    return (
        <div className="border-b border-base-200">
            <nav className="-mb-px flex space-x-3 sm:space-x-6" aria-label="Tabs">
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
    const { postNavAction, setPostNavAction, properties, setCurrentView } = useProperty();
    const [view, setView] = useState<RequestView>('extra');
    
    useEffect(() => {
        if (postNavAction && postNavAction.targetView === 'requests' && postNavAction.targetTab) {
            setView(postNavAction.targetTab as RequestView);
            setPostNavAction(null);
        }
    }, [postNavAction, setPostNavAction]);

    if (properties.length === 0) {
        return (
            <div className="animate-in fade-in duration-500 flex items-center justify-center min-h-[400px]">
                <div className="text-center max-w-md mx-auto p-8">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                        <HomeIcon className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-xl font-black text-gray-900 mb-2">No Service Address Yet</h2>
                    <p className="text-gray-500 mb-8">
                        To submit requests like extra pickups, vacation holds, or report issues, you'll need to add a service address first.
                    </p>
                    <Button
                        onClick={() => setCurrentView('myservice')}
                        className="rounded-xl px-8 py-3 font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20 inline-flex items-center gap-2"
                    >
                        <PlusCircleIcon className="w-5 h-5" />
                        Add Your Address
                    </Button>
                </div>
            </div>
        );
    }

    const renderContent = () => {
        switch (view) {
            case 'extra': return <SpecialPickup />;
            case 'hold': return <VacationHolds />;
            case 'missed': return <MissedPickup />;
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