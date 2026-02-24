
import React, { useState, useEffect } from 'react';
import { PaymentMethod } from '../types.ts';
import { getPaymentMethods, addPaymentMethod, deletePaymentMethod, setPrimaryPaymentMethod, updateSubscriptionsForProperty, updateAllUserSubscriptions, getSubscriptions } from '../services/apiService.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import Modal from './Modal.tsx';
import { PlusIcon, CreditCardIcon, BanknotesIcon, TrashIcon } from './Icons.tsx';
import { useProperty } from '../PropertyContext.tsx';
import { PaymentElement, useStripe, useElements, Elements } from '@stripe/react-stripe-js';
import { getStripePromise } from './StripeProvider.tsx';

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
    onAssignToPlans: (method: PaymentMethod) => void;
    isExpired: boolean;
}> = ({ method, onDelete, onSetPrimary, onAssignToPlans, isExpired }) => {
    
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
                {!isExpired && <Button variant="ghost" size="sm" onClick={() => onAssignToPlans(method)}>Assign to Plans</Button>}
                {!method.isPrimary && !isExpired && <Button variant="ghost" size="sm" onClick={() => onSetPrimary(method.id)}>Set Primary</Button>}
                <Button variant="ghost" size="sm" onClick={() => onDelete(method.id)} aria-label={`Delete ${method.brand} ending in ${method.last4}`}>
                    <TrashIcon className="w-5 h-5 text-red-500" />
                </Button>
            </div>
        </Card>
    );
};

const PaymentElementForm: React.FC<{onAdd: (newMethod: PaymentMethod) => void, onClose: () => void}> = ({ onAdd, onClose }) => {
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

        setIsAdding(true);
        setError(null);

        try {
            const { error: stripeError, setupIntent } = await stripe.confirmSetup({
                elements,
                redirect: 'if_required',
            });

            if (stripeError) {
                setError(stripeError.message || 'Failed to add payment method. Please try again.');
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
                <PaymentElement />
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
                    {isAdding ? 'Adding...' : 'Add Payment Method'}
                 </Button>
            </div>
        </form>
    );
};

const AddPaymentMethodForm: React.FC<{onAdd: (newMethod: PaymentMethod) => void, onClose: () => void}> = ({ onAdd, onClose }) => {
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/setup-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        })
            .then(async res => {
                if (!res.ok) {
                    const json = await res.json().catch(() => ({}));
                    throw new Error(json.error || 'Server error');
                }
                return res.json();
            })
            .then(json => { setClientSecret(json.data.clientSecret); setLoading(false); })
            .catch(err => { setError(err.message || 'Failed to initialize payment form.'); setLoading(false); });
    }, []);

    if (loading) {
        return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-4 border-primary/20 border-t-primary"></div></div>;
    }

    if (error || !clientSecret) {
        return (
            <div>
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error || 'Failed to load payment form.'}</div>
                <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
            </div>
        );
    }

    return (
        <Elements stripe={getStripePromise()} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
            <PaymentElementForm onAdd={onAdd} onClose={onClose} />
        </Elements>
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
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [assignMethod, setAssignMethod] = useState<PaymentMethod | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);

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

    const handleAssignToPlans = (method: PaymentMethod) => {
        setAssignMethod(method);
        setIsAssignModalOpen(true);
    };

    const handleConfirmAssign = async (scope: 'property' | 'all') => {
        if (!assignMethod) return;
        setIsAssigning(true);
        try {
            if (scope === 'property' && selectedProperty) {
                await updateSubscriptionsForProperty(selectedProperty.id, assignMethod.id);
                alert(`Subscriptions for ${selectedProperty.address} have been updated to use ${assignMethod.brand || 'payment method'} ending in ${assignMethod.last4}.`);
            } else {
                await updateAllUserSubscriptions(assignMethod.id);
                alert(`All subscriptions have been updated to use ${assignMethod.brand || 'payment method'} ending in ${assignMethod.last4}.`);
            }
        } catch (error) {
            console.error("Failed to assign payment method to plans:", error);
            alert("Could not update subscriptions. Please try again.");
        } finally {
            setIsAssigning(false);
            setIsAssignModalOpen(false);
            setAssignMethod(null);
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
                        <h2 className="text-xl font-black text-gray-900 tracking-tight">Payment Methods</h2>
                        <p className="text-gray-500 text-sm mt-1">Manage your saved cards and bank accounts.</p>
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
                                onAssignToPlans={handleAssignToPlans}
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
                title={modalStep === 'add' ? "Add Payment Method" : "Update Subscriptions?"} 
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

            <Modal
                isOpen={isAssignModalOpen}
                onClose={() => { setIsAssignModalOpen(false); setAssignMethod(null); }}
                title="Assign Payment Method to Plans"
            >
                {assignMethod && (
                    <>
                        <p className="text-gray-600 mb-6">
                            Assign <span className="font-bold">{assignMethod.brand || 'payment method'} ending in {assignMethod.last4}</span> to your active subscriptions?
                        </p>
                        <div className="space-y-3">
                            {selectedProperty && (
                                <Button className="w-full" onClick={() => handleConfirmAssign('property')} disabled={isAssigning}>
                                    {isAssigning ? 'Updating...' : `Update Plans for ${selectedProperty.address}`}
                                </Button>
                            )}
                            <Button className="w-full" variant="secondary" onClick={() => handleConfirmAssign('all')} disabled={isAssigning}>
                                {isAssigning ? 'Updating...' : 'Update Plans for All Properties'}
                            </Button>
                        </div>
                        <div className="mt-6 flex justify-end">
                            <Button type="button" variant="ghost" onClick={() => { setIsAssignModalOpen(false); setAssignMethod(null); }} disabled={isAssigning}>Cancel</Button>
                        </div>
                    </>
                )}
            </Modal>
        </div>
    );
};

export default PaymentMethods;
