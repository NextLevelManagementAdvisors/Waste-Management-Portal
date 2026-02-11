import React, { useEffect, useState, useMemo } from 'react';
import { getSubscriptions, getPaymentMethods, updateSubscriptionPaymentMethod, cancelSubscription, getServices } from '../services/mockApiService.ts';
import { Subscription, PaymentMethod, Service, Property } from '../types.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { useProperty } from '../PropertyContext.tsx';
import Modal from './Modal.tsx';
import { CreditCardIcon, BanknotesIcon, BuildingOffice2Icon, ChartPieIcon, SparklesIcon, ArrowRightIcon, ExclamationTriangleIcon } from './Icons.tsx';

const SubscriptionCard: React.FC<{
    sub: Subscription;
    service: Service | undefined;
    paymentMethod: PaymentMethod | undefined;
    onCancel: () => void;
    onChangePayment: () => void;
}> = ({ sub, service, paymentMethod, onCancel, onChangePayment }) => {
    const statusColor = {
        active: 'bg-green-100 text-green-800',
        paused: 'bg-yellow-100 text-yellow-800',
        canceled: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
    };

    const isNew = (new Date().getTime() - new Date(sub.startDate).getTime()) < 7 * 24 * 60 * 60 * 1000; // 7 days
    const setupFee = sub.equipmentType === 'own_can' ? (service?.stickerFee || 0) : (service?.setupFee || 0);
    
    return (
        <Card className="hover:shadow-lg transition-all duration-300 border-l-4 border-primary group">
            <div className="flex flex-col md:flex-row justify-between gap-6">
                <div className="flex-1">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-4">
                        <div>
                            <h3 className="text-xl font-black text-gray-900">
                                {sub.serviceName}
                                {sub.quantity > 1 && <span className="text-sm font-normal text-gray-400 ml-2">x {sub.quantity}</span>}
                            </h3>
                        </div>
                        <div className="flex items-center gap-2 self-start">
                             <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-full ${statusColor[sub.status]}`}>{sub.status}</span>
                        </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-base-100">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Billing Details</p>
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-y-4 gap-x-6 p-4 bg-gray-50/70 rounded-xl border border-base-200">
                            <div className="flex-1">
                                <p className="text-sm text-gray-500">Next charge on <span className="font-bold text-gray-900">{sub.nextBillingDate}</span></p>
                                <div className="flex items-baseline gap-2 mt-1">
                                    <p className="text-2xl font-black text-primary">${sub.totalPrice.toFixed(2)}</p>
                                    {isNew && setupFee > 0 && (
                                        <span className="text-xs font-bold text-orange-500 bg-orange-100 px-2 py-1 rounded-full animate-in fade-in">
                                            + ${setupFee.toFixed(2)} Setup Fee
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="w-full lg:w-px h-px lg:h-12 bg-base-200"></div>
                            <div className="flex items-center gap-3">
                                {paymentMethod?.type === 'Card' ? <CreditCardIcon className="w-8 h-8 text-gray-400" /> : <BanknotesIcon className="w-8 h-8 text-gray-400" />}
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-gray-900">{paymentMethod ? `${paymentMethod.brand || 'Bank Account'}` : 'No Method'}</p>
                                    <p className="text-xs text-gray-500">ending in ••{paymentMethod?.last4}</p>
                                </div>
                                {sub.status !== 'canceled' && (
                                     <Button variant="ghost" size="sm" onClick={onChangePayment} className="text-[10px] font-black uppercase tracking-widest ml-auto">Change</Button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                 {sub.status !== 'canceled' && (
                     <div className="flex items-center self-start md:self-center">
                         {/* FIX: Removed redundant `disabled` prop that was causing a type error. 
                             The parent `sub.status !== 'canceled'` check already ensures this button 
                             is not rendered for canceled subscriptions. */}
                         <Button variant="secondary" size="sm" onClick={onCancel} className="text-xs hover:bg-red-50 hover:text-red-600 border-none">
                            Cancel
                        </Button>
                    </div>
                 )}
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

    // Modal States
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [tempPaymentMethodId, setTempPaymentMethodId] = useState('');

    const isAllMode = !selectedProperty && properties.length > 0;

    const fetchData = async () => {
        setLoading(true);
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
        // FIX: Removed status filter to allow all subscriptions (including canceled) to be displayed. This resolves a downstream type error in SubscriptionCard.
        return isAllMode
            ? allSubscriptions
            : allSubscriptions.filter(s => s.propertyId === selectedProperty?.id);
    }, [isAllMode, allSubscriptions, selectedProperty]);

    const groupedSubscriptions = useMemo(() => {
        return properties.reduce((acc, prop) => {
            // FIX: Removed status filter to allow all subscriptions (including canceled) to be displayed.
            const subs = allSubscriptions.filter(s => s.propertyId === prop.id);
            if (subs.length > 0) acc.push({ property: prop, subs });
            return acc;
        }, [] as { property: Property, subs: Subscription[] }[]);
    }, [properties, allSubscriptions]);

    // Handlers
    const openCancelModal = (sub: Subscription) => {
        const baseFeeService = services.find(s => s.category === 'base_fee');
        
        if (baseFeeService && sub.serviceId === baseFeeService.id) {
            const hasActiveCans = allSubscriptions.some(s => 
                s.propertyId === sub.propertyId &&
                s.status === 'active' &&
                s.id !== sub.id &&
                services.find(srv => srv.id === s.serviceId)?.category === 'base_service'
            );

            if (hasActiveCans) {
                alert("The 'Standard Curbside' service is a required base fee and cannot be canceled while you have active can subscriptions. Please cancel your can subscriptions first, or cancel all services via the Settings page.");
                return;
            }
        }
        
        setSelectedSub(sub);
        setIsCancelModalOpen(true);
    };

    const openPaymentModal = (sub: Subscription) => {
        setSelectedSub(sub);
        setTempPaymentMethodId(sub.paymentMethodId);
        setIsPaymentModalOpen(true);
    };

    const handleConfirmCancel = async () => {
        if (!selectedSub) return;
        setIsProcessing(true);
        try {
            // Cancel the selected subscription first
            await cancelSubscription(selectedSub.id);

            // Check if we need to cascade-cancel the base fee
            const selectedService = services.find(s => s.id === selectedSub.serviceId);
            if (selectedService?.category === 'base_service') {
                // We just canceled a can. Check if it was the last one.
                const currentSubs = await getSubscriptions();
                
                const remainingCans = currentSubs.filter(s =>
                    s.propertyId === selectedSub.propertyId &&
                    s.status === 'active' &&
                    services.find(srv => srv.id === s.serviceId)?.category === 'base_service'
                );

                if (remainingCans.length === 0) {
                    // This was the last can, so cancel the base fee service too.
                    const baseFeeService = services.find(s => s.category === 'base_fee');
                    if (baseFeeService) {
                        const baseFeeSub = currentSubs.find(s => 
                            s.propertyId === selectedSub.propertyId &&
                            s.serviceId === baseFeeService.id &&
                            s.status === 'active'
                        );
                        if (baseFeeSub) {
                            await cancelSubscription(baseFeeSub.id);
                        }
                    }
                }
            }
            
            await fetchData(); // This will refresh the state with all cancellations
            setIsCancelModalOpen(false);
        } catch (error) {
            alert("Failed to cancel subscription.");
        } finally {
            setIsProcessing(false);
            setSelectedSub(null);
        }
    };

    const handleConfirmPaymentUpdate = async () => {
        if (!selectedSub || !tempPaymentMethodId) return;
        setIsProcessing(true);
        try {
            await updateSubscriptionPaymentMethod(selectedSub.id, tempPaymentMethodId);
            await fetchData();
            setIsPaymentModalOpen(false);
        } catch (error) {
            alert("Failed to update payment method.");
        } finally {
            setIsProcessing(false);
            setSelectedSub(null);
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    if (subscriptionsToDisplay.length === 0 && !isAllMode) {
        return (
            <Card className="text-center py-20">
                 <SparklesIcon className="mx-auto h-12 w-12 text-gray-400" />
                 <h3 className="mt-2 text-sm font-medium text-gray-900">No Active Subscriptions</h3>
                 <p className="mt-1 text-sm text-gray-500">This property has no services. Go to the 'My Service' tab to get started.</p>
            </Card>
        );
    }
    
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight">Active Subscriptions</h2>
                <p className="text-gray-500 text-sm mt-1">Manage recurring services and their assigned payment methods.</p>
            </div>
            
            {isAllMode ? (
                <div className="space-y-8">
                    {groupedSubscriptions.map(({property, subs}) => (
                        <div key={property.id}>
                            <h3 
                                className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2 mb-4 cursor-pointer hover:text-primary transition-colors"
                                onClick={() => setSelectedPropertyId(property.id)}
                            >
                                <BuildingOffice2Icon className="w-5 h-5" /> 
                                {property.address}
                                <ArrowRightIcon className="w-4 h-4" />
                            </h3>
                            <div className="space-y-4">
                                {subs.map(sub => {
                                    const service = services.find(s => s.id === sub.serviceId);
                                    return (
                                     <SubscriptionCard 
                                        key={sub.id} 
                                        sub={sub} 
                                        service={service}
                                        paymentMethod={paymentMethods.find(pm => pm.id === sub.paymentMethodId)}
                                        onCancel={() => openCancelModal(sub)}
                                        onChangePayment={() => openPaymentModal(sub)}
                                    />
                                )})}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-4">
                     {subscriptionsToDisplay.map(sub => {
                         const service = services.find(s => s.id === sub.serviceId);
                         return (
                         <SubscriptionCard 
                            key={sub.id} 
                            sub={sub} 
                            service={service}
                            paymentMethod={paymentMethods.find(pm => pm.id === sub.paymentMethodId)}
                            onCancel={() => openCancelModal(sub)}
                            onChangePayment={() => openPaymentModal(sub)}
                        />
                     )}
                    )}
                </div>
            )}

             <Modal isOpen={isCancelModalOpen} onClose={() => setIsCancelModalOpen(false)} title="Confirm Cancellation">
                <p className="mb-4">Are you sure you want to cancel the <span className="font-bold">{selectedSub?.serviceName}</span> service?</p>
                <p className="text-sm text-gray-500">This will take effect at the end of the current billing cycle. This action cannot be undone.</p>
                <div className="mt-6 flex justify-end gap-3">
                    <Button type="button" variant="secondary" onClick={() => setIsCancelModalOpen(false)} disabled={isProcessing}>Back</Button>
                    <Button type="button" onClick={handleConfirmCancel} disabled={isProcessing} className="bg-red-600 hover:bg-red-700 focus:ring-red-500">
                        {isProcessing ? 'Canceling...' : 'Confirm'}
                    </Button>
                </div>
            </Modal>
            
            <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title="Update Payment Method">
                <h4 className="font-semibold text-neutral mb-2">Select a new payment method for <span className="text-primary">{selectedSub?.serviceName}</span>:</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {paymentMethods.map(method => (
                         <div 
                            key={method.id} 
                            onClick={() => setTempPaymentMethodId(method.id)}
                            className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${tempPaymentMethodId === method.id ? 'border-primary ring-1 ring-primary bg-teal-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                        >
                            {method.type === 'Card' ? <CreditCardIcon className="w-6 h-6 mr-3 text-neutral" /> : <BanknotesIcon className="w-6 h-6 mr-3 text-neutral" />}
                            <div className="flex-1">
                                <p className="font-semibold text-neutral">{method.brand ? `${method.brand} ending in ${method.last4}` : `Bank Account ending in ${method.last4}`}</p>
                                {method.isPrimary && <p className="text-xs text-primary font-bold">Primary</p>}
                            </div>
                        </div>
                    ))}
                </div>
                 <div className="mt-6 flex justify-end gap-3">
                    <Button type="button" variant="secondary" onClick={() => setIsPaymentModalOpen(false)} disabled={isProcessing}>Cancel</Button>
                    <Button type="button" onClick={handleConfirmPaymentUpdate} disabled={isProcessing || !tempPaymentMethodId}>
                        {isProcessing ? 'Updating...' : 'Update Method'}
                    </Button>
                </div>
            </Modal>
        </div>
    );
};

export default Subscriptions;
