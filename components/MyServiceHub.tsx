import React, { useState, useEffect, useCallback } from 'react';
import Services from './Services.tsx';
import PropertySettings from './PropertySettings.tsx';
import Notifications from './Notifications.tsx';
import ServiceStatusOverview from './ServiceStatusOverview.tsx';
import PropertyManagement from './PropertyManagement.tsx';
import StartService from './StartService.tsx';
import { useProperty } from '../PropertyContext.tsx';
import { getSubscriptions } from '../services/apiService.ts';
import { Subscription, NewPropertyInfo } from '../types.ts';
import {
    ChartPieIcon, TruckIcon, WrenchScrewdriverIcon, ListBulletIcon
} from './Icons.tsx';
import TabBar from './TabBar.tsx';
import AccountTransfer from './AccountTransfer.tsx';
import DangerZone from './DangerZone.tsx';
import CollectionHistory from './CollectionHistory.tsx';

interface MyServiceHubProps {
    onCompleteSetup: (propertyInfo: NewPropertyInfo, services: { serviceId: string; useSticker: boolean; quantity: number }[]) => Promise<void>;
}

const TABS = [
    { id: 'overview', label: 'Overview', icon: <ChartPieIcon className="w-5 h-5" /> },
    { id: 'services', label: 'Services', icon: <TruckIcon className="w-5 h-5" /> },
    { id: 'history', label: 'History', icon: <ListBulletIcon className="w-5 h-5" /> },
    { id: 'settings', label: 'Settings', icon: <WrenchScrewdriverIcon className="w-5 h-5" /> },
];

const VALID_TABS = new Set(TABS.map(t => t.id));

function getTabFromUrl(): string {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab && VALID_TABS.has(tab) ? tab : 'overview';
}

const MyServiceHub: React.FC<MyServiceHubProps> = ({ onCompleteSetup }) => {
    const { properties, selectedProperty, postNavAction, setCurrentView } = useProperty();
    const [activeTab, setActiveTabRaw] = useState(getTabFromUrl);

    const setActiveTab = useCallback((tab: string) => {
        const validTab = VALID_TABS.has(tab) ? tab : 'overview';
        setActiveTabRaw(validTab);
        const url = new URL(window.location.href);
        if (validTab === 'overview') {
            url.searchParams.delete('tab');
        } else {
            url.searchParams.set('tab', validTab);
        }
        window.history.replaceState({}, '', url.toString());
    }, []);
    const [allSubscriptions, setAllSubscriptions] = useState<Subscription[]>([]);
    const [loadingSubs, setLoadingSubs] = useState(true);
    const [showSetupWizard, setShowSetupWizard] = useState(false);

    const hasNoProperties = properties.length === 0;

    const [serviceFlowType, setServiceFlowType] = useState<'recurring' | 'request' | undefined>(() => {
        const params = new URLSearchParams(window.location.search);
        const type = params.get('type');
        if (type === 'recurring' || type === 'request') return type;
        return undefined;
    });

    useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search);
            const type = params.get('type');
            if (type === 'recurring' || type === 'request') {
                setServiceFlowType(type);
            } else {
                setServiceFlowType(undefined);
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    useEffect(() => {
        if (selectedProperty) {
            setActiveTabRaw('overview');
        }
    }, [selectedProperty]);

    useEffect(() => {
        if (postNavAction && postNavAction.targetTab) {
            setActiveTab(postNavAction.targetTab);
        }
        if (postNavAction && postNavAction.action === 'openSetupWizard') {
            setShowSetupWizard(true);
        }
    }, [postNavAction]);

    useEffect(() => {
        setLoadingSubs(true);
        getSubscriptions().then(subs => {
            setAllSubscriptions(subs);
            setLoadingSubs(false);
        });
    }, []);

    const activeOrPausedSubs = allSubscriptions.filter(s => s.status === 'active' || s.status === 'paused');
    const hasExistingSubscriptions = !loadingSubs && activeOrPausedSubs.length > 0;

    if (hasNoProperties && loadingSubs) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-500 font-medium">Checking your account...</p>
                </div>
            </div>
        );
    }

    if (showSetupWizard || (hasNoProperties && !hasExistingSubscriptions && !loadingSubs)) {
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

    if (hasNoProperties && hasExistingSubscriptions) {
        return (
            <div className="animate-in fade-in duration-500 max-w-3xl mx-auto">
                <div className="bg-white rounded-2xl shadow-lg border border-base-200 p-8 mb-6">
                    <h2 className="text-2xl font-black text-gray-900 mb-2">Welcome Back!</h2>
                    <p className="text-gray-600 mb-6">We found your existing plan. Add your property address to manage everything from the portal.</p>
                    <div className="space-y-3 mb-6">
                        {activeOrPausedSubs.map(sub => (
                            <div key={sub.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-base-200">
                                <div>
                                    <p className="font-bold text-gray-900">{sub.serviceName}</p>
                                    <p className="text-sm text-gray-500">
                                        {sub.status === 'active' ? 'Active' : 'Paused'} &bull; ${Number(sub.totalPrice ?? sub.price ?? 0).toFixed(2)}/mo
                                    </p>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${sub.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                    {sub.status === 'active' ? 'Active' : 'Paused'}
                                </span>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() => setShowSetupWizard(true)}
                        className="w-full bg-primary text-white font-black uppercase tracking-widest text-xs py-4 rounded-2xl shadow-xl shadow-primary/20 hover:bg-primary-focus transition-colors"
                    >
                        Add Your Property
                    </button>
                </div>
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
                return <Services />;
            case 'history':
                return (
                    <div className="p-4 sm:p-6 lg:p-8">
                        <div className="max-w-4xl mx-auto">
                            <CollectionHistory />
                        </div>
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
            <div className="bg-white rounded-[1.5rem] shadow-lg">
                <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
                <div>
                    {renderTabContent()}
                </div>
            </div>
        </div>
    );
};

export default MyServiceHub;
