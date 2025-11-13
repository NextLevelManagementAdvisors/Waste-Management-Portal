
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useProperty } from '../App';
import { getSubscriptions, pauseSubscriptionsForProperty, resumeSubscriptionsForProperty } from '../services/mockApiService';
import { Subscription } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import Modal from './Modal';
import { PauseCircleIcon, PlayCircleIcon } from './Icons';

const VacationHolds: React.FC = () => {
    const { selectedProperty } = useProperty();
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [resumeDate, setResumeDate] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    const fetchData = useCallback(async () => {
        if (!selectedProperty) return;
        setLoading(true);
        try {
            const subsData = await getSubscriptions();
            setSubscriptions(subsData.filter(s => s.propertyId === selectedProperty.id && s.status !== 'canceled'));
        } catch (error) {
            console.error("Failed to fetch subscriptions:", error);
        } finally {
            setLoading(false);
        }
    }, [selectedProperty]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const propertyHoldStatus = useMemo(() => {
        const pausedSub = subscriptions.find(s => s.status === 'paused');
        return {
            isPaused: !!pausedSub,
            pausedUntil: pausedSub?.pausedUntil || null,
        };
    }, [subscriptions]);


    const handleSetHoldClick = () => {
        const today = new Date();
        today.setDate(today.getDate() + 7); // Default pause is one week
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
    
    if (!selectedProperty) {
        return <div className="text-center p-8">Please select a property to manage vacation holds.</div>;
    }

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold text-neutral">Vacation Holds</h1>
                <p className="text-gray-600 mt-1">
                    Temporarily pause all services for: <span className="font-semibold text-neutral">{selectedProperty.address}</span>
                </p>
            </div>

            <Card>
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6">
                    {propertyHoldStatus.isPaused ? (
                        <>
                            <div className="flex items-center gap-4">
                                <PauseCircleIcon className="w-12 h-12 text-yellow-500 flex-shrink-0" />
                                <div>
                                    <h2 className="text-xl font-semibold text-neutral">Service is On Hold</h2>
                                    <p className="text-gray-600">All services for this property are paused until <span className="font-bold">{propertyHoldStatus.pausedUntil}</span>.</p>
                                </div>
                            </div>
                            <Button variant="secondary" onClick={handleResumeAll} disabled={isUpdating} className="w-full md:w-auto">
                                {isUpdating ? 'Resuming...' : 'Resume All Services Now'}
                            </Button>
                        </>
                    ) : (
                         <>
                            <div className="flex items-center gap-4">
                                <PlayCircleIcon className="w-12 h-12 text-green-500 flex-shrink-0" />
                                <div>
                                    <h2 className="text-xl font-semibold text-neutral">All Services are Active</h2>
                                    <p className="text-gray-600">Your services are running on their normal schedule.</p>
                                </div>
                            </div>
                            <Button onClick={handleSetHoldClick} disabled={isUpdating} className="w-full md:w-auto">
                                {isUpdating ? 'Updating...' : 'Set Vacation Hold'}
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
                <div>
                    <p className="text-gray-600 mb-4">Select a date to resume your services. All subscriptions for this property will be paused and billing will be suspended until this date.</p>
                    <div>
                        <label htmlFor="resumeDate" className="block text-sm font-medium text-gray-700">Service Resume Date</label>
                        <input 
                            type="date"
                            id="resumeDate"
                            value={resumeDate}
                            onChange={e => setResumeDate(e.target.value)}
                            min={new Date(new Date().setDate(new Date().getDate() + 2)).toISOString().split('T')[0]} // Earliest resume is 2 days from now
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                            required
                        />
                    </div>
                    <div className="mt-6 flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isUpdating}>Cancel</Button>
                        <Button onClick={handleConfirmPause} disabled={isUpdating || !resumeDate}>
                            {isUpdating ? 'Pausing...' : 'Confirm Hold'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default VacationHolds;
