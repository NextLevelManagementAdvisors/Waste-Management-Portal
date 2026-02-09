
import React, { useState, useEffect, useMemo } from 'react';
import Services from './Services.tsx';
import PropertySettings from './PropertySettings.tsx';
import Notifications from './Notifications.tsx';
import ServiceStatusOverview from './ServiceStatusOverview.tsx';
import PropertyManagement, { PropertyWithStatus } from './PropertyManagement.tsx';
import { useProperty } from '../PropertyContext.tsx';
import { Button } from './Button.tsx';
import { getSubscriptions, getDashboardState, getInvoices } from '../services/mockApiService.ts';
import { Subscription } from '../types.ts';
import { Card } from './Card.tsx';
import { 
    ChartPieIcon, TruckIcon, WrenchScrewdriverIcon, ListBulletIcon,
    CheckCircleIcon, PauseCircleIcon, XCircleIcon, CalendarDaysIcon, BanknotesIcon
} from './Icons.tsx';
import AccountTransfer from './AccountTransfer.tsx';
import DangerZone from './DangerZone.tsx';
import CollectionHistory from './CollectionHistory.tsx';
import Billing from './Billing.tsx';
import Subscriptions from './Subscriptions.tsx';

// --- Sub-component for the new Billing Tab ---
const PropertyBilling: React.FC = () => {
    const { selectedProperty, properties } = useProperty();
    const [outstandingBalance, setOutstandingBalance] = useState(0);
    const [monthlyTotal, setMonthlyTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    const isAllMode = !selectedProperty && properties.length > 0;

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [invoices, subscriptions] = await Promise.all([getInvoices(), getSubscriptions()]);
                
                const targetInvoices = isAllMode 
                    ? invoices 
                    : invoices.filter(i => i.propertyId === selectedProperty?.id);
                const balance = targetInvoices.filter(i => i.status !== 'Paid').reduce((acc, i) => acc + i.amount, 0);
                setOutstandingBalance(balance);

                const targetSubs = isAllMode
                    ? subscriptions
                    : subscriptions.filter(s => s.propertyId === selectedProperty?.id);
                const total = targetSubs.filter(s => s.status === 'active').reduce((acc, s) => acc + s.totalPrice, 0);
                setMonthlyTotal(total);

            } catch (error) {
                console.error("Failed to fetch billing summary:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [selectedProperty, isAllMode]);

    if (loading) {
        return <div className="flex justify-center items-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>
    }

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-1">
                    <div className="flex items-center gap-4">
                         <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center">
                            <BanknotesIcon className="w-6 h-6"/>
                        </div>
                        <div>
                             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Outstanding Balance</p>
                             <p className="text-3xl font-black text-gray-900 mt-1">${outstandingBalance.toFixed(2)}</p>
                        </div>
                    </div>
                </Card>
                 <Card className="md:col-span-2">
                     <div className="flex flex-col sm:flex-row justify-between items-center h-full gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-primary/5 text-primary flex items-center justify-center">
                                <CalendarDaysIcon className="w-6 h-6"/>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Next AutoPay</p>
                                <p className="text-lg font-black text-gray-900 mt-1">August 1, 2025</p>
                            </div>
                        </div>
                         <div className="text-left sm:text-right">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estimated Total</p>
                            <p className="text-lg font-black text-gray-900 mt-1">${monthlyTotal.toFixed(2)}</p>
                        </div>
                    </div>
                </Card>
            </div>
            <div><Subscriptions /></div>
            <div><Billing /></div>
        </div>
    );
};

// Tab button component
const TabButton: React.FC<{
    id: string;
    label: string;
    icon: React.ReactNode;
    activeTab: string;
    onClick: (id: string) => void;
}> = ({ id, label, icon, activeTab, onClick }) => (
    <button
        onClick={() => onClick(id)}
        className={`flex items-center gap-3 px-5 py-4 rounded-t-2xl font-black text-xs uppercase tracking-widest transition-all duration-300 border-b-4
            ${activeTab === id
                ? 'bg-white border-primary text-primary shadow-lg'
                : 'bg-transparent border-transparent text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }`}
    >
        {icon}
        {label}
    </button>
);

// Overview Card component for the new tab
const OverviewStatCard: React.FC<{ title: string; value: React.ReactNode; icon: React.ReactNode }> = ({ title, value, icon }) => (
    <Card className="flex-1 border-none ring-1 ring-base-200">
        <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/5 text-primary flex items-center justify-center">
                {icon}
            </div>
            <div>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{title}</h3>
                <div className="text-2xl font-black text-gray-900 mt-1">{value}</div>
            </div>
        </div>
    </Card>
);

const MyServiceHub: React.FC = () => {
    const { selectedProperty, setSelectedPropertyId } = useProperty();
    const [activeTab, setActiveTab] = useState('services');
    const [allSubscriptions, setAllSubscriptions] = useState<Subscription[]>([]);
    const [loadingSubs, setLoadingSubs] = useState(true);
    const [dashboardState, setDashboardState] = useState<any | null>(null);
    const [loadingDashboard, setLoadingDashboard] = useState(true);

    useEffect(() => {
        if (selectedProperty) {
            setActiveTab('services'); // Reset to services tab when property changes
            setLoadingDashboard(true);
            getDashboardState(selectedProperty.id).then(res => {
                setDashboardState(res.states[0]);
                setLoadingDashboard(false);
            });
        }
    }, [selectedProperty]);

    useEffect(() => {
        setLoadingSubs(true);
        getSubscriptions().then(subs => {
            setAllSubscriptions(subs);
            setLoadingSubs(false);
        });
    }, []);

    const propertyWithStatus: PropertyWithStatus | null = useMemo(() => {
        if (!selectedProperty) return null;
        
        const propSubs = allSubscriptions.filter(s => s.propertyId === selectedProperty.id);
        let status: 'active' | 'paused' | 'canceled' = 'canceled';
        if (propSubs.some(s => s.status === 'active')) {
            status = 'active';
        } else if (propSubs.some(s => s.status === 'paused')) {
            status = 'paused';
        }
        
        const activeSubs = propSubs.filter(s => s.status === 'active' || s.status === 'paused');
        return {
            ...selectedProperty,
            status,
            monthlyTotal: activeSubs.reduce((acc, s) => acc + s.totalPrice, 0),
            activeServicesCount: activeSubs.length,
        };
    }, [selectedProperty, allSubscriptions]);

    if (!selectedProperty) {
        return (
            <div className="animate-in fade-in duration-500">
                <PropertyManagement />
            </div>
        );
    }
    
    if (loadingSubs || !propertyWithStatus) {
         return <div className="flex justify-center items-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>
    }

    const statusConfig = {
        active: { icon: <CheckCircleIcon className="w-4 h-4" />, text: 'Service Active', color: 'text-primary', bg: 'bg-primary/5' },
        paused: { icon: <PauseCircleIcon className="w-4 h-4" />, text: 'Service On Hold', color: 'text-orange-500', bg: 'bg-orange-50' },
        canceled: { icon: <XCircleIcon className="w-4 h-4" />, text: 'Service Canceled', color: 'text-red-500', bg: 'bg-red-50' },
    };
    const currentStatus = statusConfig[propertyWithStatus.status];

    const TABS = [
        { id: 'overview', label: 'Overview', icon: <ChartPieIcon className="w-5 h-5" /> },
        { id: 'services', label: 'Services', icon: <TruckIcon className="w-5 h-5" /> },
        { id: 'history', label: 'History', icon: <ListBulletIcon className="w-5 h-5" /> },
        { id: 'billing', label: 'Billing', icon: <BanknotesIcon className="w-5 h-5" /> },
        { id: 'settings', label: 'Settings', icon: <WrenchScrewdriverIcon className="w-5 h-5" /> },
    ];

    const renderTabContent = () => {
        switch(activeTab) {
            case 'overview':
                return (
                     <div className="space-y-8 p-8 bg-white rounded-b-2xl shadow-2xl">
                        {loadingDashboard || !dashboardState ? (
                            <div className="flex justify-center p-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
                        ) : (
                            <>
                                <div className="flex flex-col md:flex-row gap-6">
                                    <OverviewStatCard 
                                        title="Next Pickup"
                                        icon={<CalendarDaysIcon className="w-6 h-6" />}
                                        value={dashboardState.nextPickup?.label || 'N/A'}
                                    />
                                    <OverviewStatCard 
                                        title="Monthly Total"
                                        icon={<BanknotesIcon className="w-6 h-6" />}
                                        value={`$${propertyWithStatus.monthlyTotal.toFixed(2)}`}
                                    />
                                </div>
                                <ServiceStatusOverview />
                            </>
                        )}
                    </div>
                );
            case 'services':
                return <div className="p-4 sm:p-8 bg-white rounded-b-2xl shadow-2xl"><Services /></div>;
            case 'history':
                return (
                    <div className="p-4 sm:p-8 bg-white rounded-b-2xl shadow-2xl">
                        <div className="max-w-4xl mx-auto">
                            <CollectionHistory />
                        </div>
                    </div>
                );
            case 'billing':
                return (
                    <div className="p-4 sm:p-8 bg-white rounded-b-2xl shadow-2xl">
                        <PropertyBilling />
                    </div>
                );
            case 'settings':
                return (
                    <div className="p-4 sm:p-8 bg-white rounded-b-2xl shadow-2xl">
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
        <div className="space-y-8 animate-in fade-in duration-500">
            <Card className="p-6">
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                        <div className={`px-3 py-1 ${currentStatus.bg} ${currentStatus.color} rounded-full flex items-center gap-2 w-fit mb-2`}>
                            {currentStatus.icon}
                            <span className="text-[10px] font-black uppercase tracking-widest">{currentStatus.text}</span>
                        </div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">{selectedProperty.address}</h1>
                    </div>
                    <Button variant="secondary" onClick={() => setSelectedPropertyId('all')} className="rounded-xl font-black uppercase text-xs tracking-widest">
                        Back to Portfolio
                    </Button>
                </div>
            </Card>

            <div>
                <div className="flex items-center gap-1 sm:gap-2 bg-gray-100 p-2 rounded-2xl overflow-x-auto">
                    {TABS.map(tab => (
                         <TabButton 
                            key={tab.id}
                            id={tab.id}
                            label={tab.label}
                            icon={tab.icon}
                            activeTab={activeTab}
                            onClick={setActiveTab}
                        />
                    ))}
                </div>
                
                <div className="mt-[-8px]">
                    {renderTabContent()}
                </div>
            </div>
        </div>
    );
};

export default MyServiceHub;
