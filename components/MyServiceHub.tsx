import React, { useState, useEffect, useMemo } from 'react';
import Services from './Services.tsx';
import PropertySettings from './PropertySettings.tsx';
import Notifications from './Notifications.tsx';
import ServiceStatusOverview from './ServiceStatusOverview.tsx';
import PropertyManagement from './PropertyManagement.tsx';
import StartService from './StartService.tsx';
import { useProperty } from '../PropertyContext.tsx';
import { getSubscriptions } from '../services/mockApiService.ts';
import { Subscription, NewPropertyInfo } from '../types.ts';
import { 
    ChartPieIcon, TruckIcon, WrenchScrewdriverIcon, ListBulletIcon, BanknotesIcon
} from './Icons.tsx';
import AccountTransfer from './AccountTransfer.tsx';
import DangerZone from './DangerZone.tsx';
import CollectionHistory from './CollectionHistory.tsx';
import BillingHub from './BillingHub.tsx';

interface MyServiceHubProps {
    onCompleteSetup: (propertyInfo: NewPropertyInfo, services: { serviceId: string; useSticker: boolean; quantity: number }[]) => Promise<void>;
}

const TABS = [
    { id: 'overview', label: 'Overview', icon: <ChartPieIcon className="w-5 h-5" /> },
    { id: 'services', label: 'Services', icon: <TruckIcon className="w-5 h-5" /> },
    { id: 'history', label: 'History', icon: <ListBulletIcon className="w-5 h-5" /> },
    { id: 'billing', label: 'Billing', icon: <BanknotesIcon className="w-5 h-5" /> },
    { id: 'settings', label: 'Settings', icon: <WrenchScrewdriverIcon className="w-5 h-5" /> },
];

const Tab: React.FC<{
    id: string;
    label: string;
    icon: React.ReactNode;
    activeTab: string;
    onClick: (id: string) => void;
}> = ({ id, label, icon, activeTab, onClick }) => (
    <button
        onClick={() => onClick(id)}
        className={`group inline-flex flex-shrink-0 items-center justify-center sm:justify-start gap-2 whitespace-nowrap py-4 px-3 sm:px-4 border-b-2 font-medium transition-colors text-sm
            ${activeTab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
        aria-label={label}
    >
        {icon}
        <span className="font-bold hidden sm:inline">{label}</span>
    </button>
);


const MyServiceHub: React.FC<MyServiceHubProps> = ({ onCompleteSetup }) => {
    const { properties, selectedProperty, postNavAction, setCurrentView } = useProperty();
    const [activeTab, setActiveTab] = useState('services');
    const [allSubscriptions, setAllSubscriptions] = useState<Subscription[]>([]);
    const [loadingSubs, setLoadingSubs] = useState(true);
    const [showSetupWizard, setShowSetupWizard] = useState(false);

    const hasNoProperties = properties.length === 0;

    const serviceFlowType = useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        const type = params.get('type');
        if (type === 'recurring' || type === 'request') return type;
        return undefined;
    }, []);

    useEffect(() => {
        if (selectedProperty) {
            setActiveTab('services');
        }
    }, [selectedProperty]);

    useEffect(() => {
        if (postNavAction && postNavAction.targetTab) {
            setActiveTab(postNavAction.targetTab);
        }
    }, [postNavAction]);

    useEffect(() => {
        setLoadingSubs(true);
        getSubscriptions().then(subs => {
            setAllSubscriptions(subs);
            setLoadingSubs(false);
        });
    }, []);

    if (hasNoProperties || showSetupWizard) {
        return (
            <div className="animate-in fade-in duration-500">
                <StartService
                    onCompleteSetup={async (propertyInfo, services) => {
                        await onCompleteSetup(propertyInfo, services);
                        setShowSetupWizard(false);
                    }}
                    onCancel={() => {
                        if (hasNoProperties) {
                            setCurrentView('home');
                        } else {
                            setShowSetupWizard(false);
                        }
                    }}
                    isOnboarding={hasNoProperties}
                    serviceFlowType={serviceFlowType}
                />
            </div>
        );
    }

    if (!selectedProperty) {
        return (
            <div className="animate-in fade-in duration-500">
                <PropertyManagement onAddProperty={() => setShowSetupWizard(true)} />
            </div>
        );
    }
    
    if (loadingSubs) {
         return <div className="flex justify-center items-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>
    }
    
    const renderTabContent = () => {
        switch(activeTab) {
            case 'overview':
                return (
                     <div className="p-4 sm:p-6 lg:p-8">
                        <ServiceStatusOverview />
                    </div>
                );
            case 'services':
                return <Services onNavigate={setActiveTab} />;
            case 'history':
                return (
                    <div className="p-4 sm:p-6 lg:p-8">
                        <div className="max-w-4xl mx-auto">
                            <CollectionHistory />
                        </div>
                    </div>
                );
            case 'billing':
                return (
                    <div className="p-4 sm:p-6 lg:p-8">
                        <BillingHub />
                    </div>
                );
            case 'settings':
                return (
                    <div className="p-4 sm:p-6 lg:p-8">
                        <div className="max-w-4xl mx-auto space-y-12">
                            <PropertySettings />
                            <Notifications />
                            <AccountTransfer />
                            <DangerZone />
                        </div>
                    </div>
                );
            default:
                return null;
        }
    }

    return (
        <div className="animate-in fade-in duration-500">
            <style>{`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
            <div className="bg-white rounded-[1.5rem] shadow-lg">
                <nav className="flex items-center justify-around sm:justify-start sm:gap-2 border-b border-base-200 px-2 sm:px-6 overflow-x-auto no-scrollbar">
                    {TABS.map(tab => (
                         <Tab
                            key={tab.id}
                            id={tab.id}
                            label={tab.label}
                            icon={tab.icon}
                            activeTab={activeTab}
                            onClick={setActiveTab}
                        />
                    ))}
                </nav>
                <div>
                    {renderTabContent()}
                </div>
            </div>
        </div>
    );
};

export default MyServiceHub;
