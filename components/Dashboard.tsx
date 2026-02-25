import React, { useEffect, useState, useCallback } from 'react';
import { getDashboardState, PropertyState, AccountHealth, dismissTipPrompt } from '../services/apiService.ts';
import { View } from '../types.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import Modal from './Modal.tsx';
import { useProperty } from '../PropertyContext.tsx';
import PayBalanceModal from './PayBalanceModal.tsx';
import { 
    BanknotesIcon, ArrowRightIcon, CheckCircleIcon, SparklesIcon,
    TruckIcon, CalendarDaysIcon, ExclamationTriangleIcon, ClockIcon, CurrencyDollarIcon
} from './Icons.tsx';

interface DashboardProps {
    setCurrentView: (view: View) => void;
}

const QuickActionButton: React.FC<{ label: string; icon: React.ReactNode; onClick: () => void; }> = ({ label, icon, onClick }) => (
    <button onClick={onClick} className="flex flex-col items-center justify-center gap-3 p-6 bg-gray-50 hover:bg-primary/5 rounded-2xl transition-all duration-300 text-center group aspect-square">
        <div className="text-gray-400 group-hover:text-primary transition-colors">
            {icon}
        </div>
        <p className="text-[10px] font-black text-gray-500 group-hover:text-primary uppercase tracking-widest transition-colors">{label}</p>
    </button>
);

