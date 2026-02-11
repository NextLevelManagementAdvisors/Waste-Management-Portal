import React, { useEffect, useState } from 'react';
import { getDashboardState, PropertyState, setCollectionIntent } from '../services/mockApiService.ts';
import { useProperty } from '../PropertyContext.tsx';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { TruckIcon, ClockIcon, BellIcon, CheckCircleIcon, XCircleIcon } from './Icons.tsx';

const LiveTracker: React.FC<{ eta: string }> = ({ eta }) => (
    <Card className="bg-primary/5 border-primary/20 relative overflow-hidden border-none ring-1 ring-primary/20 shadow-xl">
        <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-primary animate-ping" />
                <span className="text-sm font-black text-primary uppercase tracking-widest">Live Collection Route</span>
            </div>
            <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-primary/10">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">Est. Arrival:</span>
                <span className="text-lg font-black text-primary">{eta}</span>
            </div>
        </div>
        
        <div className="relative py-8 px-4">
            <div className="absolute top-1/2 -mt-0.5 left-8 right-8 h-1 bg-gray-200 rounded-full" />
            <div className="absolute top-1/2 -mt-0.5 left-8 h-1 bg-primary rounded-full transition-all duration-1000" style={{ width: '65%' }} />
            
            <div className="relative flex justify-between">
                <div className="flex flex-col items-center">
                    <div className="w-4 h-4 rounded-full bg-primary ring-4 ring-white" />
                    <span className="text-[10px] font-black text-gray-400 uppercase mt-4">Depot</span>
                </div>
                <div className="absolute left-[65%] -mt-6 transform -translate-x-1/2 flex flex-col items-center">
                    <div className="bg-white border-2 border-primary rounded-2xl p-2 shadow-xl mb-2">
                        <TruckIcon className="w-6 h-6 text-primary" />
                    </div>
                    <span className="text-[10px] font-black text-primary uppercase">Truck</span>
                </div>
                <div className="flex flex-col items-center">
                    <div className="w-4 h-4 rounded-full bg-gray-200 ring-4 ring-white" />
                    <span className="text-[10px] font-black text-gray-400 uppercase mt-4">Destination</span>
                </div>
            </div>
        </div>
        <p className="text-sm font-medium text-gray-600 mt-8 text-center bg-white/50 py-3 rounded-xl border border-white/50 mx-4 mb-4">
            The collection crew is currently 4 stops away from your property.
        </p>
    </Card>
);

const ServiceStatusOverview: React.FC = () => {
    const { selectedPropertyId } = useProperty();
    const [state, setState] = useState<PropertyState | null>(null);
    const [loading, setLoading] = useState(true);
    const [intent, setIntent] = useState<'out' | 'skip' | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchData = () => {
        if (!selectedPropertyId || selectedPropertyId === 'all') {
            setLoading(false);
            return;
        }
        setLoading(true);
        getDashboardState(selectedPropertyId).then(res => {
            const currentState = res.states[0] || null;
            setState(currentState);
            setIntent(currentState?.collectionIntent || null);
            setLoading(false);
        });
    }

    useEffect(() => {
        fetchData();
    }, [selectedPropertyId]);

    const handleSetIntent = async (newIntent: 'out' | 'skip') => {
        if (!selectedPropertyId || !state?.nextPickup) return;
        setIsSubmitting(true);
        try {
            await setCollectionIntent(selectedPropertyId, newIntent, state.nextPickup.date);
            setIntent(newIntent);
        } catch (e) {
            console.error("Failed to set intent", e);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (loading || !state) {
        return (
            <div className="flex flex-col justify-center items-center h-48 gap-4">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary/20 border-t-primary"></div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Checking Route...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {state.nextPickup?.status === 'in-progress' && <LiveTracker eta={state.nextPickup.eta || 'Calculating...'} />}
            
            {state.nextPickup?.status === 'upcoming' && (
                <>
                    <Card className="bg-gray-900 text-white border-none flex flex-col md:flex-row items-center justify-between gap-8 p-10 shadow-2xl">
                         <div className="flex items-center gap-6">
                            <div className="w-20 h-20 bg-primary/20 rounded-3xl flex items-center justify-center text-primary border border-primary/20">
                                <ClockIcon className="w-10 h-10" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-2">Next Scheduled Visit</p>
                                <h2 className="text-4xl font-black tracking-tight">{state.nextPickup?.label || 'TBD'}</h2>
                                <p className="text-gray-400 font-medium mt-2">Residential Waste & Recycling Route</p>
                            </div>
                        </div>
                    </Card>
                    <Card className="border-none ring-1 ring-base-200">
                        <h3 className="font-black text-gray-900 uppercase text-xs tracking-widest mb-4">Set Collection Status</h3>
                        {intent ? (
                             <div className="p-6 bg-primary/5 text-center rounded-2xl border border-primary/10">
                                <p className="text-sm font-bold text-gray-900 mb-4">{intent === 'out' ? "Great! We'll see you then." : "Got it. We'll skip your stop this week."}</p>
                                <Button variant="secondary" onClick={() => setIntent(null)} className="text-xs font-black uppercase tracking-widest">Change Status</Button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Button onClick={() => handleSetIntent('out')} disabled={isSubmitting} variant="secondary" className="h-20 rounded-2xl flex flex-col gap-1 items-center justify-center hover:bg-teal-50 hover:border-primary/20 border-2 border-transparent">
                                    <CheckCircleIcon className="w-6 h-6 text-primary"/>
                                    <span className="font-black uppercase tracking-widest text-xs text-neutral">Putting Can Out</span>
                                </Button>
                                <Button onClick={() => handleSetIntent('skip')} disabled={isSubmitting} variant="secondary" className="h-20 rounded-2xl flex flex-col gap-1 items-center justify-center hover:bg-red-50 hover:border-red-200 border-2 border-transparent">
                                    <XCircleIcon className="w-6 h-6 text-red-500"/>
                                    <span className="font-black uppercase tracking-widest text-xs text-neutral">Skipping This Week</span>
                                </Button>
                            </div>
                        )}
                    </Card>
                </>
            )}

            {state.lastPickup && (
                 <Card className="border-none ring-1 ring-base-200">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-primary/5 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <CheckCircleIcon className="w-8 h-8" />
                        </div>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight">Last Collection: {state.lastPickup.label}</h2>
                        <p className="text-gray-500 mt-1">Want to leave feedback? You can now do so from the <span className="font-bold">History</span> tab.</p>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-none ring-1 ring-base-200">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                            <BellIcon className="w-5 h-5" />
                        </div>
                        <h3 className="font-black text-gray-900 uppercase text-xs tracking-widest">Route Notices</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex gap-4">
                            <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                            <p className="text-sm font-medium text-gray-600">Route is proceeding on schedule with no delays.</p>
                        </div>
                    </div>
                </Card>

                <Card className="border-none ring-1 ring-base-200">
                     <div className="flex items-center gap-4 mb-6">
                        <div className="w-10 h-10 bg-teal-50 text-primary rounded-xl flex items-center justify-center">
                            <TruckIcon className="w-5 h-5" />
                        </div>
                        <h3 className="font-black text-gray-900 uppercase text-xs tracking-widest">Cans In Use</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {state.activeServices.map((service, idx) => (
                            <span key={idx} className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-black text-gray-500 uppercase tracking-tighter">
                                {service}
                            </span>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default ServiceStatusOverview;