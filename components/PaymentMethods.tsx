
import React, { useState, useEffect } from 'react';
import { PaymentMethod } from '../types.ts';
import { getPaymentMethods, addPaymentMethod, deletePaymentMethod, setPrimaryPaymentMethod, updateSubscriptionsForProperty, updateAllUserSubscriptions, getSubscriptions } from '../services/mockApiService.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import Modal from './Modal.tsx';
import { PlusIcon, CreditCardIcon, BanknotesIcon, TrashIcon } from './Icons.tsx';
import { useProperty } from '../PropertyContext.tsx';

const isMethodExpired = (method: PaymentMethod): boolean => {
    if (method.type !== 'Card' || !method.expiryYear || !method.expiryMonth) {
        return false;
    }
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-indexed month

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

const AddPaymentMethodForm: React.FC<{onAdd: (newMethod: PaymentMethod) => void, onClose: () => void}> = ({ onAdd, onClose }) => {
    const [type, setType] = useState<'card' | 'bank'>('card');
    const [isAdding, setIsAdding] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsAdding(true);
        try {
            let newMethod;
            if (type === 'card') {
                newMethod = await addPaymentMethod({ type: 'Card', brand: 'Visa', last4: '1234', expiryMonth: 12, expiryYear: 2028 });
            } else {
                newMethod = await addPaymentMethod({ type: 'Bank Account', last4: '5678' });
            }
            onAdd(newMethod);
        } catch (error) {
            console.error("Failed to add payment method:", error);
            alert("Could not add payment method. Please try again.");
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <div className="mb-4">
                 <div className="flex border-b">
                    <button type="button" onClick={() => setType('card')} className={`flex-1 py-2 text-center font-medium ${type === 'card' ? 'border-b-2 border-primary text-primary' : 'text-gray-500'}`}>Credit Card</button>
                    <button type="button" onClick={() => setType('bank')} className={`flex-1 py-2 text-center font-medium ${type === 'bank' ? 'border-b-2 border-primary text-primary' : 'text-gray-500'}`}>Bank Account</button>
                </div>
            </div>

            {type === 'card' ? (
                <div className="space-y-4">
                    <div>
                        <label htmlFor="cardNumber" className="block text-sm font-medium text-gray-700">Card Number</label>
                        <input type="text" id="cardNumber" placeholder="•••• •••• •••• 1234" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm" required />
                    </div>
                     <div className="flex gap-4">
                        <div className="flex-1">
                            <label htmlFor="expiry" className="block text-sm font-medium text-gray-700">Expiry Date</label>
                            <input type="text" id="expiry" placeholder="MM / YY" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm" required />
                        </div>
                        <div className="flex-1">
                            <label htmlFor="cvc" className="block text-sm font-medium text-gray-700">CVC</label>
                            <input type="text" id="cvc" placeholder="•••" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm" required />
                        </div>
                    </div>
                </div>
            ) : (
                 <div className="space-y-4">
                     <div>
                        <label htmlFor="routingNumber" className="block text-sm font-medium text-gray-700">Routing Number</label>
                        <input type="text" id="routingNumber" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm" required />
                    </div>
                     <div>
                        <label htmlFor="accountNumber" className="block text-sm font-medium text-gray-700">Account Number</label>
                        <input type="text" id="accountNumber" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm" required />
                    </div>
                </div>
            )}
            
            <p className="text-xs text-gray-500 mt-4 text-center">Your payment information is securely stored.</p>

            <div className="mt-6 flex justify-end gap-3">
                 <Button type="button" variant="secondary" onClick={onClose} disabled={isAdding}>Cancel</Button>
                 <Button type="submit" disabled={isAdding}>
                    {isAdding ? 'Adding...' : `Add ${type === 'card' ? 'Card' : 'Account'}`}
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