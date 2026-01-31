import React, { useEffect, useState, useMemo } from 'react';
import { subscribeToNewService, getServices, getSubscriptions, changeServiceQuantity } from '../services/mockApiService';
import { Service, Subscription } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import { useProperty } from '../App';
import { PlusIcon, TrashIcon, SparklesIcon, TruckIcon } from './Icons';

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
    
    // New User Flow State
    const [newServiceQuantities, setNewServiceQuantities] = useState<Record<string, number>>({});
    const [canSources, setCanSources] = useState<Record<string, 'sticker' | 'provided'>>({});

    const fetchData = async () => {
        if (!selectedProperty) { setLoading(false); return; }
        setLoading(true);
        try {
            const [servicesData, subsData] = await Promise.all([getServices(), getSubscriptions()]);
            setServices(servicesData);
            setSubscriptions(subsData.filter(s => s.propertyId === selectedProperty.id && s.status === 'active'));
            
            // Initialize can sources
            const initialSources: Record<string, 'sticker' | 'provided'> = {};
            servicesData.filter(s => s.category === 'base_service').forEach(s => {
                initialSources[s.id] = 'provided';
            });
            setCanSources(initialSources);
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
    
        const servicesToSubscribe = Object.entries(newServiceQuantities)
            .map(([id, qty]) => ({ 
                service: services.find(s => s.id === id), 
                qty: Number(qty),
                useSticker: canSources[id] === 'sticker'
            }))
            .filter((item): item is { service: Service; qty: number; useSticker: boolean } => !!item.service && item.qty > 0);

        if (servicesToSubscribe.length === 0) {
            alert("Please select at least one can to start your service.");
            return;
        }
    
        const currentlyUpdating = servicesToSubscribe.reduce((acc, { service }) => ({ ...acc, [service.id]: true }), {});
        setUpdatingIds(currentlyUpdating);

        try {
            const subscriptionPromises = servicesToSubscribe.map(({ service, qty, useSticker }) => 
                subscribeToNewService(service, selectedProperty.id, qty, useSticker)
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
    
    const baseFeeService = useMemo(() => services.find(s => s.category === 'base_fee'), [services]);
    
    const totals = useMemo(() => {
        const servicesWithQuantities = Object.entries(newServiceQuantities)
            .map(([id, qty]) => ({ service: services.find(s => s.id === id), qty: Number(qty), useSticker: canSources[id] === 'sticker' }))
            .filter((item): item is { service: Service; qty: number; useSticker: boolean } => !!item.service && item.qty > 0);

        if (servicesWithQuantities.length === 0) return { monthly: 0, setup: 0, count: 0 };
        
        let monthly = (baseFeeService?.price || 35.00);
        let setup = 0;
        let count = 0;

        for (const item of servicesWithQuantities) {
            monthly += item.qty * item.service.price;
            count += item.qty;
            if (item.useSticker) {
                setup += item.qty * (item.service.stickerFee || 0);
            } else {
                setup += item.qty * (item.service.setupFee || 0);
            }
        }
        return { monthly, setup, count };
    }, [newServiceQuantities, services, baseFeeService, canSources]);
    
    const getSubscriptionForService = (serviceId: string) => subscriptions.find(sub => sub.serviceId === serviceId);

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }
    if (!selectedProperty) {
        return <div className="text-center p-8">Please select a property to view and add services.</div>;
    }

    const renderNewUserFlow = () => {
        const canServices = (serviceGroups.base_service || []).filter(s => s.id !== 'prod_TOvYnQt1VYbKie'); // Main curbside is inferred
        const isSubscribing = Object.values(updatingIds).some(v => v);

        const handleNewServiceQuantityChange = (serviceId: string, newQuantity: number) => {
            setNewServiceQuantities(prev => ({
                ...prev,
                [serviceId]: Math.max(0, newQuantity)
            }));
        };

        const toggleCanSource = (serviceId: string, source: 'sticker' | 'provided') => {
            setCanSources(prev => ({ ...prev, [serviceId]: source }));
        };
        
        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <div className="max-w-4xl mx-auto">
                    <Card className="border-t-4 border-t-primary shadow-xl">
                        <div className="text-center mb-8">
                            <h1 className="text-4xl font-extrabold text-neutral tracking-tight">Setup Your Service</h1>
                            <p className="text-gray-600 mt-2 text-lg">
                                All weekly curbside services include a <span className="font-bold text-primary">$35.00/mo base fee</span>.
                            </p>
                            <p className="text-sm text-gray-500 mt-1 italic">Equipment branding and rental options available below.</p>
                        </div>

                        <div className="space-y-6">
                            {canServices.map(service => {
                                const quantity = Number(newServiceQuantities[service.id] || 0);
                                const source = canSources[service.id] || 'provided';
                                const activeSetupFee = source === 'sticker' ? (service.stickerFee || 0) : (service.setupFee || 0);

                                return (
                                    <div key={service.id} className={`p-6 border-2 rounded-xl transition-all duration-300 ${quantity > 0 ? 'bg-teal-50 border-primary ring-1 ring-primary/20' : 'bg-white border-base-200 hover:border-base-300'}`}>
                                        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                                            <div className="flex-shrink-0 bg-white p-3 rounded-xl shadow-sm border border-base-200">{service.icon}</div>
                                            <div className="flex-1">
                                                <h3 className="font-bold text-xl text-neutral">{service.name}</h3>
                                                <p className="text-sm text-gray-500 mt-1">{service.description}</p>
                                                
                                                {/* Branding/Equipment Choice */}
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    <button 
                                                        onClick={() => toggleCanSource(service.id, 'sticker')}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5 ${source === 'sticker' ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'}`}
                                                    >
                                                        <SparklesIcon className="w-3.5 h-3.5" />
                                                        Zip-a-dee Sticker (Brand My Own) - ${service.stickerFee?.toFixed(0) || 0} Startup
                                                    </button>
                                                    <button 
                                                        onClick={() => toggleCanSource(service.id, 'provided')}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5 ${source === 'provided' ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'}`}
                                                    >
                                                        <TruckIcon className="w-3.5 h-3.5" />
                                                        Provided Can - ${service.setupFee?.toFixed(0)} Startup
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex flex-row lg:flex-col items-center justify-between lg:justify-center gap-4 border-t lg:border-t-0 lg:border-l border-base-200 pt-4 lg:pt-0 lg:pl-6">
                                                <div className="text-right">
                                                    <p className="text-2xl font-bold text-neutral">${service.price.toFixed(2)}<span className="text-xs font-normal text-gray-400">/mo</span></p>
                                                    {quantity > 0 && <p className="text-xs text-primary font-semibold">Startup: ${activeSetupFee.toFixed(2)}</p>}
                                                </div>
                                                <QuantitySelector
                                                    quantity={quantity}
                                                    onIncrement={() => handleNewServiceQuantityChange(service.id, quantity + 1)}
                                                    onDecrement={() => handleNewServiceQuantityChange(service.id, quantity - 1)}
                                                    isUpdating={!!updatingIds[service.id]}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        
                        {/* Summary Section */}
                        <div className="mt-10 p-8 bg-gray-50 rounded-2xl border border-base-200 shadow-inner">
                            <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                                <div className="space-y-1 text-center md:text-left">
                                    <h4 className="text-neutral font-bold text-lg uppercase tracking-wider">Estimated First Bill</h4>
                                    <div className="space-y-1 text-sm text-gray-600">
                                        <div className="flex justify-between w-64"><span>Monthly Subscription:</span> <span className="font-bold text-neutral">${totals.monthly.toFixed(2)}</span></div>
                                        <div className="flex justify-between w-64 text-primary"><span>One-time Startup Fees:</span> <span className="font-bold">${totals.setup.toFixed(2)}</span></div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-center md:items-end">
                                    <div className="text-4xl font-black text-primary mb-4">
                                        Total: ${(totals.monthly + totals.setup).toFixed(2)}
                                        <span className="block text-sm font-normal text-gray-500 mt-1">Due today</span>
                                    </div>
                                    <Button size="lg" className="w-full md:w-auto shadow-lg hover:shadow-xl transform transition-transform hover:-translate-y-0.5" disabled={totals.count === 0 || isSubscribing} onClick={handleInitialSubscriptions}>
                                        {isSubscribing ? 'Processing...' : 'Complete My Selection'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        );
    };

    const renderExistingUserFlow = () => {
        const baseFeeSub = subscriptions.find(s => s.serviceId === 'prod_BASE_FEE');
        const baseServices = (serviceGroups.base_service || []).filter(s => s.id !== 'prod_TOvYnQt1VYbKie');

        const upgrades = (serviceGroups.upgrade || []).filter(upg => {
             if (upg.id === 'prod_TOx5lSdv97AAGb') return hasTrashSubscription;
             if (upg.id === 'prod_RECYCLE_ADDON') return hasTrashSubscription;
             if (upg.id === 'prod_TOvyKnOx4KLBc2') return hasTrashSubscription || hasRecyclingSubscription;
             return true;
        });

        return (
            <div className="space-y-8 max-w-5xl mx-auto">
                <div><h1 className="text-3xl font-bold text-neutral">Manage Your Services</h1><p className="text-gray-600">Editing collection options for: <span className="font-semibold text-neutral">{selectedProperty.address}</span>.</p></div>
                <Card className="border-l-4 border-l-primary">
                    <h2 className="text-2xl font-semibold text-neutral mb-4">Base Collection Cans</h2>
                    <p className="text-gray-500 mb-6 italic">Equipment changes for existing accounts take effect next billing cycle. Startup fees apply to new cans.</p>
                    <div className="space-y-4">
                        {baseServices.map(service => {
                            const subscription = getSubscriptionForService(service.id);
                            const quantity = subscription?.quantity || 0;

                            return (
                                <div key={service.id} className="p-5 border rounded-xl flex flex-col sm:flex-row justify-between items-center gap-4 bg-white hover:border-primary/30 transition-colors">
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="bg-base-100 p-2 rounded-lg">{service.icon}</div>
                                        <div><h3 className="font-bold text-lg text-neutral">{service.name}</h3><p className="text-xs text-gray-400">Weekly Pickup</p></div>
                                    </div>
                                    <div className="flex items-center gap-6 w-full sm:w-auto border-t sm:border-t-0 pt-4 sm:pt-0">
                                        <div className="text-right">
                                            <p className="font-black text-xl text-neutral">${service.price.toFixed(2)}</p>
                                            <p className="text-xs text-gray-400 uppercase">Per Can</p>
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
                    <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
                        <Card className="bg-secondary/30">
                            <h2 className="text-2xl font-semibold text-neutral mb-4">Convenience Upgrades</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {upgrades.map(service => {
                                    const subscription = getSubscriptionForService(service.id);
                                    const subscribed = !!subscription;
                                    const isUpdating = !!updatingIds[service.id];
                                    return (
                                        <div key={service.id} className="p-4 border border-base-300 rounded-xl flex items-center justify-between gap-4 bg-white shadow-sm">
                                            <div className="flex items-center gap-4">
                                                <div className="opacity-80">{service.icon}</div>
                                                <div>
                                                    <h3 className="font-bold text-neutral">{service.name}</h3>
                                                    <p className="text-sm font-semibold text-primary">${service.price.toFixed(2)} <span className="font-normal text-gray-400 text-xs">/ {service.frequency}</span></p>
                                                </div>
                                            </div>
                                            <Button 
                                                onClick={() => subscribed ? handleQuantityChange(service, 'decrement') : handleQuantityChange(service, 'increment')} 
                                                disabled={isUpdating} 
                                                variant={subscribed ? 'secondary' : 'primary'}
                                                className="rounded-full px-6"
                                            >
                                                {isUpdating ? '...' : (subscribed ? 'Active' : 'Add')}
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        );
    };

    return hasBaseSubscription ? renderExistingUserFlow() : renderNewUserFlow();
};

export default Services;