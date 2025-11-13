import React, { useEffect, useState, useMemo } from 'react';
import { subscribeToNewService, getServices, getSubscriptions, changeServiceQuantity } from '../services/mockApiService';
import { Service, Subscription } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import { useProperty } from '../App';
import { PlusIcon, TrashIcon } from './Icons';

const QuantitySelector: React.FC<{
    quantity: number;
    onIncrement: () => void;
    onDecrement: () => void;
    isUpdating: boolean;
}> = ({ quantity, onIncrement, onDecrement, isUpdating }) => {
    return (
        <div className="flex items-center gap-2">
            <Button
                size="sm"
                variant="secondary"
                onClick={onDecrement}
                disabled={isUpdating || quantity <= 0}
                className="w-10 h-10 p-0"
                aria-label="Decrease quantity"
            >
                {quantity === 1 ? <TrashIcon className="w-5 h-5 text-red-500" /> : <span className="text-2xl font-thin">-</span>}
            </Button>
            <div
                className="w-12 h-10 flex items-center justify-center text-xl font-bold text-primary border-y border-base-300"
                aria-live="polite"
            >
                {isUpdating ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary"></div> : quantity}
            </div>
            <Button
                size="sm"
                variant="secondary"
                onClick={onIncrement}
                disabled={isUpdating}
                className="w-10 h-10 p-0"
                aria-label="Increase quantity"
            >
                <span className="text-2xl font-thin">+</span>
            </Button>
        </div>
    );
};


const Services: React.FC = () => {
    const { selectedProperty } = useProperty();
    const [services, setServices] = useState<Service[]>([]);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingIds, setUpdatingIds] = useState<Record<string, boolean>>({});
    const [newServiceQuantities, setNewServiceQuantities] = useState<Record<string, number>>({});

    const fetchData = async () => {
        if (!selectedProperty) { setLoading(false); return; }
        setLoading(true);
        try {
            const [servicesData, subsData] = await Promise.all([getServices(), getSubscriptions()]);
            setServices(servicesData);
            setSubscriptions(subsData.filter(s => s.propertyId === selectedProperty.id && s.status === 'active'));
        } catch (error) { console.error("Failed to fetch data:", error); } 
        finally { setLoading(false); }
    };

    useEffect(() => {
        fetchData();
    }, [selectedProperty]);

    const handleQuantityChange = async (service: Service, change: 'increment' | 'decrement') => {
        if (!selectedProperty) { alert("Please select a property first."); return; }
        setUpdatingIds(prev => ({...prev, [service.id]: true }));
        try {
            await changeServiceQuantity(service, selectedProperty.id, change);
            // After changing, refetch all subscription data to ensure consistency
            const subsData = await getSubscriptions();
            setSubscriptions(subsData.filter(s => s.propertyId === selectedProperty.id && s.status === 'active'));
        } catch (error) {
            console.error("Failed to update quantity:", error);
            alert("Update failed. Please try again.");
        } finally {
            setUpdatingIds(prev => ({...prev, [service.id]: false }));
        }
    };
    
    const handleInitialSubscriptions = async () => {
        if (!selectedProperty) { alert("Please select a property first."); return; }
    
        // FIX: Explicitly cast quantities to numbers and use a type guard to resolve type errors.
        const servicesToSubscribe = Object.entries(newServiceQuantities)
            .map(([id, qty]) => ({ service: services.find(s => s.id === id), qty: Number(qty) }))
            .filter((item): item is { service: Service; qty: number } => !!item.service && item.qty > 0);

        if (servicesToSubscribe.length === 0) {
            alert("Please select at least one can to start your service.");
            return;
        }
    
        const currentlyUpdating = servicesToSubscribe.reduce((acc, { service }) => ({ ...acc, [service.id]: true }), {});
        setUpdatingIds(currentlyUpdating);

        try {
            const subscriptionPromises = servicesToSubscribe.map(({ service, qty }) => 
                subscribeToNewService(service, selectedProperty.id, qty)
            );
            await Promise.all(subscriptionPromises);
            await fetchData();
        } catch (error) {
            console.error("Failed to subscribe:", error);
            alert("Subscription failed. Please try again.");
        } finally {
            setUpdatingIds({});
            setNewServiceQuantities({});
        }
    };


    const hasBaseSubscription = useMemo(() => subscriptions.some(sub => services.find(s => s.id === sub.serviceId)?.category === 'base_service'), [subscriptions, services]);
    const hasTrashSubscription = useMemo(() => subscriptions.some(sub => sub.serviceId.includes('prod_TOw')), [subscriptions]);
    const hasRecyclingSubscription = useMemo(() => subscriptions.some(sub => sub.serviceId.includes('prod_RECYCLE')), [subscriptions]);

    const serviceGroups = useMemo(() => services.reduce((acc, service) => {
        if (!acc[service.category]) acc[service.category] = [];
        acc[service.category].push(service);
        return acc;
    }, {} as Record<Service['category'], Service[]>), [services]);
    
    // --- Hooks for New User Flow (moved to top level) ---
    const baseFeeService = useMemo(() => services.find(s => s.category === 'base_fee'), [services]);
    const totalCans = useMemo(() => Object.values(newServiceQuantities).reduce((sum, qty) => sum + Number(qty), 0), [newServiceQuantities]);
    const totalMonthlyCost = useMemo(() => {
        const servicesWithQuantities = Object.entries(newServiceQuantities)
            .map(([id, qty]) => ({ service: services.find(s => s.id === id), qty: Number(qty) }))
            .filter((item): item is { service: Service; qty: number } => !!item.service && item.qty > 0);

        if (servicesWithQuantities.length === 0) return 0;
        if (!baseFeeService) return 0; // Should not happen if data is correct
        
        let total = baseFeeService.price;
        for (const item of servicesWithQuantities) {
            total += item.qty * item.service.price;
        }
        return total;
    }, [newServiceQuantities, services, baseFeeService]);
    
    const getSubscriptionForService = (serviceId: string) => subscriptions.find(sub => sub.serviceId === serviceId);

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }
    if (!selectedProperty) {
        return <div className="text-center p-8">Please select a property to view and add services.</div>;
    }

    const renderNewUserFlow = () => {
        const canServices = serviceGroups.base_service || [];
        const isSubscribing = Object.values(updatingIds).some(v => v);

        const handleNewServiceQuantityChange = (serviceId: string, newQuantity: number) => {
            setNewServiceQuantities(prev => ({
                ...prev,
                [serviceId]: Math.max(0, newQuantity)
            }));
        };
        
        return (
            <div className="space-y-8">
                <Card>
                    <h1 className="text-3xl font-bold text-neutral text-center">Start Your Service</h1>
                    <p className="text-gray-600 text-center mt-2 mb-4">
                        All trash and recycling services include a <span className="font-semibold text-neutral">${baseFeeService?.price.toFixed(2)}/mo base fee.</span> Add your cans below to get started.
                    </p>
                    <p className="text-gray-500 text-center text-sm mb-8">All services are billed monthly.</p>

                    <div className="space-y-4">
                        {canServices.map(service => {
                            const quantity = Number(newServiceQuantities[service.id] || 0);
                            return (
                                <div key={service.id} className={`p-4 border rounded-lg flex flex-col sm:flex-row items-center gap-4 transition-all duration-200 ${quantity > 0 ? 'bg-teal-50 border-teal-200' : 'bg-base-100'}`}>
                                    <div className="flex-shrink-0">{service.icon}</div>
                                    <div className="flex-1 text-center sm:text-left">
                                        <h3 className="font-semibold text-lg">{service.name}</h3>
                                        <p className="text-sm text-gray-500">{service.description}</p>
                                    </div>
                                    <div className="text-center font-bold text-lg text-neutral">${service.price.toFixed(2)}<span className="font-normal text-sm">/mo</span></div>
                                    <QuantitySelector
                                        quantity={quantity}
                                        onIncrement={() => handleNewServiceQuantityChange(service.id, quantity + 1)}
                                        onDecrement={() => handleNewServiceQuantityChange(service.id, quantity - 1)}
                                        isUpdating={!!updatingIds[service.id]}
                                    />
                                </div>
                            );
                        })}
                    </div>
                    
                    <div className="mt-8 pt-6 border-t">
                        <div className="flex flex-col sm:flex-row justify-center items-center gap-6">
                             <div className="text-center sm:text-right">
                                {totalCans > 0 && baseFeeService && (
                                    <p className="text-md text-gray-600">${baseFeeService.price.toFixed(2)} base fee + ${(totalMonthlyCost - baseFeeService.price).toFixed(2)} for cans</p>
                                )}
                                <p className="text-4xl font-bold text-primary">${totalMonthlyCost.toFixed(2)}<span className="text-xl font-normal">/mo</span></p>
                             </div>
                             <Button size="lg" disabled={totalCans === 0 || isSubscribing} onClick={handleInitialSubscriptions}>
                                {isSubscribing ? 'Starting...' : 'Start Curbside Collection'}
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>
        );
    };

    const renderExistingUserFlow = () => {
        const baseFeeSub = subscriptions.find(s => s.serviceId === 'prod_BASE_FEE');
        const baseServices = serviceGroups.base_service || [];

        const upgrades = (serviceGroups.upgrade || []).filter(upg => {
             // Example logic for conditional upgrades. This can be expanded.
             if (upg.id === 'prod_TOx5lSdv97AAGb') return hasTrashSubscription; // Liner service only for trash
             if (upg.id === 'prod_RECYCLE_ADDON') return hasTrashSubscription; // Recycling add-on only for trash subscribers
             if (upg.id === 'prod_TOvyKnOx4KLBc2') return hasTrashSubscription || hasRecyclingSubscription; // At-house collection requires a can
             return true;
        });

        return (
            <div className="space-y-8">
                <div><h1 className="text-3xl font-bold text-neutral">Manage Your Services</h1><p className="text-gray-600">Adding or changing services for: <span className="font-semibold text-neutral">{selectedProperty.address}</span>.</p></div>
                <Card>
                    <h2 className="text-2xl font-semibold text-neutral mb-4">Your Base Services</h2>
                    <p className="text-gray-500 mb-6">
                        {baseFeeSub ? (
                            <>Your plan includes a <span className="font-semibold text-neutral">${baseFeeSub.price.toFixed(2)}/mo base service fee.</span> Add or remove cans below.</>
                        ) : (
                            <>Add additional trash or recycling cans to your weekly pickup.</>
                        )}
                    </p>
                    <div className="space-y-4">
                        {baseServices.map(service => {
                            const subscription = getSubscriptionForService(service.id);
                            const quantity = subscription?.quantity || 0;

                            return (
                                <div key={service.id} className="p-4 border rounded-lg flex flex-col sm:flex-row justify-between items-center gap-4 bg-base-100">
                                    <div className="flex items-center gap-4 flex-1">{service.icon}<div><h3 className="font-semibold text-lg">{service.name}</h3><p className="text-sm text-gray-500">{service.description}</p></div></div>
                                    <div className="flex items-center gap-4 w-full sm:w-auto">
                                        <div className="text-center">
                                            <p className="font-bold text-xl">${service.price.toFixed(2)}</p>
                                            <p className="text-xs text-gray-500">/mo per can</p>
                                        </div>
                                        <QuantitySelector
                                            quantity={quantity}
                                            onIncrement={() => handleQuantityChange(service, 'increment')}
                                            onDecrement={() => handleQuantityChange(service, 'decrement')}
                                            isUpdating={!!updatingIds[service.id]}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
                {upgrades.length > 0 && (
                    <Card>
                        <h2 className="text-2xl font-semibold text-neutral mb-4">Service Upgrades</h2>
                        <p className="text-gray-500 mb-6">Enhance your collection experience with these convenient add-ons.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {upgrades.map(service => {
                                const subscription = getSubscriptionForService(service.id);
                                const subscribed = !!subscription;
                                const isUpdating = !!updatingIds[service.id];
                                return (
                                    <div key={service.id} className="p-4 border rounded-lg flex items-center justify-between gap-4 bg-base-100">
                                        <div className="flex items-center gap-4">{service.icon}<div><h3 className="font-semibold">{service.name}</h3><p className="text-sm text-gray-500">${service.price.toFixed(2)} / {service.frequency}</p></div></div>
                                        <Button 
                                            onClick={() => subscribed ? handleQuantityChange(service, 'decrement') : handleQuantityChange(service, 'increment')} 
                                            disabled={isUpdating} 
                                            variant={subscribed ? 'secondary' : 'primary'}
                                        >
                                            {isUpdating ? 'Updating...' : (subscribed ? 'Subscribed' : 'Add')}
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                )}
            </div>
        );
    };

    return hasBaseSubscription ? renderExistingUserFlow() : renderNewUserFlow();
};

export default Services;