const Dashboard: React.FC<DashboardProps> = ({ setCurrentView }) => {
    const { user, selectedPropertyId, setPostNavAction } = useProperty();
    const [data, setData] = useState<{ states: PropertyState[]; health: AccountHealth } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isTipPromptOpen, setIsTipPromptOpen] = useState(false);
    const [isPayBalanceModalOpen, setIsPayBalanceModalOpen] = useState(false);

    const refreshDashboard = useCallback(() => {
        setLoading(true);
        setError(null);
        getDashboardState(selectedPropertyId || 'all').then(res => {
            setData(res);
            setLoading(false);
            const lastPickup = res.states[0]?.lastPickup;
            if (lastPickup?.showTipPrompt) {
                setIsTipPromptOpen(true);
            }
        }).catch(err => {
            console.error("Failed to load dashboard state", err);
            setError('Failed to load your dashboard. Please try again.');
            setLoading(false);
        });
    }, [selectedPropertyId]);

    useEffect(() => {
        refreshDashboard();
    }, [refreshDashboard]);
    
    const lastPickupState = data?.states.find(s => s.lastPickup)?.lastPickup;

    const handleLeaveTipClick = () => {
        if (!lastPickupState) return;
        setPostNavAction({
            targetView: 'myservice',
            targetTab: 'history',
            action: 'openTipModal',
            targetDate: lastPickupState.date
        });
        setIsTipPromptOpen(false);
    };

    const handleDismissTipPrompt = () => {
        if (!lastPickupState || !data?.states[0].property.id) return;
        dismissTipPrompt(data.states[0].property.id, lastPickupState.date);
        setIsTipPromptOpen(false);
    };
    
    const handlePaymentSuccess = () => {
        setIsPayBalanceModalOpen(false);
        refreshDashboard();
    };

    if (error) {
        return (
            <div className="flex flex-col justify-center items-center h-96 gap-4">
                <p className="text-sm font-bold text-red-600">{error}</p>
                <button type="button" onClick={refreshDashboard} className="text-xs font-black text-primary uppercase tracking-widest hover:underline">
                    Try Again
                </button>
            </div>
        );
    }

    if (loading || !data) {
        return (
            <div className="flex flex-col justify-center items-center h-96 gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary"></div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Syncing Portfolio...</p>
            </div>
        );
    }

    const upcomingPickups = data.states.filter(s => s.nextPickup);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div>
                <h1 className="text-4xl font-black text-gray-900 tracking-tight">Welcome, {user?.firstName}!</h1>
                <p className="text-gray-500 font-medium mt-1 text-lg mb-4">Here's a snapshot of your account today.</p>
                {data.health.criticalAlerts.length > 0 && (
                     <button type="button" onClick={() => setIsPayBalanceModalOpen(true)} className="w-full flex items-center gap-3 p-3 bg-teal-50 rounded-xl border border-teal-200 hover:bg-teal-100 hover:border-teal-300 transition-all text-left cursor-pointer">
                        <ClockIcon className="w-5 h-5 text-primary" />
                        <p className="text-sm font-bold text-teal-800 flex-1">{data.health.criticalAlerts[0]?.message}</p>
                        <ArrowRightIcon className="w-4 h-4 text-teal-400" />
                    </button>
                )}
            </div>

            {/* Main Content */}
            <div className="space-y-8">
                 <Card className="p-6">
                     <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Quick Actions</h2>
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <QuickActionButton label="Pay Balance" icon={<BanknotesIcon className="w-8 h-8"/>} onClick={() => setIsPayBalanceModalOpen(true)} />
                        <QuickActionButton label="Extra Pickup" icon={<CalendarDaysIcon className="w-8 h-8"/>} onClick={() => setCurrentView('requests')} />
                        <QuickActionButton label="Report Issue" icon={<ExclamationTriangleIcon className="w-8 h-8"/>} onClick={() => setPostNavAction({ targetView: 'requests', targetTab: 'missed', action: 'openTab' })} />
                        <QuickActionButton label="Manage Plan" icon={<TruckIcon className="w-8 h-8"/>} onClick={() => setCurrentView('myservice')} />
                     </div>
                </Card>

                <div>
                    <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4 px-2">Upcoming Collections</h2>
                    <div className="space-y-4">
                        {upcomingPickups.length > 0 ? upcomingPickups.map(state => (
                            <Card key={state.property.id} className="p-4 !rounded-xl shadow-md border-base-200 cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all" onClick={() => setCurrentView('myservice')}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-gray-900 text-sm">{state.property.address}</p>
                                        <p className={`text-xs font-black uppercase tracking-widest mt-1 ${state.nextPickup?.isToday ? 'text-primary' : 'text-gray-500'}`}>
                                            {state.nextPickup?.label || 'Not Scheduled'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {state.nextPickup?.isToday && state.nextPickup.status === 'in-progress' && (
                                            <>
                                                <div className="w-2 h-2 rounded-full bg-primary" />
                                                <span className="text-[10px] font-black text-primary uppercase tracking-widest">In Progress</span>
                                            </>
                                        )}
                                        <ArrowRightIcon className="w-4 h-4 text-gray-300" />
                                    </div>
                                </div>
                            </Card>
                        )) : (
                            <Card className="text-center py-12 !rounded-xl shadow-md border-base-200">
                                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No scheduled pickups</p>
                                <p className="text-xs text-gray-400 mt-1">There are no upcoming collections for the selected properties.</p>
                            </Card>
                        )}
                    </div>
                </div>

                <Card className="p-6">
                    <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Financials</h2>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <button type="button" onClick={() => setCurrentView('myservice')} className="flex-1 p-6 bg-primary/5 rounded-2xl border border-primary/10 text-left hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group">
                            <p className="text-xs font-bold text-primary uppercase tracking-wider group-hover:text-teal-700">Total Monthly Cost</p>
                            <p className="text-3xl font-black text-gray-900 mt-1">${Number(data.health.totalMonthlyCost).toFixed(2)}</p>
                        </button>
                        <button type="button" onClick={() => setIsPayBalanceModalOpen(true)} className={`flex-1 p-6 rounded-2xl border text-left hover:shadow-md transition-all cursor-pointer group ${
                            Number(data.health.outstandingBalance) > 0
                                ? 'bg-red-50 border-red-100 hover:border-red-300'
                                : 'bg-primary/5 border-primary/10 hover:border-primary/30'
                        }`}>
                            <p className={`text-xs font-bold uppercase tracking-wider ${
                                Number(data.health.outstandingBalance) > 0
                                    ? 'text-red-600 group-hover:text-red-700'
                                    : 'text-primary group-hover:text-teal-700'
                            }`}>Outstanding Balance</p>
                            <p className={`text-3xl font-black mt-1 ${
                                Number(data.health.outstandingBalance) > 0 ? 'text-red-800' : 'text-gray-900'
                            }`}>${Number(data.health.outstandingBalance).toFixed(2)}</p>
                        </button>
                    </div>
                </Card>

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
            
             <Modal isOpen={isTipPromptOpen} onClose={handleDismissTipPrompt} title="Great Service Today?">
                <div className="text-center py-4">
                    <CurrencyDollarIcon className="w-16 h-16 text-primary mx-auto mb-4" />
                    <h3 className="text-xl font-black text-neutral">Appreciate your driver?</h3>
                    <p className="text-gray-600 mt-2">
                        Your collection was completed successfully. Would you like to leave a tip for your driver, <span className="font-bold">{lastPickupState?.driverName || 'the crew'}</span>?
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
                        <Button onClick={handleDismissTipPrompt} variant="secondary" className="rounded-xl px-8 font-black uppercase tracking-widest text-xs h-14">Not Now</Button>
                        <Button onClick={handleLeaveTipClick} className="rounded-xl px-8 font-black uppercase tracking-widest text-xs h-14">Leave a Tip</Button>
                    </div>
                </div>
            </Modal>

            <PayBalanceModal
                isOpen={isPayBalanceModalOpen}
                onClose={() => setIsPayBalanceModalOpen(false)}
                onSuccess={handlePaymentSuccess}
            />
        </div>
    );
};

export default Dashboard;