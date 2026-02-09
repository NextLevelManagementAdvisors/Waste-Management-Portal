
import React, { useEffect, useState } from 'react';
import { getDashboardState, PropertyState, AccountHealth } from '../services/mockApiService.ts';
import { View } from '../types.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { useProperty } from '../PropertyContext.tsx';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { 
    BanknotesIcon, ArrowRightIcon, CheckCircleIcon, SparklesIcon,
    TruckIcon, CalendarDaysIcon, ExclamationTriangleIcon, MegaphoneIcon
} from './Icons.tsx';

interface DashboardProps {
    setCurrentView: (view: View) => void;
}

const StatCard: React.FC<{ label: string; value: string; icon: React.ReactNode; }> = ({ label, value, icon }) => (
    <div className="flex items-center gap-4 p-5 rounded-[1.5rem] bg-white border border-base-200 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary">
            {icon}
        </div>
        <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.1em]">{label}</p>
            <p className="text-xl font-black text-gray-900 leading-none mt-1.5">{value}</p>
        </div>
    </div>
);

const QuickActionButton: React.FC<{ label: string; icon: React.ReactNode; onClick: () => void; }> = ({ label, icon, onClick }) => (
    <button onClick={onClick} className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-50 hover:bg-primary/5 rounded-2xl transition-all duration-300 text-center group">
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-gray-400 group-hover:text-primary transition-colors shadow-sm border border-base-200">
            {icon}
        </div>
        <p className="text-[10px] font-black text-gray-500 group-hover:text-primary uppercase tracking-widest transition-colors">{label}</p>
    </button>
);

const Dashboard: React.FC<DashboardProps> = ({ setCurrentView }) => {
    const { user, selectedPropertyId } = useProperty();
    const [data, setData] = useState<{ states: PropertyState[]; health: AccountHealth } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        getDashboardState(selectedPropertyId || 'all').then(res => {
            setData(res);
            setLoading(false);
        }).catch(err => {
            console.error("Failed to load dashboard state", err);
            setLoading(false);
        });
    }, [selectedPropertyId]);

    if (loading || !data) {
        return (
            <div className="flex flex-col justify-center items-center h-96 gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary"></div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Syncing Portfolio...</p>
            </div>
        );
    }
    
    const chartData = [
        { name: 'Monthly', value: data.health.totalMonthlyCost },
        { name: 'Balance', value: data.health.outstandingBalance }
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">Welcome, {user?.firstName}!</h1>
                    <p className="text-gray-500 font-medium mt-1 text-lg">Here's a snapshot of your account today.</p>
                </div>
                <div className="flex items-center gap-2">
                    <MegaphoneIcon className="w-4 h-4 text-primary" />
                    <p className="text-sm font-bold text-gray-600">{data.health.criticalAlerts[0]?.message || "All systems normal."}</p>
                </div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Quick Actions */}
                    <Card className="p-6">
                         <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Quick Actions</h2>
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <QuickActionButton label="Pay Balance" icon={<BanknotesIcon className="w-6 h-6"/>} onClick={() => setCurrentView('billing')} />
                            <QuickActionButton label="Extra Pickup" icon={<CalendarDaysIcon className="w-6 h-6"/>} onClick={() => setCurrentView('requests')} />
                            <QuickActionButton label="Report Issue" icon={<ExclamationTriangleIcon className="w-6 h-6"/>} onClick={() => setCurrentView('requests')} />
                            <QuickActionButton label="Manage Plan" icon={<TruckIcon className="w-6 h-6"/>} onClick={() => setCurrentView('myservice')} />
                         </div>
                    </Card>
                    
                    {/* Financial Snapshot */}
                    <Card className="p-6">
                        <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Financials</h2>
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 'bold' }} />
                                    <Tooltip cursor={{ fill: 'rgba(243, 244, 246, 0.5)' }} contentStyle={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '0.75rem' }} />
                                    <Bar dataKey="value" fill="#0D9488" radius={[8, 8, 0, 0]} barSize={50} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    {/* AI Concierge CTA */}
                     <Card className="bg-gray-900 text-white border-none relative overflow-hidden p-8 flex items-center gap-8">
                        <div className="relative z-10 flex-1">
                            <h3 className="text-2xl font-black tracking-tight mb-2 leading-tight">Need help navigating?</h3>
                            <p className="text-gray-400 text-sm font-medium mb-6 leading-relaxed">Ask about holiday schedules, extra pickups, or bill explanations.</p>
                            <Button onClick={() => setCurrentView('help')} className="rounded-xl py-3 px-6 font-black uppercase text-xs shadow-lg shadow-primary/20">
                                Chat with AI <ArrowRightIcon className="w-4 h-4 ml-2"/>
                            </Button>
                        </div>
                         <SparklesIcon className="w-24 h-24 text-primary/30 shrink-0" />
                    </Card>
                </div>

                {/* Right Column */}
                <div className="space-y-8">
                    <Card className="p-6">
                        <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Upcoming Collections</h2>
                        <div className="space-y-3">
                            {data.states.length > 0 ? data.states.map(state => (
                                <div key={state.property.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-base-200">
                                    <div>
                                        <p className="font-bold text-gray-900 text-sm">{state.property.address}</p>
                                        <p className={`text-xs font-black uppercase tracking-widest mt-1 ${state.nextPickup?.isToday ? 'text-primary' : 'text-gray-500'}`}>
                                            {state.nextPickup?.label || 'Not Scheduled'}
                                        </p>
                                    </div>
                                    {state.nextPickup?.isToday && (
                                        <div className="flex items-center gap-2">
                                             <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                                            <span className="text-[10px] font-black text-primary uppercase tracking-widest">In Progress</span>
                                        </div>
                                    )}
                                </div>
                            )) : (
                                <div className="text-center py-12">
                                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No scheduled pickups</p>
                                    <p className="text-xs text-gray-400 mt-1">There are no upcoming collections for the selected properties.</p>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
