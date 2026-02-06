
import React, { useEffect, useState, useMemo } from 'react';
import { getDashboardState, PropertyState, AccountHealth } from '../services/mockApiService';
import { View, ServiceAlert } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import { 
    BanknotesIcon, ClockIcon, MegaphoneIcon, XMarkIcon, 
    ExclamationTriangleIcon, CalendarDaysIcon, PauseCircleIcon, 
    TruckIcon, ArrowRightIcon, CheckCircleIcon, BuildingOffice2Icon,
    SparklesIcon, MapPinIcon
} from './Icons';
import { useProperty } from '../App';

interface DashboardProps {
    setCurrentView: (view: View) => void;
}

const HealthStat: React.FC<{ label: string; value: string; subValue?: string; icon: React.ReactNode }> = ({ label, value, subValue, icon }) => (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-base-200 shadow-sm">
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

const LiveTracker: React.FC<{ eta: string }> = ({ eta }) => (
    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 relative overflow-hidden">
        <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                <span className="text-xs font-black text-primary uppercase tracking-widest">Truck is on the way</span>
            </div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">ETA: {eta}</span>
        </div>
        
        {/* Animated Visual Track */}
        <div className="relative h-1 bg-gray-200 rounded-full mb-8">
            <div className="absolute top-0 left-0 h-full bg-primary rounded-full transition-all duration-1000" style={{ width: '70%' }} />
            <div className="absolute top-1/2 -mt-4 left-[70%] transform -translate-x-1/2 bg-white border-2 border-primary rounded-full p-1.5 shadow-lg">
                <TruckIcon className="w-4 h-4 text-primary" />
            </div>
            <div className="absolute top-1/2 -mt-1 left-0 w-2 h-2 bg-primary rounded-full" />
            <div className="absolute top-1/2 -mt-1 right-0 w-2 h-2 bg-gray-300 rounded-full" />
        </div>
        
        <p className="text-xs font-medium text-gray-600">Collecting at <span className="font-bold text-gray-900">3 stops</span> before reaching your address.</p>
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
        <Card className="relative overflow-hidden group border-none ring-1 ring-base-200">
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

            {nextPickup?.status === 'in-progress' ? (
                <LiveTracker eta={nextPickup.eta || 'Soon'} />
            ) : (
                <div className="bg-gray-50 rounded-2xl p-6 mb-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Next Collection</p>
                            <p className="text-2xl font-black text-gray-900 mt-1">{nextPickup?.label}</p>
                            {nextPickup?.eta && <p className="text-xs font-bold text-primary mt-1">Expected at {nextPickup.eta}</p>}
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Monthly Billing</p>
                            <p className="text-xl font-black text-gray-900 mt-1">${monthlyTotal.toFixed(2)}</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex gap-2 mt-4">
                <Button variant="secondary" size="sm" className="flex-1 rounded-xl text-xs font-black uppercase tracking-widest" onClick={() => onAction('special-pickup')}>Schedule Extra</Button>
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
            {/* Core Account Health Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <HealthStat label="Monthly Commitment" value={`$${data.health.totalMonthlyCost.toFixed(2)}`} subValue={`${data.health.activeServicesCount} active services`} icon={<BanknotesIcon className="w-6 h-6" />} />
                <HealthStat label="Outstanding" value={`$${data.health.outstandingBalance.toFixed(2)}`} subValue={data.health.outstandingBalance > 0 ? "Due now" : "Account paid in full"} icon={<CheckCircleIcon className="w-6 h-6" />} />
                <HealthStat label="Managed Locations" value={data.health.activePropertiesCount.toString()} subValue="Active service addresses" icon={<BuildingOffice2Icon className="w-6 h-6" />} />
            </div>

            {/* Collection Lifecycle Area */}
            <div>
                <div className="flex justify-between items-center mb-6 px-2">
                    <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Service Operations</h2>
                    <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase tracking-widest" onClick={() => setCurrentView('services')}>View Catalog</Button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {data.states.map(state => (
                        <PropertyLifecycleCard key={state.property.id} state={state} onAction={setCurrentView} />
                    ))}
                </div>
            </div>

            {/* AI Support & Critical Shortcuts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 bg-gray-900 text-white border-none shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-primary/30 transition-colors" />
                    <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
                        <div className="flex-1">
                            <h3 className="text-4xl font-black tracking-tight mb-4">Concierge AI</h3>
                            <p className="text-gray-400 font-medium mb-8 text-lg leading-relaxed">Check for holiday delays, weather impacts, or schedule changes. Our intelligence layer searches the web for live system updates.</p>
                            <Button onClick={() => setCurrentView('support')} size="lg" className="rounded-2xl px-12 h-16 text-lg shadow-xl shadow-primary/20">Launch AI Agent</Button>
                        </div>
                        <div className="hidden md:flex w-56 h-56 bg-white/5 rounded-[2.5rem] items-center justify-center border border-white/10 backdrop-blur-sm">
                            <SparklesIcon className="w-24 h-24 text-primary animate-pulse" />
                        </div>
                    </div>
                </Card>

                <div className="grid grid-cols-1 gap-4">
                     <button onClick={() => setCurrentView('vacation-holds')} className="flex items-center justify-between p-6 bg-white border border-base-200 rounded-[1.5rem] hover:border-primary hover:shadow-xl transition-all group shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-gray-50 rounded-xl group-hover:bg-primary/10 text-gray-400 group-hover:text-primary transition-colors">
                                <PauseCircleIcon className="w-6 h-6" />
                            </div>
                            <div className="text-left">
                                <p className="font-black text-gray-900 uppercase text-[10px] tracking-widest">Availability</p>
                                <p className="font-bold text-gray-700">Vacation Holds</p>
                            </div>
                        </div>
                        <ArrowRightIcon className="w-5 h-5 text-gray-300 group-hover:text-primary" />
                    </button>
                    <button onClick={() => setCurrentView('missed-pickup')} className="flex items-center justify-between p-6 bg-white border border-base-200 rounded-[1.5rem] hover:border-red-500 hover:shadow-xl transition-all group shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-gray-50 rounded-xl group-hover:bg-red-50 text-gray-400 group-hover:text-red-500 transition-colors">
                                <ExclamationTriangleIcon className="w-6 h-6" />
                            </div>
                            <div className="text-left">
                                <p className="font-black text-gray-900 uppercase text-[10px] tracking-widest">Incident Report</p>
                                <p className="font-bold text-gray-700">Report Missed Pickup</p>
                            </div>
                        </div>
                        <ArrowRightIcon className="w-5 h-5 text-gray-300 group-hover:text-red-500" />
                    </button>
                    <Card className="bg-gray-100 flex flex-col justify-center items-center text-center p-6 border-none">
                         <MegaphoneIcon className="w-6 h-6 text-gray-400 mb-2" />
                         <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">System Alerts</p>
                         <p className="text-sm font-bold text-gray-600 mt-1">No service interruptions in your area.</p>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
