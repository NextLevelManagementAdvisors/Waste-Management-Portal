import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useProperty } from '../PropertyContext.tsx';
import { getSubscriptions, pauseSubscriptionsForProperty, resumeSubscriptionsForProperty } from '../services/apiService.ts';
import { Subscription, Property } from '../types.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import Modal from './Modal.tsx';
import { PauseCircleIcon, PlayCircleIcon, ArrowRightIcon, CheckCircleIcon } from './Icons.tsx';

const PortfolioHoldCard: React.FC<{
    property: Property;
    subscriptions: Subscription[];
    onSelect: (id: string) => void;
}> = ({ property, subscriptions, onSelect }) => {
    const propSubs = subscriptions.filter(s => s.propertyId === property.id && s.status !== 'canceled');
    const isPaused = propSubs.some(s => s.status === 'paused');
    
    return (
        <Card className="flex flex-col p-6">
            <div className="flex justify-between items-center mb-2">
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">{property.serviceType}</p>
                <div className={`px-3 py-1 rounded-full ${isPaused ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-500'}`}>
                    <span className="text-[10px] font-black uppercase tracking-widest">
                        {isPaused ? 'On Hold' : 'Service Active'}
                    </span>
                </div>
            </div>

            <h3 className="text-2xl font-black text-gray-900 leading-tight mb-auto">
                {property.address}
            </h3>

            <div className="flex items-end justify-end mt-4">
                <Button 
                    onClick={() => onSelect(property.id)} 
                    variant="primary" 
                    className="rounded-lg px-4 py-3 font-black uppercase text-[10px] tracking-widest"
                >
                    Manage Holds
                </Button>
            </div>
        </Card>
    );
};

