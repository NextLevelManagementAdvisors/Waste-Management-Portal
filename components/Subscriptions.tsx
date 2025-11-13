import React, { useEffect, useState, useMemo } from 'react';
import { getSubscriptions, getPaymentMethods, updateSubscriptionPaymentMethod, cancelSubscription, getServices } from '../services/mockApiService';
import { Subscription, PaymentMethod, Service } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import { useProperty } from '../App';
import Modal from './Modal';
import { CreditCardIcon, BanknotesIcon } from './Icons';


const CancelSubscriptionModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isLastBasic: boolean;
}> = ({ isOpen, onClose, onConfirm, isLastBasic }) => (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirm Cancellation">
        <p className="text-gray-600">
            {isLastBasic 
                ? "This is your last basic service for this property. Canceling it will also cancel all associated service upgrades. Are you sure you want to proceed?"
                : "Are you sure you want to cancel this subscription?"}
        </p>
        <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>Back</Button>
            <Button type="button" variant="primary" className="bg-red-600 hover:bg-red-700 focus:ring-red-500" onClick={onConfirm}>
                Confirm Cancellation
            </Button>
        </div>
    </Modal>
);

const SubscriptionCard: React.FC<{
    sub: Subscription;
    onCancel: () => void;
}> = ({ sub, onCancel }) => {
    const statusColor = {
        active: 'bg-green-100 text-green-800',
        paused: 'bg-yellow-100 text-yellow-800',
        canceled: 'bg-red-100 text-red-800',
    };
    
    return (
        <Card>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-4">
                        <h3 className="text-xl font-semibold text-neutral">
                            {sub.serviceName}
                            {sub.quantity > 1 && <span className="text-lg font-normal text-gray-500 ml-2">x {sub.quantity}</span>}
                        </h3>
                        <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusColor[sub.status]}`}>{sub.status}</span>
                    </div>
                     {sub.status === 'paused' && sub.pausedUntil && (
                        <p className="text-yellow-700 font-medium mt-1">Paused until {sub.pausedUntil}</p>
                    )}
                    <p className="text-gray-500 mt-1">Next bill on {sub.nextBillingDate} for <span className="font-semibold text-neutral">${sub.totalPrice.toFixed(2)}</span></p>
                    {/* FIX: Removed UI element that was attempting to display a 'source' property which does not exist on the Subscription type. */}
                </div>
                <div className="flex-shrink-0">
                     <Button 
                        variant="secondary" 
                        onClick={onCancel}
                        disabled={sub.status === 'canceled'}
                        className={sub.status !== 'canceled' ? "hover:bg-red-100 hover:text-red-700" : ""}
                    >
                        Cancel
                    </Button>
                </div>
            </div>
        </Card>
    )
}


const Subscriptions: React.FC = () => {
    const { selectedProperty } = useProperty();
    const [allSubscriptions, setAllSubscriptions] = useState<Subscription[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);

    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [subToCancel, setSubToCancel] = useState<Subscription | null>(null);

    const fetchData = async () => {
        // Don't show main loader on refresh
        if (loading) {
            setLoading(true);
        }
        try {
            const [subsData, servicesData] = await Promise.all([
                getSubscriptions(),
                getServices()
            ]);
            setAllSubscriptions(subsData);
            setServices(servicesData);
        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleOpenCancelModal = (sub: Subscription) => {
        setSubToCancel(sub);
        setIsCancelModalOpen(true);
    };

    const handleCloseCancelModal = () => {
        setSubToCancel(null);
        setIsCancelModalOpen(false);
    };

    const handleConfirmCancel = async () => {
        if (!subToCancel) return;

        try {
            await cancelSubscription(subToCancel.id);
            await fetchData(); // Refresh data
        } catch (error) {
            console.error("Failed to cancel subscription:", error);
            alert("Cancellation failed. Please try again.");
        } finally {
            handleCloseCancelModal();
        }
    };

    const isLastBasicService = useMemo(() => {
        if (!subToCancel || !selectedProperty) return false;

        const service = services.find(s => s.id === subToCancel.serviceId);
        if (service?.category !== 'base_service') {
            return false;
        }

        const otherActiveBasicSubs = allSubscriptions.filter(s => 
            s.propertyId === selectedProperty.id &&
            s.id !== subToCancel.id &&
            s.status === 'active' &&
            services.find(srv => srv.id === s.serviceId)?.category === 'base_service'
        );

        return otherActiveBasicSubs.length === 0;
    }, [subToCancel, allSubscriptions, services, selectedProperty]);
    
    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    const filteredSubscriptions = selectedProperty 
        ? allSubscriptions.filter(s => s.propertyId === selectedProperty.id && s.status !== 'canceled') 
        : [];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-neutral">Your Subscriptions</h1>
                    <p className="text-gray-600 mt-1">
                        Managing subscriptions for: <span className="font-semibold text-neutral">{selectedProperty?.address || 'No property selected'}</span>
                    </p>
                </div>
            </div>
            
            <div className="space-y-4">
                {selectedProperty ? (
                    filteredSubscriptions.length > 0 ? (
                        filteredSubscriptions.map(sub => (
                            <SubscriptionCard 
                                key={sub.id} 
                                sub={sub}
                                onCancel={() => handleOpenCancelModal(sub)}
                            />
                        ))
                    ) : (
                        <Card>
                            <p className="text-center text-gray-500 py-8">You have no active subscriptions for this property.</p>
                        </Card>
                    )
                ) : (
                     <Card>
                        <p className="text-center text-gray-500 py-8">Please select a property to view subscriptions.</p>
                    </Card>
                )}
            </div>
            {subToCancel && (
                 <CancelSubscriptionModal
                    isOpen={isCancelModalOpen}
                    onClose={handleCloseCancelModal}
                    onConfirm={handleConfirmCancel}
                    isLastBasic={isLastBasicService}
                />
            )}
        </div>
    );
};

export default Subscriptions;