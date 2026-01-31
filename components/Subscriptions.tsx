import React, { useEffect, useState, useMemo } from 'react';
import { getSubscriptions, getPaymentMethods, updateSubscriptionPaymentMethod, cancelSubscription, getServices } from '../services/mockApiService';
import { Subscription, PaymentMethod, Service, Property } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import { useProperty } from '../App';
import Modal from './Modal';
import { CreditCardIcon, BanknotesIcon, BuildingOffice2Icon, ChartPieIcon, SparklesIcon, ArrowRightIcon } from './Icons';

const SubscriptionCard: React.FC<{
    sub: Subscription;
    paymentMethod: PaymentMethod | undefined;
    onCancel: () => void;
    onChangePayment: () => void;
}> = ({ sub, paymentMethod, onCancel, onChangePayment }) => {
    const statusColor = {
        active: 'bg-green-100 text-green-800',
        paused: 'bg-yellow-100 text-yellow-800',
        canceled: 'bg-red-100 text-red-800',
    };
    
    return (
        <Card className="hover:shadow-md transition-all duration-300 border-l-4 border-l-primary group">
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-black text-neutral">
                            {sub.serviceName}
                            {sub.quantity > 1 && <span className="text-sm font-normal text-gray-400 ml-2">x {sub.quantity}</span>}
                        </h3>
                        <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-full ${statusColor[sub.status]}`}>{sub.status}</span>
                    </div>
                    <p className="text-gray-500 mt-1 text-sm font-medium">Next charge: <span className="font-bold text-neutral">${sub.totalPrice.toFixed(2)}</span> on {sub.nextBillingDate}</p>
                     <div className="mt-3 text-[10px] text-gray-400 font-black flex items-center bg-gray-50 p-2 rounded-lg w-fit uppercase tracking-wider">
                        {paymentMethod?.type === 'Card' ? <CreditCardIcon className="w-4 h-4 mr-2" /> : <BanknotesIcon className="w-4 h-4 mr-2" />}
                        {paymentMethod ? `${paymentMethod.brand || 'BANK'} •• ${paymentMethod.last4}` : 'NO METHOD'}
                    </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-center">
                    {sub.status !== 'canceled' && (
                        <Button variant="ghost" size="sm" onClick={onChangePayment} className="text-xs">Update Billing</Button>
                    )}
                     <Button variant="secondary" size="sm" onClick={onCancel} disabled={sub.status === 'canceled'} className="text-xs hover:bg-red-50 hover:text-red-600 border-none">
                        Cancel
                    </Button>
                </div>
            </div>
        </Card>
    )
}

const Subscriptions: React.FC = () => {
    const { selectedProperty, properties, setSelectedPropertyId } = useProperty();
    const [allSubscriptions, setAllSubscriptions] = useState<Subscription[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);

    const isAllMode = !selectedProperty && properties.length > 0;

    const fetchData = async () => {
        if (loading) setLoading(true);
        try {
            const [subsData, servicesData, methodsData] = await Promise.all([
                getSubscriptions(),
                getServices(),
                getPaymentMethods()
            ]);
            setAllSubscriptions(subsData);
            setServices(servicesData);
            setPaymentMethods(methodsData);
        } catch (error) {
            console.error("Fetch data failed:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const subscriptionsToDisplay = useMemo(() => {
        return isAllMode
            ? allSubscriptions.filter(s => s.status !== 'canceled')
            : allSubscriptions.filter(s => s.propertyId === selectedProperty?.id && s.status !== 'canceled');
    }, [isAllMode, allSubscriptions, selectedProperty]);

    const grandTotal = useMemo(() => {
        return subscriptionsToDisplay.filter(s => s.status === 'active').reduce((acc, sub) => acc + sub.totalPrice, 0);
    }, [subscriptionsToDisplay]);

    const activeSubCount = useMemo(() => {
        return subscriptionsToDisplay.filter(s => s.status === 'active').length;
    }, [subscriptionsToDisplay]);

    const groupedSubscriptions = useMemo(() => {
        return properties.reduce((acc, prop) => {
            const subs = allSubscriptions.filter(s => s.propertyId === prop.id && s.status !== 'canceled');
            if (subs.length > 0) acc.push({ property: prop, subs });
            return acc;
        }, [] as { property: Property, subs: Subscription[] }[]);
    }, [properties, allSubscriptions]);

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col lg:flex-row justify-between lg:items-end gap-4 border-b-2 border-base-200 pb-4">
                <div>
                    <h1 className="text-4xl font-black text-neutral tracking-tight">
                        {isAllMode ? "Account Portfolio" : "Active Services"}
                    </h1>
                    <p className="text-gray-500 font-medium mt-1 text-lg">
                        {isAllMode ? `Managing services for all ${properties.length} locations.` : `Reviewing collection for ${selectedProperty?.address}`}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {/* Requirement: White text against primary teal when All Properties is selected */}
                 <Card className={`${isAllMode ? 'bg-primary text-white border-none shadow-xl shadow-teal-900/20' : 'bg-white border-base-300'} relative overflow-hidden transition-all duration-500`}>
                    <ChartPieIcon className={`absolute -right-4 -bottom-4 w-32 h-32 opacity-10 ${isAllMode ? 'text-white' : 'text-primary'}`} />
                    <div className="relative z-10">
                        <h3 className={`font-black text-[10px] uppercase tracking-[0.2em] ${isAllMode ? 'text-teal-50' : 'text-gray-400'}`}>
                            {isAllMode ? 'Portfolio Monthly' : 'Property Total'}
                        </h3>
                        <p className={`text-5xl font-black mt-2 leading-none ${isAllMode ? 'text-white' : 'text-neutral'}`}>
                            ${grandTotal.toFixed(2)}
                            <span className={`text-lg font-bold ml-1 ${isAllMode ? 'text-white/60' : 'text-gray-400'}`}>/mo</span>
                        </p>
                        <p className={`text-[10px] mt-8 flex items-center gap-2 font-black uppercase tracking-widest ${isAllMode ? 'text-teal-100' : 'text-primary'}`}>
                             <div className={`w-2 h-2 rounded-full animate-pulse ${isAllMode ? 'bg-teal-300' : 'bg-primary'}`} />
                             {activeSubCount} Active Services
                        </p>
                    </div>
                </Card>

                <Card className="border-base-300">
                    <h3 className="text-gray-400 font-black text-[10px] uppercase tracking-widest">Active Statements</h3>
                    <p className="text-3xl font-black text-neutral mt-2">Aug 1, 2025</p>
                    <p className="text-[10px] text-primary font-black mt-8 flex items-center gap-2 uppercase tracking-widest">
                        <SparklesIcon className="w-4 h-4" />
                        Unified Autopay Active
                    </p>
                </Card>

                <Card className="border-base-300">
                    <h3 className="text-gray-400 font-black text-[10px] uppercase tracking-widest">Primary Card</h3>
                    <div className="mt-2 flex items-center gap-3">
                        <CreditCardIcon className="w-8 h-8 text-primary" />
                        <div>
                             <p className="text-xl font-black text-neutral">•••• 4242</p>
                             <p className="text-[10px] text-gray-500 font-bold uppercase">Visa Corporate</p>
                        </div>
                    </div>
                </Card>
            </div>
            
            <div className="space-y-12 mt-12">
                {isAllMode ? (
                    groupedSubscriptions.map(({ property, subs }) => (
                        <div key={property.id} className="space-y-4">
                            <div className="flex items-center gap-3 border-b-2 border-base-200 pb-3">
                                <BuildingOffice2Icon className="w-6 h-6 text-primary" />
                                <h2 className="text-2xl font-black text-neutral leading-tight tracking-tight">{property.address}</h2>
                                <div className="ml-auto">
                                    <Button variant="ghost" size="sm" onClick={() => setSelectedPropertyId(property.id)} className="text-xs font-black uppercase tracking-widest">
                                        Focus Property <ArrowRightIcon className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                {subs.map(sub => (
                                    <SubscriptionCard 
                                        key={sub.id} 
                                        sub={sub}
                                        paymentMethod={paymentMethods.find(pm => pm.id === sub.paymentMethodId)}
                                        onCancel={() => {}}
                                        onChangePayment={() => {}}
                                    />
                                ))}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="space-y-4">
                        {subscriptionsToDisplay.length > 0 ? (
                            subscriptionsToDisplay.map(sub => (
                                <SubscriptionCard 
                                    key={sub.id} 
                                    sub={sub}
                                    paymentMethod={paymentMethods.find(pm => pm.id === sub.paymentMethodId)}
                                    onCancel={() => {}}
                                    onChangePayment={() => {}}
                                />
                            ))
                        ) : (
                            <Card className="bg-gray-50 border-dashed border-2 py-20 text-center">
                                <p className="text-gray-500 font-bold italic mb-4">No active services at this location.</p>
                                <Button onClick={() => setSelectedPropertyId('all')} variant="secondary">Back to Portfolio Overview</Button>
                            </Card>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Subscriptions;