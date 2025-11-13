
import React, { useEffect, useState } from 'react';
import { getSubscriptions, getPaymentMethods, updateSubscriptionPaymentMethod } from '../services/mockApiService';
import { Subscription, PaymentMethod } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import { useProperty } from '../App';
import Modal from './Modal';
import { CreditCardIcon, BanknotesIcon } from './Icons';


interface ChangePaymentMethodModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (newPaymentMethodId: string) => void;
    subscription: Subscription;
    paymentMethods: PaymentMethod[];
}

const ChangePaymentMethodModal: React.FC<ChangePaymentMethodModalProps> = ({ isOpen, onClose, onSave, subscription, paymentMethods }) => {
    const [selectedMethodId, setSelectedMethodId] = useState(subscription.paymentMethodId);

    useEffect(() => {
        setSelectedMethodId(subscription.paymentMethodId);
    }, [subscription]);

    const handleSave = () => {
        onSave(selectedMethodId);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Change Payment for ${subscription.serviceName}`}>
            <div className="space-y-4">
                <p className="text-gray-600">Select a new payment method for this subscription.</p>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {paymentMethods.map(method => (
                        <div 
                            key={method.id} 
                            onClick={() => setSelectedMethodId(method.id)}
                            className={`flex items-center p-3 border rounded-lg cursor-pointer ${selectedMethodId === method.id ? 'border-primary ring-2 ring-primary' : 'border-gray-300'}`}
                        >
                            {method.type === 'Card' ? <CreditCardIcon className="w-6 h-6 mr-3 text-neutral" /> : <BanknotesIcon className="w-6 h-6 mr-3 text-neutral" />}
                            <div className="flex-1">
                                <p className="font-semibold">{method.brand ? `${method.brand} ending in ${method.last4}` : `Bank Account ending in ${method.last4}`}</p>
                                {method.isPrimary && <p className="text-xs text-primary">Primary</p>}
                            </div>
                            <input
                                type="radio"
                                name="paymentMethod"
                                value={method.id}
                                checked={selectedMethodId === method.id}
                                onChange={() => setSelectedMethodId(method.id)}
                                className="form-radio h-4 w-4 text-primary"
                            />
                        </div>
                    ))}
                </div>
                 <div className="mt-6 flex justify-end gap-3">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="button" onClick={handleSave}>Save Changes</Button>
                </div>
            </div>
        </Modal>
    );
};


const SubscriptionCard: React.FC<{
    sub: Subscription;
    paymentMethod?: PaymentMethod;
    onChangePayment: () => void;
}> = ({ sub, paymentMethod, onChangePayment }) => {
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
                        <h3 className="text-xl font-semibold text-neutral">{sub.serviceName}</h3>
                        <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusColor[sub.status]}`}>{sub.status}</span>
                    </div>
                    <p className="text-gray-500 mt-1">Next bill on {sub.nextBillingDate} for <span className="font-semibold text-neutral">${sub.price.toFixed(2)}</span></p>
                    <p className={`text-sm mt-2 font-mono ${sub.source === 'Stripe' ? 'text-indigo-600' : 'text-gray-400'}`}>Source: {sub.source}</p>
                </div>
                <div className="flex-shrink-0">
                    <Button variant="secondary" disabled={sub.status === 'canceled'}>Manage</Button>
                </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
                {paymentMethod ? (
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 flex items-center gap-2">
                            {paymentMethod.type === 'Card' ? <CreditCardIcon className="w-5 h-5" /> : <BanknotesIcon className="w-5 h-5" />}
                            Billed to {paymentMethod.brand ? `${paymentMethod.brand} •••• ${paymentMethod.last4}` : `Bank •••• ${paymentMethod.last4}`}
                        </span>
                        <button onClick={onChangePayment} className="font-semibold text-primary hover:text-primary-focus disabled:text-gray-400 disabled:cursor-not-allowed" disabled={sub.status === 'canceled'}>
                            Change
                        </button>
                    </div>
                ) : (
                    <div className="text-sm text-red-500">
                        Warning: No payment method assigned.
                    </div>
                )}
            </div>
        </Card>
    )
}


const Subscriptions: React.FC = () => {
    const { selectedProperty } = useProperty();
    const [allSubscriptions, setAllSubscriptions] = useState<Subscription[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);


    const fetchData = async () => {
        setLoading(true);
        try {
            const [subsData, payMethodsData] = await Promise.all([
                getSubscriptions(),
                getPaymentMethods()
            ]);
            setAllSubscriptions(subsData);
            setPaymentMethods(payMethodsData);
        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleOpenChangePaymentModal = (sub: Subscription) => {
        setSelectedSub(sub);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setSelectedSub(null);
        setIsModalOpen(false);
    };

    const handleSavePaymentMethod = async (newPaymentMethodId: string) => {
        if (!selectedSub) return;

        try {
            await updateSubscriptionPaymentMethod(selectedSub.id, newPaymentMethodId);
            await fetchData();
        } catch (error) {
            console.error("Failed to update payment method:", error);
            alert("Update failed. Please try again.");
        } finally {
            handleCloseModal();
        }
    };
    
    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    const filteredSubscriptions = selectedProperty 
        ? allSubscriptions.filter(s => s.propertyId === selectedProperty.id) 
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
                        filteredSubscriptions.map(sub => {
                            const paymentMethod = paymentMethods.find(p => p.id === sub.paymentMethodId);
                            return (
                                <SubscriptionCard 
                                    key={sub.id} 
                                    sub={sub} 
                                    paymentMethod={paymentMethod}
                                    onChangePayment={() => handleOpenChangePaymentModal(sub)}
                                />
                            );
                        })
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
            {selectedSub && (
                <ChangePaymentMethodModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    onSave={handleSavePaymentMethod}
                    subscription={selectedSub}
                    paymentMethods={paymentMethods}
                />
            )}
        </div>
    );
};

export default Subscriptions;