const VacationHolds: React.FC = () => {
    const { selectedProperty, properties, setSelectedPropertyId } = useProperty();
    const [allSubscriptions, setAllSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [resumeDate, setResumeDate] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const subsData = await getSubscriptions();
            setAllSubscriptions(subsData);
        } catch (error) {
            console.error("Failed to fetch subscriptions:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const propertyHoldStatus = useMemo(() => {
        if (!selectedProperty) return null;
        const propSubs = allSubscriptions.filter(s => s.propertyId === selectedProperty.id && s.status !== 'canceled');
        const pausedSub = propSubs.find(s => s.status === 'paused');
        return {
            isPaused: !!pausedSub,
            pausedUntil: pausedSub?.pausedUntil || null,
        };
    }, [allSubscriptions, selectedProperty]);

    const handleSetHoldClick = () => {
        const today = new Date();
        today.setDate(today.getDate() + 7);
        setResumeDate(today.toISOString().split('T')[0]);
        setIsModalOpen(true);
    };

    const handleConfirmPause = async () => {
        if (!selectedProperty || !resumeDate) return;
        
        setIsUpdating(true);
        try {
            await pauseSubscriptionsForProperty(selectedProperty.id, resumeDate);
            await fetchData();
            setIsModalOpen(false);
        } catch (error) {
            console.error("Failed to pause subscriptions:", error);
            alert("Pausing failed. Please try again.");
        } finally {
            setIsUpdating(false);
        }
    };
    
    const handleResumeAll = async () => {
        if (!selectedProperty) return;
        setIsUpdating(true);
        try {
            await resumeSubscriptionsForProperty(selectedProperty.id);
            await fetchData();
        } catch (error) {
            console.error("Failed to resume subscriptions:", error);
             alert("Resuming failed. Please try again.");
        } finally {
            setIsUpdating(false);
        }
    };
    
    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    // --- PORTFOLIO VIEW ---
    if (!selectedProperty) {
        const holdsCount = properties.filter(p => allSubscriptions.some(s => s.propertyId === p.id && s.status === 'paused')).length;

        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">Hold Management</h1>
                        <p className="text-gray-500 font-medium mt-1 text-lg">Manage service availability across your entire property portfolio.</p>
                    </div>
                     <div className="bg-orange-50 px-6 py-4 rounded-2xl border border-orange-100">
                        <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest leading-none">Locations On Hold</p>
                        <p className="text-2xl font-black text-orange-700 mt-1">{holdsCount}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {properties.map(prop => (
                        <PortfolioHoldCard 
                            key={prop.id} 
                            property={prop} 
                            subscriptions={allSubscriptions} 
                            onSelect={(id) => setSelectedPropertyId(id)}
                        />
                    ))}
                </div>
            </div>
        );
    }

    // --- PROPERTY FOCUS VIEW ---
    return (
        <div className="space-y-8 max-w-4xl mx-auto">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Vacation Holds</h1>
                    <p className="text-gray-500 font-medium mt-1 text-lg">
                        Service availability for: <span className="font-bold text-gray-900">{selectedProperty.address}</span>
                    </p>
                </div>
                <Button variant="ghost" onClick={() => setSelectedPropertyId('all')} className="text-xs font-black uppercase tracking-widest">
                    Portfolio View
                </Button>
            </div>

            <Card className="border-none ring-1 ring-base-200 overflow-hidden">
                <div className="flex flex-col md:flex-row items-center justify-between gap-12 p-8">
                    {propertyHoldStatus?.isPaused ? (
                        <>
                            <div className="flex items-center gap-8 flex-1">
                                <div className="w-24 h-24 rounded-3xl bg-orange-50 flex items-center justify-center text-orange-600 shadow-inner">
                                    <PauseCircleIcon className="w-12 h-12" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Service is On Hold</h2>
                                    <p className="text-gray-500 font-medium mt-2">All collections for this address are suspended until <span className="text-orange-600 font-black">{propertyHoldStatus.pausedUntil}</span>.</p>
                                </div>
                            </div>
                            <Button variant="primary" onClick={handleResumeAll} disabled={isUpdating} className="w-full md:w-auto h-16 px-12 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-primary/20">
                                {isUpdating ? 'Resuming...' : 'Resume Collections Now'}
                            </Button>
                        </>
                    ) : (
                         <>
                            <div className="flex items-center gap-8 flex-1">
                                <div className="w-24 h-24 rounded-3xl bg-teal-50 flex items-center justify-center text-teal-600 shadow-inner">
                                    <PlayCircleIcon className="w-12 h-12" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Service Active</h2>
                                    <p className="text-gray-500 font-medium mt-2">Waste and specialty collections are operating on their normal weekly schedule.</p>
                                </div>
                            </div>
                            <Button onClick={handleSetHoldClick} disabled={isUpdating} className="w-full md:w-auto h-16 px-12 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-primary/20">
                                {isUpdating ? 'Updating...' : 'Request New Hold'}
                            </Button>
                        </>
                    )}
                </div>
            </Card>

            <Modal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Set Vacation Hold"
            >
                <div className="space-y-6">
                    <p className="text-gray-500 font-medium text-sm leading-relaxed">
                        Suspending service pauses all weekly collections and recurring charges. Select the date your household will return and we will resume collection that same week.
                    </p>
                    <div>
                        <label htmlFor="resumeDate" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Resume Service Date</label>
                        <input 
                            type="date"
                            id="resumeDate"
                            value={resumeDate}
                            onChange={e => setResumeDate(e.target.value)}
                            min={new Date(new Date().setDate(new Date().getDate() + 2)).toISOString().split('T')[0]}
                            className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-colors"
                            required
                        />
                    </div>
                    <div className="flex gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isUpdating} className="flex-1 rounded-xl uppercase tracking-widest text-xs font-black h-14">Cancel</Button>
                        <Button onClick={handleConfirmPause} disabled={isUpdating || !resumeDate} className="flex-1 rounded-xl uppercase tracking-widest text-xs font-black h-14 shadow-lg shadow-primary/20">
                            {isUpdating ? 'Processing...' : 'Confirm Hold'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default VacationHolds;