
import React, { useState, useEffect } from 'react';
import { PaymentMethod } from '../types.ts';
import { getPaymentMethods, addPaymentMethod, deletePaymentMethod, setPrimaryPaymentMethod, updateSubscriptionsForProperty, updateAllUserSubscriptions, getSubscriptions } from '../services/mockApiService.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import Modal from './Modal.tsx';
import { PlusIcon, CreditCardIcon, BanknotesIcon, TrashIcon } from './Icons.tsx';
import { useProperty } from '../PropertyContext.tsx';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getCustomerId } from '../services/stripeService.ts';

const isMethodExpired = (method: PaymentMethod): boolean => {
    if (method.type !== 'Card' || !method.expiryYear || !method.expiryMonth) {
        return false;
    }
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (method.expiryYear < currentYear) {
        return true;
    }
    if (method.expiryYear === currentYear && method.expiryMonth < currentMonth) {
        return true;
    }

    return false;
};

const PaymentMethodCard: React.FC<{
    method: PaymentMethod;
    onDelete: (id: string) => void;
    onSetPrimary: (id: string) => void;
    isExpired: boolean;
}> = ({ method, onDelete, onSetPrimary, isExpired }) => {
    
    return (
        <Card className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isExpired ? 'bg-red-50 border-red-300' : 'bg-white'}`}>
            <div className="flex items-center gap-4">
                {method.type === 'Card' ? <CreditCardIcon className="w-8 h-8 text-neutral" /> : <BanknotesIcon className="w-8 h-8 text-neutral" />}
                <div>
                    <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-neutral">
                           {method.brand ? `${method.brand} ending in ${method.last4}` : `Bank Account ending in ${method.last4}`}
                        </h3>
                        {method.isPrimary && <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary text-primary-content">Primary</span>}
                        {isExpired && <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-200 text-red-800">Expired</span>}
                    </div>
                    {method.type === 'Card' && (
                        <p className={`text-sm ${isExpired ? 'text-red-700' : 'text-gray-500'}`}>
                            Expires {method.expiryMonth}/{method.expiryYear}
                        </p>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                {!method.isPrimary && !isExpired && <Button variant="ghost" size="sm" onClick={() => onSetPrimary(method.id)}>Set Primary</Button>}
                <Button variant="ghost" size="sm" onClick={() => onDelete(method.id)} aria-label={`Delete ${method.brand} ending in ${method.last4}`}>
                    <TrashIcon className="w-5 h-5 text-red-500" />
                </Button>
            </div>
        </Card>
    );
};

const CARD_ELEMENT_OPTIONS = {
    style: {
        base: {
            fontSize: '16px',
            color: '#1f2937',
            '::placeholder': { color: '#9ca3af' },
            fontFamily: 'system-ui, -apple-system, sans-serif',
        },
        invalid: {
            color: '#ef4444',
            iconColor: '#ef4444',
        },
    },
};

const AddPaymentMethodForm: React.FC<{onAdd: (newMethod: PaymentMethod) => void, onClose: () => void}> = ({ onAdd, onClose }) => {
    const stripe = useStripe();
    const elements = useElements();
    const [isAdding, setIsAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stripe || !elements) {
            setError('Payment system is still loading. Please wait a moment.');
            return;
        }

        const customerId = getCustomerId();
        if (!customerId) {
            setError('No customer account found. Please log in again.');
            return;
        }

        setIsAdding(true);
        setError(null);

        try {
            const setupRes = await fetch('/api/setup-intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerId }),
            });
            const { data: setupData } = await setupRes.json();

            const cardElement = elements.getElement(CardElement);
            if (!cardElement) {
                setError('Card input not found. Please try again.');
                setIsAdding(false);
                return;
            }

            const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(
                setupData.clientSecret,
                { payment_method: { card: cardElement as any } }
            );

            if (stripeError) {
                setError(stripeError.message || 'Failed to add card. Please try again.');
                setIsAdding(false);
                return;
            }

            if (setupIntent?.payment_method) {
                const pmId = typeof setupIntent.payment_method === 'string'
                    ? setupIntent.payment_method
                    : setupIntent.payment_method.id;

                await addPaymentMethod(pmId);

                const methods = await getPaymentMethods();
                const added = methods.find((m: PaymentMethod) => m.id === pmId);
                if (added) {
                    onAdd(added);
                } else {
                    onAdd({ id: pmId, type: 'Card', last4: '****', isPrimary: false });
                }
            }
        } catch (err: any) {
            console.error('Failed to add payment method:', err);
            setError(err.message || 'Could not add payment method. Please try again.');
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <div className="mb-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Card Details</label>
                <div className="border border-gray-300 rounded-md p-3 bg-white focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
                    <CardElement options={CARD_ELEMENT_OPTIONS} />
                </div>
            </div>

            {error && (
                <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    {error}
                </div>
            )}

            <p className="text-xs text-gray-500 mt-4 text-center">Your payment information is securely processed by Stripe.</p>

            <div className="mt-6 flex justify-end gap-3">
                 <Button type="button" variant="secondary" onClick={onClose} disabled={isAdding}>Cancel</Button>
                 <Button type="submit" disabled={isAdding || !stripe}>
                    {isAdding ? 'Adding...' : 'Add Card'}
                 </Button>
            </div>
        </form>
    );
};

const UpdateSubscriptionsPrompt: React.FC<{
    onUpdate: (scope: 'property' | 'all') => void;
    onClose: () => void;
    propertyName: string;
}> = ({ onUpdate, onClose, propertyName }) => (
    <>
        <p className="text-gray-600 mb-6">Would you like to update your active subscriptions with this new payment method?</p>
        <div className="space-y-3">
            <Button className="w-full" onClick={() => onUpdate('property')}>
                Update Subscriptions for {propertyName}
            </Button>
            <Button className="w-full" variant="secondary" onClick={() => onUpdate('all')}>
                Update Subscriptions for All Properties
            </Button>
        </div>
        <div className="mt-6 flex justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>No, Thanks</Button>
        </div>
    </>
);


const PaymentMethods: React.FC = () => {
    const { selectedProperty } = useProperty();
    const [methods, setMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalStep, setModalStep] = useState<'add' | 'prompt'>('add');
    const [newlyAddedMethod, setNewlyAddedMethod] = useState<PaymentMethod | null>(null);
    const [isDeleteErrorModalOpen, setIsDeleteErrorModalOpen] = useState(false);

    const fetchMethods = async () => {
        try {
            const data = await getPaymentMethods();
            setMethods(data);
        } catch (error) {
            console.error("Failed to fetch payment methods:", error);
        }
    };

    useEffect(() => {
        setLoading(true);
        fetchMethods().finally(() => setLoading(false));
    }, []);

    const handleDelete = async (id: string) => {
        const allSubs = await getSubscriptions();
        const isInUse = allSubs.some(sub => sub.paymentMethodId === id && sub.status === 'active');

        if (isInUse) {
            setIsDeleteErrorModalOpen(true);
            return;
        }

        if (confirm("Are you sure you want to delete this payment method?")) {
            try {
                await deletePaymentMethod(id);
                await fetchMethods();
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
                alert(`Error: ${errorMessage}`);
            }
        }
    };
    
    const handleSetPrimary = async (id: string) => {
        await setPrimaryPaymentMethod(id);
        await fetchMethods();
    };

    const handleMethodAdded = (newMethod: PaymentMethod) => {
        fetchMethods();
        setNewlyAddedMethod(newMethod);
        setModalStep('prompt');
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setTimeout(() => setModalStep('add'), 300);
    };

    const handleUpdateSubscriptions = async (scope: 'property' | 'all') => {
        if (!newlyAddedMethod || !selectedProperty) return;
        try {
            if (scope === 'property') {
                await updateSubscriptionsForProperty(selectedProperty.id, newlyAddedMethod.id);
                alert(`Subscriptions for ${selectedProperty.address} have been updated.`);
            } else {
                await updateAllUserSubscriptions(newlyAddedMethod.id);
                alert('All of your subscriptions have been updated.');
            }
        } catch (error) {
            console.error("Failed to update subscriptions:", error);
            alert("Could not update subscriptions.");
        } finally {
            closeModal();
        }
    };
    
    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    return (
        <div className="space-y-6">
            <Card className="shadow-xl border-none">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 p-6 bg-gray-50/50 border-b border-base-100">
                    <div>
                        <h2 className="text-xl font-black text-gray-900 tracking-tight">Digital Wallet</h2>
                        <p className="text-gray-500 text-sm mt-1">Manage your saved credit cards and bank accounts.</p>
                    </div>
                    <Button onClick={() => setIsModalOpen(true)} className="shrink-0 rounded-xl">
                        <PlusIcon className="w-5 h-5 mr-2" />
                        Add New Method
                    </Button>
                </div>

                <div className="space-y-4 p-6">
                    {methods.length > 0 ? (
                        methods.map(method => (
                            <PaymentMethodCard 
                                key={method.id} 
                                method={method}
                                onDelete={handleDelete}
                                onSetPrimary={handleSetPrimary}
                                isExpired={isMethodExpired(method)}
                            />
                        ))
                    ) : (
                        <div className="text-center py-12">
                            <CreditCardIcon className="mx-auto h-12 w-12 text-gray-400" />
                            <h3 className="mt-2 text-sm font-medium text-gray-900">No payment methods</h3>
                            <p className="mt-1 text-sm text-gray-500">Get started by adding a new card or bank account.</p>
                        </div>
                    )}
                </div>
            </Card>

            <Modal 
                title={modalStep === 'add' ? "Add New Payment Method" : "Update Subscriptions?"} 
                isOpen={isModalOpen} 
                onClose={closeModal}
            >
                {modalStep === 'add' ? (
                    <AddPaymentMethodForm onAdd={handleMethodAdded} onClose={closeModal} />
                ) : (
                    <UpdateSubscriptionsPrompt 
                        onUpdate={handleUpdateSubscriptions}
                        onClose={closeModal}
                        propertyName={selectedProperty?.address || ''}
                    />
                )}
            </Modal>
            
            <Modal
                isOpen={isDeleteErrorModalOpen}
                onClose={() => setIsDeleteErrorModalOpen(false)}
                title="Cannot Delete Payment Method"
            >
                <p className="text-gray-600 mb-4">
                    This payment method cannot be deleted because it is currently linked to one or more active subscriptions.
                </p>
                <p className="text-gray-600 mb-6">
                    Please update your subscriptions to use a different payment method before deleting this one.
                </p>
                <div className="flex justify-end gap-3">
                    <Button onClick={() => setIsDeleteErrorModalOpen(false)}>
                        Okay
                    </Button>
                </div>
            </Modal>
        </div>
    );
};

export default PaymentMethods;
