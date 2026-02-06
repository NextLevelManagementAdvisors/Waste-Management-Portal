
import React, { useEffect, useState, useMemo } from 'react';
import { getDashboardState, PropertyState, AccountHealth } from '../services/mockApiService';
import { View, ServiceAlert } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import { 
    BanknotesIcon, ClockIcon, MegaphoneIcon, XMarkIcon, 
    ExclamationTriangleIcon, CalendarDaysIcon, PauseCircleIcon, 
    TruckIcon, ArrowRightIcon, CheckCircleIcon, BuildingOffice2Icon
} from './Icons';
import { useProperty } from '../App';

interface DashboardProps {
    setCurrentView: (view: View) => void;
}

const HealthStat: React.FC<{ label: string; value: string; subValue?: string; icon: React.ReactNode }> = ({ label, value, subValue, icon }) => (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-base-200">
        <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
            {icon}
        </div>
        <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
            <p className="text-xl font-black text-gray-900 leading-none mt-1">{value}</p>
            {subValue && <p className="text-[10px] text-gray-500 mt-1">{subValue}</p>}
        </div>
    </div>
);

const PropertyLifecycleCard: React.FC<{ state: PropertyState, onAction: (view: View) => void }> = ({ state, onAction }) => {
    const { nextPickup, property, monthlyTotal } = state;
    
    const statusConfig = {
        'upcoming': { color: 'text-blue-600', bg: 'bg-blue-50', icon: <ClockIcon className="w-6 h-6" />, label: 'Upcoming' },
        'in-progress': { color: 'text-orange-600', bg: 'bg-orange-50', icon: <TruckIcon className="w-6 h-6" />, label: 'Out for Collection' },
        'completed': { color: 'text-green-600', bg: 'bg-green-50', icon: <CheckCircleIcon className="w-6 h-6" />, label: 'Collected' },
        'paused': { color: 'text-gray-600', bg: 'bg-gray-50', icon: <PauseCircleIcon className="w-6 h-6" />, label: 'On Hold' },
        'missed': { color: 'text-red-600', bg: 'bg-red-50', icon: <ExclamationTriangleIcon className="w-6 h-6" />, label: 'Missed' },
    };

    const config = statusConfig[nextPickup?.status || 'upcoming'];

    return (
        <Card className="relative overflow-hidden group">
            <div className="flex justify-between items-start mb-6">
                <div className="flex-1">
                    <p className="text-xs font-black text-primary uppercase tracking-tighter mb-1">{property.serviceType} Service</p>
                    <h3 className="text-xl font-black text-gray-900 truncate pr-4">{property.address}</h3>
                </div>
                <div className={`px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 ${config.bg} ${config.color}`}>
                    {config.icon}
                    {config.label}
                </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-6 mb-6">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Next Collection</p>
                        <p className="text-2xl font-black text-gray-900 mt-1">{nextPickup?.label}</p>
                        {nextPickup?.eta && <p className="text-xs font-bold text-primary mt-1">Expected at {nextPickup.eta}</p>}
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Billing</p>
                        <p className="text-xl font-black text-gray-900 mt-1">${monthlyTotal.toFixed(2)}</p>
                        <p className="text-[10px] text-gray-500">/ mo</p>
                    </div>
                </div>
            </div>

            <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1 rounded-xl text-xs font-black uppercase" onClick={() => onAction('special-pickup')}>Schedule Extra</Button>
                <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => onAction('property-settings')}><ArrowRightIcon className="w-4 h-4" /></Button>
            </div>
        </Card>
    );
};

const Dashboard: React.FC<DashboardProps> = ({ setCurrentView }) => {
    const { selectedPropertyId } = useProperty();
    const [data, setData] = useState<{ states: PropertyState[]; health: AccountHealth } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        getDashboardState(selectedPropertyId || 'all').then(res => {
            if (mounted) {
                setData(res);
                setLoading(false);
            }
        });
        return () => { mounted = false; };
    }, [selectedPropertyId]);

    if (loading || !data) {
        return (
            <div className="flex flex-col justify-center items-center h-96 gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary"></div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Synchronizing Portal...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Proactive Account Health Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <HealthStat label="Monthly Commitment" value={`$${data.health.totalMonthlyCost.toFixed(2)}`} subValue={`${data.health.activeServicesCount} services`} icon={<BanknotesIcon className="w-6 h-6" />} />
                <HealthStat label="Outstanding" value={`$${data.health.outstandingBalance.toFixed(2)}`} subValue={data.health.outstandingBalance > 0 ? "Due now" : "All clear"} icon={<CheckCircleIcon className="w-6 h-6" />} />
                <HealthStat label="Properties" value={data.health.activePropertiesCount.toString()} subValue="Managed locations" icon={<BuildingOffice2Icon className="w-6 h-6" />} />
                <HealthStat label="System Status" value="Healthy" subValue="No outages reported" icon={<MegaphoneIcon className="w-6 h-6" />} />
            </div>

            {/* Property Lifecycle Area */}
            <div>
                <div className="flex justify-between items-center mb-6 px-2">
                    <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Collection Lifecycle</h2>
                    <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase tracking-widest" onClick={() => setCurrentView('services')}>+ Add New Service</Button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {data.states.map(state => (
                        <PropertyLifecycleCard key={state.property.id} state={state} onAction={setCurrentView} />
                    ))}
                </div>
            </div>

            {/* Support & Quick Access */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 bg-gray-900 text-white border-none shadow-2xl">
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="flex-1">
                            <h3 className="text-3xl font-black tracking-tight mb-2">Need a Hand?</h3>
                            <p className="text-gray-400 font-medium mb-6">Our Smart Assistant can help you pause services, report missed pickups, or explain your bill in seconds.</p>
                            <Button onClick={() => setCurrentView('support')} size="lg" className="rounded-2xl px-10 shadow-xl shadow-primary/20">Launch AI Chat</Button>
                        </div>
                        <div className="hidden md:block w-48 h-48 bg-primary/10 rounded-full flex items-center justify-center border border-white/10">
                            <TruckIcon className="w-24 h-24 text-primary" />
                        </div>
                    </div>
                </Card>

                <div className="space-y-4">
                     <button onClick={() => setCurrentView('vacation-holds')} className="w-full flex items-center justify-between p-6 bg-white border border-base-200 rounded-[1.5rem] hover:border-primary hover:shadow-xl transition-all group">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-gray-50 rounded-xl group-hover:bg-primary/10 text-gray-400 group-hover:text-primary transition-colors">
                                <PauseCircleIcon className="w-6 h-6" />
                            </div>
                            <div className="text-left">
                                <p className="font-black text-gray-900 uppercase text-[10px] tracking-widest">Vacation</p>
                                <p className="font-bold text-gray-700">Pause All Service</p>
                            </div>
                        </div>
                        <ArrowRightIcon className="w-5 h-5 text-gray-300 group-hover:text-primary" />
                    </button>
                    <button onClick={() => setCurrentView('missed-pickup')} className="w-full flex items-center justify-between p-6 bg-white border border-base-200 rounded-[1.5rem] hover:border-primary hover:shadow-xl transition-all group">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-gray-50 rounded-xl group-hover:bg-red-100 text-gray-400 group-hover:text-red-600 transition-colors">
                                <ExclamationTriangleIcon className="w-6 h-6" />
                            </div>
                            <div className="text-left">
                                <p className="font-black text-gray-900 uppercase text-[10px] tracking-widest">Help</p>
                                <p className="font-bold text-gray-700">Report Missed Pickup</p>
                            </div>
                        </div>
                        <ArrowRightIcon className="w-5 h-5 text-gray-300 group-hover:text-primary" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
