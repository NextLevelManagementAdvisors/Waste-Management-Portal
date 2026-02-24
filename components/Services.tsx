import React, { useEffect, useState, useMemo } from 'react';
import { getServices, getSubscriptions, changeServiceQuantity, cancelSubscription, subscribeToNewService, setServiceQuantity } from '../services/apiService.ts';
import { Service, Subscription } from '../types.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { useProperty } from '../PropertyContext.tsx';
import { ExclamationTriangleIcon, PlayCircleIcon } from './Icons.tsx';
import ServiceSelector, { EquipmentChoiceModal } from './ServiceSelector.tsx';


const Services: React.FC = () => {
    const { selectedProperty, restartPropertyServices, setCurrentView } = useProperty();
    const [services, setServices] = useState<Service[]>([]);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingIds, setUpdatingIds] = useState<Record<string, boolean>>({});

    const [equipmentModal, setEquipmentModal] = useState<{ isOpen: boolean; service: Service | null }>({ isOpen: false, service: null });
    const [isRestarting, setIsRestarting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

    const showNotification = (type: 'success' | 'error' | 'warning', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 4000);
    };

    const fetchData = async () => {
        try {
            const [servicesData, subsData] = await Promise.all([getServices(), getSubscriptions()]);
            setServices(servicesData);
            setSubscriptions(subsData);
        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        fetchData();
    }, []);

    const atHouseService = useMemo(() => services.find(s => s.name.toLowerCase().includes('at house')), [services]);
    const linerService = useMemo(() => services.find(s => s.name.toLowerCase().includes('liner')), [services]);

    const totalBaseServiceCans = useMemo(() => {
        if (!selectedProperty) return 0;
        const baseServiceIds = services.filter(s => s.category === 'base_service').map(s => s.id);
        return subscriptions
            .filter(s => s.propertyId === selectedProperty.id && baseServiceIds.includes(s.serviceId) && s.status === 'active')
            .reduce((total, sub) => total + sub.quantity, 0);
    }, [subscriptions, services, selectedProperty]);

    const linerSubscription = useMemo(() => {
        if (!linerService || !selectedProperty) return undefined;
        return subscriptions.find(sub => sub.serviceId === linerService.id && sub.propertyId === selectedProperty.id && sub.status === 'active');
    }, [subscriptions, linerService, selectedProperty]);

    useEffect(() => {
        if (loading || isSyncing || !linerSubscription || !linerService || updatingIds[linerService.id]) {
            return;
        }

        if (totalBaseServiceCans > 0 && linerSubscription.quantity !== totalBaseServiceCans) {
            const syncQuantity = async () => {
                setIsSyncing(true);
                setUpdatingIds(prev => ({ ...prev, [linerService!.id]: true }));
                try {
                    await setServiceQuantity(linerSubscription.id, totalBaseServiceCans);
                    await fetchData();
                } catch (error) {
                    console.error("Failed to sync liner quantity:", error);
                } finally {
                    setUpdatingIds(prev => ({ ...prev, [linerService!.id]: false }));
                    setIsSyncing(false);
                }
            };
            syncQuantity();
        }
    }, [totalBaseServiceCans, linerSubscription, loading, isSyncing, updatingIds]);

    const propertyStatus = useMemo(() => {
        if (!selectedProperty || loading) return 'loading';
        const propSubs = subscriptions.filter(s => s.propertyId === selectedProperty.id);
        if (propSubs.length === 0) return 'new';
        if (propSubs.some(s => s.status !== 'canceled')) return 'active';
        return 'canceled';
    }, [subscriptions, selectedProperty, loading]);

    const handleSubscriptionChange = async (service: Service, change: 'increment' | 'decrement', useSticker?: boolean) => {
        if (!selectedProperty) return;
        setUpdatingIds(prev => ({...prev, [service.id]: true }));
        try {
            await changeServiceQuantity(service, selectedProperty.id, change, useSticker);

            if (service.category === 'base_service') {
                const currentSubs = await getSubscriptions();
                const newTotalCans = currentSubs
                    .filter(s => s.propertyId === selectedProperty!.id && services.find(srv => srv.id === s.serviceId)?.category === 'base_service' && s.status === 'active')
                    .reduce((total, sub) => total + sub.quantity, 0);

                if (newTotalCans === 0) {
                    const linerSub = currentSubs.find(s => s.serviceId === linerService?.id && s.propertyId === selectedProperty!.id && s.status === 'active');
                    if (linerSub) await cancelSubscription(linerSub.id);

                    const atHouseSub = currentSubs.find(s => s.serviceId === atHouseService?.id && s.propertyId === selectedProperty!.id && s.status === 'active');
                    if (atHouseSub) await cancelSubscription(atHouseSub.id);
                }
            }

            await fetchData();
        } catch (error) {
            console.error("Failed to update quantity:", error);
            showNotification('error', "Update failed. Please try again.");
        } finally {
            setUpdatingIds(prev => ({...prev, [service.id]: false }));
        }
    };

    const handleAddService = (service: Service) => {
        const subscription = getSubscriptionForService(service.id);
        const quantity = subscription?.quantity || 0;
        if (quantity > 0) {
            handleSubscriptionChange(service, 'increment');
        } else {
             setEquipmentModal({ isOpen: true, service });
        }
    };

    const confirmAddService = async (useSticker: boolean) => {
        const service = equipmentModal.service;
        if (!service) return;
        await handleSubscriptionChange(service, 'increment', useSticker);
        setEquipmentModal({ isOpen: false, service: null });
    };

    const handleRestartServices = async () => {
        if (!selectedProperty) return;
        setIsRestarting(true);
        try {
            await restartPropertyServices(selectedProperty.id);
            await fetchData();
        } catch(error) {
            showNotification('error', "Failed to restart services. Please try again.");
        } finally {
            setIsRestarting(false);
        }
    };

    const isAtHouseSubscribed = useMemo(() => {
        if (!atHouseService || !selectedProperty) return false;
        return subscriptions.some(sub => sub.serviceId === atHouseService.id && sub.propertyId === selectedProperty.id && sub.status === 'active');
    }, [subscriptions, atHouseService, selectedProperty]);

    const isLinerSubscribed = useMemo(() => !!linerSubscription, [linerSubscription]);

    const getSubscriptionForService = (serviceId: string) =>
        subscriptions.find(sub => sub.serviceId === serviceId && sub.propertyId === selectedProperty?.id && sub.status !== 'canceled');

    const monthlyTotal = useMemo(() => {
        if (!selectedProperty) return 0;
        return subscriptions
            .filter(s => s.propertyId === selectedProperty.id && s.status === 'active')
            .reduce((total, sub) => total + sub.totalPrice, 0);
    }, [subscriptions, selectedProperty]);

    const isTransferPending = selectedProperty?.transferStatus === 'pending';

    if (loading || propertyStatus === 'loading') {
        return <div className="flex justify-center items-center h-full p-12"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div></div>;
    }

    if (propertyStatus === 'canceled') {
        return (
            <div className="space-y-8 max-w-5xl mx-auto animate-in fade-in duration-500 p-8">
                <Card className="border-2 border-red-200 bg-red-50 text-center">
                    <ExclamationTriangleIcon className="w-12 h-12 text-red-500 mx-auto mb-4"/>
                    <h2 className="text-2xl font-black text-red-800">Services Canceled</h2>
                    <p className="text-red-700 mt-2 max-w-md mx-auto">All recurring services for this property have been terminated. You will not be billed further.</p>
                </Card>

                <Card className={`border-2 shadow-lg ${isTransferPending ? 'border-gray-300 bg-gray-50' : 'border-primary bg-primary/5'}`}>
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center">
                        <div>
                            <h4 className={`font-bold text-lg ${isTransferPending ? 'text-gray-400' : 'text-gray-900'}`}>Ready to come back?</h4>
                            <p className={`text-sm mt-1 ${isTransferPending ? 'text-gray-400' : 'text-gray-600'}`}>You can restart your previous service plan at any time.</p>
                        </div>
                        <Button
                            onClick={handleRestartServices}
                            disabled={isRestarting || isTransferPending}
                            className="bg-primary hover:bg-primary-focus text-white mt-4 sm:mt-0 rounded-xl px-6 font-black uppercase text-xs tracking-widest flex items-center h-14">
                            {isRestarting
                                ? 'Restarting...'
                                : <><PlayCircleIcon className="w-5 h-5 mr-2" /> Restart Services</>
                            }
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {notification && (
                <div className={`fixed bottom-5 right-5 z-50 p-4 rounded-lg shadow-lg text-white text-sm font-bold max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                    notification.type === 'error' ? 'bg-red-600' : notification.type === 'warning' ? 'bg-yellow-600' : 'bg-primary'
                }`}>
                    {notification.message}
                </div>
            )}
            <EquipmentChoiceModal
                isOpen={equipmentModal.isOpen}
                service={equipmentModal.service}
                onClose={() => setEquipmentModal({ isOpen: false, service: null })}
                onConfirm={confirmAddService}
                isProcessing={!!(equipmentModal.service && updatingIds[equipmentModal.service.id])}
            />
            <ServiceSelector
                services={services}
                getQuantity={(serviceId) => getSubscriptionForService(serviceId)?.quantity || 0}
                onIncrement={(service) => handleAddService(service)}
                onDecrement={(service) => {
                    if (service.category === 'base_service' && totalBaseServiceCans <= 1) {
                        showNotification('warning', "You must have at least one trash can on your plan. To cancel service completely, go to Settings \u2192 Danger Zone.");
                        return;
                    }
                    handleSubscriptionChange(service, 'decrement');
                }}
                isUpdating={(serviceId) => !!updatingIds[serviceId]}
                isAtHouseActive={isAtHouseSubscribed}
                onAtHouseToggle={() => atHouseService && handleSubscriptionChange(atHouseService, isAtHouseSubscribed ? 'decrement' : 'increment')}
                isLinerActive={isLinerSubscribed}
                onLinerToggle={() => linerService && handleSubscriptionChange(linerService, isLinerSubscribed ? 'decrement' : 'increment')}
                totalBaseServiceCans={totalBaseServiceCans}
                monthlyTotal={monthlyTotal}
                footerAction={
                    <Button size="md" className="rounded-lg font-bold w-full sm:w-auto" onClick={() => setCurrentView('billing')} disabled={monthlyTotal === 0}>
                        Manage Billing
                    </Button>
                }
            />
        </div>
    );
};

export default Services;
