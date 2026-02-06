
import React, { useEffect, useState, useMemo } from 'react';
import { subscribeToNewService, getServices, getSubscriptions, changeServiceQuantity } from '../services/mockApiService';
import { Service, Subscription, Property } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import { useProperty } from '../App';
import { PlusIcon, TrashIcon, SparklesIcon, TruckIcon, BuildingOffice2Icon, ArrowRightIcon, PauseCircleIcon, CheckCircleIcon } from './Icons';

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

const PortfolioPropertyCard: React.FC<{
    property: Property;
    subscriptions: Subscription[];
    onSelect: (id: string) => void;
}> = ({ property, subscriptions, onSelect }) => {
    const propertySubs = subscriptions.filter(s => s.propertyId === property.id && s.status === 'active');
    const isPaused = subscriptions.some(s => s.propertyId === property.id && s.status === 'paused');
    const monthlyTotal = propertySubs.reduce((acc, s) => acc + s.totalPrice, 0);

    return (
        <Card className="hover:shadow-xl transition-all duration-300 border-none ring-1 ring-base-200 group">
            <div className="flex justify-between items-start mb-6">
                <div className="flex-1">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">{property.serviceType}</p>
                    <h3 className="text-xl font-black text-gray-900 group-hover:text-primary transition-colors">{property.address}</h3>
                </div>
                {isPaused ? (
                    <div className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full flex items-center gap-2">
                        <PauseCircleIcon className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">On Hold</span>
                    </div>
                ) : (
                    <div className="px-3 py-1 bg-primary/5 text-primary rounded-full flex items-center gap-2">
                        <CheckCircleIcon className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Active</span>
                    </div>
                )}
            </div>

            <div className="space-y-2 mb-6 min-h-[60px]">
                {propertySubs.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {propertySubs.map(s => (
                            <span key={s.id} className="px-2 py-0.5 bg-gray-50 border border-gray-100 rounded text-[10px] font-bold text-gray-600 uppercase">
                                {s.serviceName}
                            </span>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-gray-400 italic font-medium">No services active for this location.</p>
                )}
            </div>

            <div className="flex items-center justify-between border-t border-base-100 pt-4 mt-auto">
                <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Monthly Billing</p>
                    <p className="text-xl font-black text-gray-900 mt-1">${monthlyTotal.toFixed(2)}</p>
                </div>
                <Button 
                    onClick={() => onSelect(property.id)} 
                    variant="primary" 
                    size="sm" 
                    className="rounded-xl px-5 py-2.5 font-black uppercase text-[10px] tracking-widest"
                >
                    Manage Plan <ArrowRightIcon className="w-4 h-4 ml-2" />
                </Button>
            </div>
        </Card>
    );
};

const Services: React.FC = () => {
    const { selectedProperty, properties, setSelectedPropertyId } = useProperty();
    const [services, setServices] = useState<Service[]>([]);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingIds, setUpdatingIds] = useState<Record<string, boolean>>({});
    
    const [newServiceQuantities, setNewServiceQuantities] = useState<Record<string, number>>({});
    const [canSources, setCanSources] = useState<Record<string, 'sticker' | 'provided'>>({});

    const fetchData = async () => {
        setLoading(true);
        try {
            const [servicesData, subsData] = await Promise.all([getServices(), getSubscriptions()]);
            setServices(servicesData);
            setSubscriptions(subsData);
            
            const initialSources: Record<string, 'sticker' | 'provided'> = {};
            servicesData.filter(s => s.category === 'base_service').forEach(s => {
                initialSources[s.id] = 'provided';
            });
            setCanSources(initialSources);
        } catch (error) { 
            console.error("Failed to fetch data:", error); 
        } finally { 
            setLoading(false); 
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleQuantityChange = async (service: Service, change: 'increment' | 'decrement') => {
        if (!selectedProperty) return;
        setUpdatingIds(prev => ({...prev, [service.id]: true }));
        try {
            await changeServiceQuantity(service, selectedProperty.id, change);
            const subsData = await getSubscriptions();
            setSubscriptions(subsData);
        } catch (error) {
            console.error("Failed to update quantity:", error);
            alert("Update failed. Please try again.");
        } finally {
            setUpdatingIds(prev => ({...prev, [service.id]: false }));
        }
    };
    
    const handleInitialSubscriptions = async () => {
        if (!selectedProperty) return;
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
        setUpdatingIds(servicesToSubscribe.reduce((acc, { service }) => ({ ...acc, [service.id]: true }), {}));
        try {
            await Promise.all(servicesToSubscribe.map(({ service, qty, useSticker }) => 
                subscribeToNewService(service, selectedProperty.id!, qty, useSticker)
            ));
            await fetchData();
        } catch (error) {
            console.error("Failed to subscribe:", error);
            alert("Subscription failed. Please try again.");
        } finally {
            setUpdatingIds({});
            setNewServiceQuantities({});
        }
    };

    const hasBaseSubscription = useMemo(() => 
        selectedProperty && subscriptions.some(sub => sub.propertyId === selectedProperty.id && services.find(s => s.id === sub.serviceId)?.category === 'base_service')
    , [subscriptions, services, selectedProperty]);

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
            monthly += item.qty * item.service!.price;
            count += item.qty;
            setup += item.qty * (item.useSticker ? (item.service!.stickerFee || 0) : (item.service!.setupFee || 0));
        }
        return { monthly, setup, count };
    }, [newServiceQuantities, services, baseFeeService, canSources]);
    
    const getSubscriptionForService = (serviceId: string) => 
        subscriptions.find(sub => sub.serviceId === serviceId && sub.propertyId === selectedProperty?.id);

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    // --- PORTFOLIO VIEW (When "All Properties" selected) ---
    if (!selectedProperty) {
        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-base-200 pb-8">
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">Service Hub</h1>
                        <p className="text-gray-500 font-medium mt-1 text-lg">Manage collection plans for all your registered addresses.</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="text-right">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Global Monthly</p>
                            <p className="text-2xl font-black text-primary">${subscriptions.filter(s => s.status === 'active').reduce((acc, s) => acc + s.totalPrice, 0).toFixed(2)}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {properties.map(prop => (
                        <PortfolioPropertyCard 
                            key={prop.id} 
                            property={prop} 
                            subscriptions={subscriptions} 
                            onSelect={setSelectedPropertyId} 
                        />
                    ))}
                    <button 
                        onClick={() => {/* Trigger Add Property Modal via Context/Prop in real app */}}
                        className="group relative flex flex-col items-center justify-center p-8 border-2 border-dashed border-base-200 rounded-[1.5rem] hover:border-primary hover:bg-primary/5 transition-all min-h-[250px]"
                    >
                        <div className="p-4 bg-gray-50 rounded-2xl group-hover:bg-primary group-hover:text-white transition-all">
                            <PlusIcon className="w-8 h-8" />
                        </div>
                        <p className="mt-4 font-black text-gray-400 group-hover:text-primary uppercase text-xs tracking-widest">Register New Address</p>
                    </button>
                </div>
            </div>
        );
    }

    // --- NEW USER FLOW (Catalog Entry) ---
    if (!hasBaseSubscription) {
        const canServices = (serviceGroups.base_service || []).filter(s => s.id !== 'prod_TOvYnQt1VYbKie');
        const isSubscribing = Object.values(updatingIds).some(v => v);

        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <div className="max-w-4xl mx-auto">
                    <Card className="border-t-4 border-t-primary shadow-xl">
                        <div className="text-center mb-8">
                            <h1 className="text-4xl font-extrabold text-neutral tracking-tight">Setup Your Service</h1>
                            <p className="text-gray-600 mt-2 text-lg">
                                Collection at <span className="font-bold text-neutral">{selectedProperty.address}</span> includes a $35.00/mo base fee.
                            </p>
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
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    <button 
                                                        onClick={() => setCanSources(prev => ({ ...prev, [service.id]: 'sticker' }))}
                                                        className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${source === 'sticker' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'}`}
                                                    >
                                                        Use My Own Can (${service.stickerFee?.toFixed(0) || 0} setup)
                                                    </button>
                                                    <button 
                                                        onClick={() => setCanSources(prev => ({ ...prev, [service.id]: 'provided' }))}
                                                        className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${source === 'provided' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'}`}
                                                    >
                                                        Rental Can (${service.setupFee?.toFixed(0)} setup)
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex flex-row lg:flex-col items-center justify-between lg:justify-center gap-4 border-t lg:border-t-0 lg:border-l border-base-200 pt-4 lg:pt-0 lg:pl-6">
                                                <div className="text-right">
                                                    <p className="text-2xl font-black text-neutral">${service.price.toFixed(2)}<span className="text-xs font-normal text-gray-400">/mo</span></p>
                                                    {quantity > 0 && <p className="text-[10px] text-primary font-black uppercase tracking-widest mt-1">Setup: ${activeSetupFee.toFixed(2)}</p>}
                                                </div>
                                                <QuantitySelector
                                                    quantity={quantity}
                                                    onIncrement={() => setNewServiceQuantities(prev => ({ ...prev, [service.id]: (prev[service.id] || 0) + 1 }))}
                                                    onDecrement={() => setNewServiceQuantities(prev => ({ ...prev, [service.id]: Math.max(0, (prev[service.id] || 0) - 1) }))}
                                                    isUpdating={!!updatingIds[service.id]}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        
                        <div className="mt-10 p-8 bg-gray-50 rounded-2xl border border-base-200 shadow-inner">
                            <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                                <div className="space-y-1 text-center md:text-left">
                                    <h4 className="text-neutral font-black text-[10px] uppercase tracking-[0.2em]">Estimated First Bill</h4>
                                    <div className="space-y-1 text-sm text-gray-600 mt-2">
                                        <div className="flex justify-between w-64"><span>Monthly:</span> <span className="font-bold text-neutral">${totals.monthly.toFixed(2)}</span></div>
                                        <div className="flex justify-between w-64 text-primary"><span>Setup Fees:</span> <span className="font-bold">${totals.setup.toFixed(2)}</span></div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-center md:items-end">
                                    <div className="text-4xl font-black text-primary mb-4">
                                        Total: ${(totals.monthly + totals.setup).toFixed(2)}
                                    </div>
                                    <Button size="lg" className="rounded-2xl px-12 h-16 text-lg font-black uppercase tracking-widest shadow-xl shadow-primary/20" disabled={totals.count === 0 || isSubscribing} onClick={handleInitialSubscriptions}>
                                        {isSubscribing ? 'Provisioning...' : 'Activate Plan'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        );
    }

    // --- EXISTING USER FLOW (Management) ---
    const baseServices = (serviceGroups.base_service || []).filter(s => s.id !== 'prod_TOvYnQt1VYbKie');
    const upgrades = (serviceGroups.upgrade || []);

    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Manage Subscriptions</h1>
                <p className="text-gray-500 font-medium">Updating service levels for: <span className="font-bold text-gray-900">{selectedProperty.address}</span></p>
            </div>
            
            <div className="grid grid-cols-1 gap-8">
                <Card className="border-none ring-1 ring-base-200">
                    <h2 className="text-xl font-black text-gray-900 uppercase tracking-widest mb-6 pb-4 border-b border-base-100">Equipment & Frequency</h2>
                    <div className="space-y-4">
                        {baseServices.map(service => {
                            const subscription = getSubscriptionForService(service.id);
                            const quantity = subscription?.quantity || 0;
                            return (
                                <div key={service.id} className="p-6 border border-base-200 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4 bg-white hover:border-primary/50 transition-colors group">
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="bg-base-100 p-3 rounded-xl group-hover:bg-primary/10 group-hover:text-primary transition-colors">{service.icon}</div>
                                        <div>
                                            <h3 className="font-black text-gray-900">{service.name}</h3>
                                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-0.5">Weekly Collection</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-8 w-full sm:w-auto border-t sm:border-t-0 pt-4 sm:pt-0">
                                        <div className="text-right">
                                            <p className="font-black text-2xl text-gray-900 leading-none">${service.price.toFixed(2)}</p>
                                            <p className="text-[10px] text-gray-400 font-black uppercase mt-1">Per Can</p>
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

                <Card className="bg-gray-50 border-none">
                    <h2 className="text-xl font-black text-gray-900 uppercase tracking-widest mb-6">Optional Upgrades</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {upgrades.map(service => {
                            const subscription = getSubscriptionForService(service.id);
                            const subscribed = !!subscription;
                            const isUpdating = !!updatingIds[service.id];
                            return (
                                <div key={service.id} className="p-5 bg-white border border-base-200 rounded-2xl flex items-center justify-between gap-4 shadow-sm hover:shadow-md transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-gray-50 rounded-lg text-gray-400">{service.icon}</div>
                                        <div>
                                            <h3 className="font-bold text-gray-900 text-sm">{service.name}</h3>
                                            <p className="text-xs font-black text-primary tracking-widest uppercase">${service.price.toFixed(2)} / mo</p>
                                        </div>
                                    </div>
                                    <Button 
                                        onClick={() => subscribed ? handleQuantityChange(service, 'decrement') : handleQuantityChange(service, 'increment')} 
                                        disabled={isUpdating} 
                                        variant={subscribed ? 'secondary' : 'primary'}
                                        className="rounded-xl px-6 text-[10px] font-black uppercase tracking-widest"
                                    >
                                        {isUpdating ? '...' : (subscribed ? 'Active' : 'Add')}
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default Services;
