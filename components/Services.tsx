
import React, { useEffect, useState, useMemo } from 'react';
import { getServices, getSubscriptions, changeServiceQuantity } from '../services/mockApiService.ts';
import { Service, Subscription } from '../types.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import Modal from './Modal.tsx';
import { useProperty } from '../PropertyContext.tsx';
import { PlusIcon, TrashIcon, SparklesIcon, TruckIcon, HomeModernIcon, ExclamationTriangleIcon, PlayCircleIcon } from './Icons.tsx';

const QuantitySelector: React.FC<{
    quantity: number;
    onIncrement: () => void;
    onDecrement: () => void;
    isUpdating: boolean;
}> = ({ quantity, onIncrement, onDecrement, isUpdating }) => {
    return (
        <div className="flex items-center gap-1">
            <Button
                size="sm"
                variant="secondary"
                onClick={onDecrement}
                disabled={isUpdating || quantity <= 0}
                className="w-8 h-8 p-0 bg-gray-200 hover:bg-gray-300"
                aria-label="Decrease quantity"
            >
                {quantity > 1 ? <span className="text-xl font-thin">-</span> : <TrashIcon className="w-4 h-4 text-red-500" /> }
            </Button>
            <div
                className="w-10 h-8 flex items-center justify-center text-base font-bold text-neutral"
                aria-live="polite"
            >
                {isUpdating ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary"></div> : quantity}
            </div>
            <Button
                size="sm"
                variant="secondary"
                onClick={onIncrement}
                disabled={isUpdating}
                className="w-8 h-8 p-0 bg-gray-200 hover:bg-gray-300"
                aria-label="Increase quantity"
            >
                <span className="text-xl font-thin">+</span>
            </Button>
        </div>
    );
};

const EquipmentChoiceModal: React.FC<{
    service: Service | null;
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (useSticker: boolean) => void;
    isProcessing: boolean;
}> = ({ service, isOpen, onClose, onConfirm, isProcessing }) => {
    if (!service) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Add ${service.name}`}>
            <div className="space-y-4">
                <p className="text-center text-gray-600 mb-6">Choose how you want to source your equipment. One-time setup fees may apply.</p>
                <div className="space-y-3">
                     <button
                        onClick={() => onConfirm(false)}
                        disabled={isProcessing}
                        className="w-full text-left p-4 border-2 rounded-lg hover:border-primary transition-all flex justify-between items-center disabled:opacity-50"
                    >
                        <div>
                            <h4 className="font-bold text-neutral">Rent Our Can</h4>
                            <p className="text-xs text-gray-500">We'll provide and maintain a can for you.</p>
                        </div>
                        <span className="font-bold text-primary text-sm">
                            ${(service.setupFee || 0).toFixed(2)} Setup
                        </span>
                    </button>
                    <button
                        onClick={() => onConfirm(true)}
                        disabled={isProcessing}
                        className="w-full text-left p-4 border-2 rounded-lg hover:border-primary transition-all flex justify-between items-center disabled:opacity-50"
                    >
                        <div>
                            <h4 className="font-bold text-neutral">Use Your Own Can</h4>
                            <p className="text-xs text-gray-500">We'll provide a sticker for identification.</p>
                        </div>
                        <span className="font-bold text-primary text-sm">
                           ${(service.stickerFee || 0).toFixed(2)} Setup
                        </span>
                    </button>
                </div>
            </div>
        </Modal>
    );
};


interface ServicesProps {
    onNavigate: (tabId: 'billing') => void;
}

const Services: React.FC<ServicesProps> = ({ onNavigate }) => {
    const { selectedProperty, restartPropertyServices } = useProperty();
    const [services, setServices] = useState<Service[]>([]);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingIds, setUpdatingIds] = useState<Record<string, boolean>>({});
    
    const [equipmentModal, setEquipmentModal] = useState<{ isOpen: boolean; service: Service | null }>({ isOpen: false, service: null });
    const [isRestarting, setIsRestarting] = useState(false);

    const fetchData = async () => {
        setLoading(true);
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
        fetchData();
    }, []);
    
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
            await fetchData();
        } catch (error) {
            console.error("Failed to update quantity:", error);
            alert("Update failed. Please try again.");
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
        if (!service || !selectedProperty) return;

        setUpdatingIds(prev => ({...prev, [service.id]: true }));
        if (baseFeeService && totalBaseServiceCans === 0) {
            await handleSubscriptionChange(baseFeeService, 'increment');
        }
        await handleSubscriptionChange(service, 'increment', useSticker);
        
        setEquipmentModal({ isOpen: false, service: null });
        setUpdatingIds(prev => ({...prev, [service.id]: false }));
    };

    const handleRestartServices = async () => {
        if (!selectedProperty) return;
        setIsRestarting(true);
        try {
            await restartPropertyServices(selectedProperty.id);
            await fetchData();
        } catch(error) {
            alert("Failed to restart services. Please try again.");
        } finally {
            setIsRestarting(false);
        }
    };

    const serviceGroups = useMemo(() => services.reduce((acc, service) => {
        if (!acc[service.category]) acc[service.category] = [];
        acc[service.category].push(service);
        return acc;
    }, {} as Record<Service['category'], Service[]>), [services]);
    
    const baseFeeService = useMemo(() => services.find(s => s.category === 'base_fee'), [services]);
    const atHouseService = useMemo(() => services.find(s => s.id === 'prod_TOvyKnOx4KLBc2'), [services]);

    const isAtHouseSubscribed = useMemo(() => {
        if (!atHouseService || !selectedProperty) return false;
        return subscriptions.some(sub => sub.serviceId === atHouseService.id && sub.propertyId === selectedProperty.id && sub.status === 'active');
    }, [subscriptions, atHouseService, selectedProperty]);
    
    const getSubscriptionForService = (serviceId: string) => 
        subscriptions.find(sub => sub.serviceId === serviceId && sub.propertyId === selectedProperty?.id && sub.status !== 'canceled');

    const totalBaseServiceCans = useMemo(() => {
        if (!selectedProperty) return 0;
        const baseServiceIds = services.filter(s => s.category === 'base_service').map(s => s.id);
        return subscriptions
            .filter(s => s.propertyId === selectedProperty.id && baseServiceIds.includes(s.serviceId) && s.status === 'active')
            .reduce((total, sub) => total + sub.quantity, 0);
    }, [subscriptions, services, selectedProperty]);
    
    const monthlyTotal = useMemo(() => {
        if (!selectedProperty) return 0;
        return subscriptions
            .filter(s => s.propertyId === selectedProperty.id && s.status === 'active')
            .reduce((total, sub) => total + sub.totalPrice, 0);
    }, [subscriptions, selectedProperty]);

    const isTransferPending = selectedProperty?.transferStatus === 'pending';
    
    if (loading || !baseFeeService || propertyStatus === 'loading') {
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

    const baseServices = (serviceGroups.base_service || []);

    return (
        <div className="space-y-6">
            <EquipmentChoiceModal
                isOpen={equipmentModal.isOpen}
                service={equipmentModal.service}
                onClose={() => setEquipmentModal({ isOpen: false, service: null })}
                onConfirm={confirmAddService}
                isProcessing={!!(equipmentModal.service && updatingIds[equipmentModal.service.id])}
            />
            <div className="grid grid-cols-1 gap-6">
                <Card className="p-0 overflow-hidden">
                    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-6 pt-6">Collection Method</h2>
                    <div className="p-6">
                        {isAtHouseSubscribed && atHouseService ? (
                            <div className="p-4 bg-teal-50 border border-primary rounded-lg flex flex-col sm:flex-row justify-between items-center gap-4">
                                <div className="flex items-center gap-4 flex-1">
                                    <HomeModernIcon className="w-6 h-6 text-primary" />
                                    <div>
                                        <h3 className="font-bold text-gray-900">Premium At House</h3>
                                        <p className="text-sm text-gray-600">We retrieve cans from your property for you.</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <p className="font-bold text-2xl text-primary">${((totalBaseServiceCans > 0 ? baseFeeService.price : 0) + atHouseService.price).toFixed(2)}</p>
                                        <p className="text-[10px] text-primary/70 font-bold uppercase tracking-widest">Total Fee</p>
                                    </div>
                                    <Button 
                                    onClick={() => handleSubscriptionChange(atHouseService, 'decrement')}
                                    disabled={!!updatingIds[atHouseService.id]}
                                    variant="secondary" 
                                    size="sm"
                                    className="rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest shrink-0"
                                >
                                    {!!updatingIds[atHouseService.id] ? 'Updating...' : 'Downgrade to Curbside'}
                                </Button>
                            </div>
                            </div>
                        ) : (
                            <div className="p-4 bg-gray-100 border border-gray-200 rounded-lg flex flex-col sm:flex-row justify-between items-center gap-4">
                                <div className="flex items-center gap-4 flex-1">
                                    <TruckIcon className="w-6 h-6 text-gray-500" />
                                    <div>
                                        <h3 className="font-bold text-gray-900">Standard Curbside</h3>
                                        <p className="text-sm text-gray-600">Cans must be placed at the curb for collection.</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                     <div className="text-right">
                                        <p className="font-bold text-2xl text-gray-900">${(totalBaseServiceCans > 0 ? baseFeeService.price : 0).toFixed(2)}</p>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Base Fee</p>
                                    </div>
                                    {atHouseService && (
                                        <Button 
                                            onClick={() => handleSubscriptionChange(atHouseService, 'increment')}
                                            disabled={!!updatingIds[atHouseService.id] || totalBaseServiceCans === 0}
                                            variant="secondary"
                                            size="sm"
                                            className="rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest shrink-0"
                                            title={totalBaseServiceCans === 0 ? "Add a can to enable upgrades" : ""}
                                        >
                                            {!!updatingIds[atHouseService.id] ? 'Updating...' : `Upgrade (+$${atHouseService.price.toFixed(2)})`}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </Card>

                <Card className="p-0 overflow-hidden">
                    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-6 pt-6">Equipment & Frequency</h2>
                    <div className="divide-y divide-base-200">
                        {baseServices.map(service => {
                            const subscription = getSubscriptionForService(service.id);
                            const quantity = subscription?.quantity || 0;
                            const equipmentType = subscription?.equipmentType;
                            return (
                                <div key={service.id} className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="w-10 h-10 bg-gray-100 rounded-full flex-shrink-0"></div>
                                        <div>
                                            <h3 className="font-bold text-gray-900">{service.name}</h3>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Weekly Collection</p>
                                            {equipmentType && (
                                                <p className="text-[10px] font-bold text-teal-800 bg-teal-100 px-2 py-1 rounded-full inline-block mt-2">
                                                    {equipmentType === 'rental' ? 'Rental Can' : 'Own Can'}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6 w-full sm:w-auto justify-end">
                                        <div className="text-right">
                                            <p className="font-bold text-lg text-gray-900 leading-none">${service.price.toFixed(2)}</p>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Per Can</p>
                                        </div>
                                        <QuantitySelector
                                            quantity={quantity}
                                            onIncrement={() => handleAddService(service)}
                                            onDecrement={() => {
                                                if (totalBaseServiceCans <= 1 && quantity <= 1) {
                                                    alert("You must have at least one trash can on your plan. To cancel service completely, go to Settings -> Danger Zone.");
                                                    return;
                                                }
                                                handleSubscriptionChange(service, 'decrement');
                                            }}
                                            isUpdating={!!updatingIds[service.id]}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="p-6 border-t border-base-200 flex justify-between items-center bg-gray-50/50">
                        <div>
                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Total Monthly Bill</h3>
                            <p className="text-4xl font-black text-primary">${monthlyTotal.toFixed(2)}</p>
                        </div>
                        <Button size="md" className="rounded-lg font-bold" onClick={() => onNavigate('billing')} disabled={monthlyTotal === 0}>
                            Manage Billing
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default Services;
