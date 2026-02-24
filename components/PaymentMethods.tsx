
import React, { useState, useEffect } from 'react';
import { PaymentMethod, Subscription } from '../types.ts';
import { getPaymentMethods, addPaymentMethod, deletePaymentMethod, setPrimaryPaymentMethod, updateSubscriptionsForProperty, updateAllUserSubscriptions, getSubscriptions } from '../services/apiService.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import Modal from './Modal.tsx';
import { PlusIcon, CreditCardIcon, BanknotesIcon, TrashIcon, ExclamationCircleIcon } from './Icons.tsx';
import * as stripeService from '../services/stripeService.ts';
import { useProperty } from '../PropertyContext.tsx';
import { PaymentElement, useStripe, useElements, Elements } from '@stripe/react-stripe-js';
import { getStripePromise } from './StripeProvider.tsx';
import { useToast } from './Toast.tsx';

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

const SkeletonCard: React.FC = () => (
    <div className="bg-white border border-base-200 rounded-[1.5rem] p-4 sm:p-6 lg:p-8 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                <div className="w-8 h-8 bg-gray-200 rounded" />
                <div>
                    <div className="h-5 w-40 bg-gray-200 rounded mb-2" />
                    <div className="h-4 w-24 bg-gray-100 rounded" />
                </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
                <div className="h-8 w-24 bg-gray-100 rounded-md" />
                <div className="h-8 w-20 bg-gray-100 rounded-md" />
                <div className="h-8 w-8 bg-gray-100 rounded-md" />
            </div>
        </div>
    </div>
);

const PaymentMethodCard: React.FC<{
    method: PaymentMethod;
    onDelete: (id: string) => void;
    onSetPrimary: (id: string) => void;
    onAssignToPlans: (method: PaymentMethod) => void;
    isExpired: boolean;
    isSettingPrimary: boolean;
    isDeletingId: string | null;
}> = ({ method, onDelete, onSetPrimary, onAssignToPlans, isExpired, isSettingPrimary, isDeletingId }) => {
    const isDeleting = isDeletingId === method.id;

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
                        {isExpired && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-200 text-red-800 inline-flex items-center gap-1">
                                <ExclamationCircleIcon className="w-3 h-3" />
                                Expired
                            </span>
                        )}
                    </div>
                    {method.type === 'Card' && (
                        <p className={`text-sm ${isExpired ? 'text-red-700' : 'text-gray-500'}`}>
                            Expires {method.expiryMonth}/{method.expiryYear}
                        </p>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                {!isExpired && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onAssignToPlans(method)}
                        aria-label={`Assign ${method.brand || 'bank account'} ending in ${method.last4} to plans`}
                    >
                        Assign to Plans
                    </Button>
                )}
                {!method.isPrimary && !isExpired && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSetPrimary(method.id)}
                        disabled={isSettingPrimary}
                        aria-label={`Set ${method.brand || 'bank account'} ending in ${method.last4} as primary`}
                    >
                        {isSettingPrimary ? 'Setting...' : 'Set Primary'}
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(method.id)}
                    disabled={isDeleting}
                    aria-label={`Delete ${method.brand || 'bank account'} ending in ${method.last4}`}
                >
                    {isDeleting ? (
                        <div className="w-5 h-5 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                    ) : (
                        <TrashIcon className="w-5 h-5 text-red-500" />
                    )}
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

    const loadSetupIntent = () => {
        setLoading(true);
        setError(null);
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
            .then(json => {
                if (json.data.customerId) stripeService.setCustomerId(json.data.customerId);
                setClientSecret(json.data.clientSecret);
                setLoading(false);
            })
            .catch(err => { setError(err.message || 'Failed to initialize payment form.'); setLoading(false); });
    };

    useEffect(() => { loadSetupIntent(); }, []);

    if (loading) {
        return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-4 border-primary/20 border-t-primary"></div></div>;
    }

    if (error || !clientSecret) {
        return (
            <div>
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error || 'Failed to load payment form.'}</div>
                <div className="mt-4 flex justify-end gap-3">
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                    <Button onClick={loadSetupIntent}>Try Again</Button>
                </div>
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
    isUpdating: boolean;
}> = ({ onUpdate, onClose, propertyName, isUpdating }) => (
    <>
        <p className="text-gray-600 mb-6">Would you like to update your active subscriptions with this new payment method?</p>
        <div className="space-y-3">
            <Button className="w-full" onClick={() => onUpdate('property')} disabled={isUpdating}>
                {isUpdating ? 'Updating...' : `Update Subscriptions for ${propertyName}`}
            </Button>
            <Button className="w-full" variant="secondary" onClick={() => onUpdate('all')} disabled={isUpdating}>
                {isUpdating ? 'Updating...' : 'Update Subscriptions for All Properties'}
            </Button>
        </div>
        <div className="mt-6 flex justify-end">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isUpdating}>No, Thanks</Button>
        </div>
    </>
);


const PaymentMethods: React.FC = () => {
    const { selectedProperty } = useProperty();
    const { showToast } = useToast();
    const [methods, setMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalStep, setModalStep] = useState<'add' | 'success' | 'prompt'>('add');
    const [newlyAddedMethod, setNewlyAddedMethod] = useState<PaymentMethod | null>(null);
    const [isDeleteErrorModalOpen, setIsDeleteErrorModalOpen] = useState(false);
    const [deleteBlockedSubs, setDeleteBlockedSubs] = useState<Subscription[]>([]);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [assignMethod, setAssignMethod] = useState<PaymentMethod | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [settingPrimaryId, setSettingPrimaryId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [isUpdatingSubscriptions, setIsUpdatingSubscriptions] = useState(false);

    // Delete confirmation modal state
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<PaymentMethod | null>(null);

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

    const hasExpiredMethods = methods.some(isMethodExpired);

    const handleDelete = async (id: string) => {
        const method = methods.find(m => m.id === id);
        const allSubs = await getSubscriptions();
        const linkedSubs = allSubs.filter(sub => sub.paymentMethodId === id && sub.status === 'active');

        if (linkedSubs.length > 0) {
            setDeleteBlockedSubs(linkedSubs);
            setIsDeleteErrorModalOpen(true);
            return;
        }

        // Show styled confirmation modal instead of browser confirm()
        setDeleteTarget(method || null);
        setIsDeleteConfirmOpen(true);
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleteConfirmOpen(false);
        setDeletingId(deleteTarget.id);
        try {
            await deletePaymentMethod(deleteTarget.id);
            await fetchMethods();
            showToast('success', `${deleteTarget.brand || 'Payment method'} ending in ${deleteTarget.last4} has been removed.`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            showToast('error', `Could not delete payment method: ${errorMessage}`);
        } finally {
            setDeletingId(null);
            setDeleteTarget(null);
        }
    };

    const handleSetPrimary = async (id: string) => {
        setSettingPrimaryId(id);
        try {
            await setPrimaryPaymentMethod(id);
            await fetchMethods();
            const method = methods.find(m => m.id === id);
            showToast('success', `${method?.brand || 'Payment method'} ending in ${method?.last4 || '****'} is now your primary method.`);
        } catch (error) {
            showToast('error', 'Could not set primary payment method. Please try again.');
        } finally {
            setSettingPrimaryId(null);
        }
    };

    const handleMethodAdded = (newMethod: PaymentMethod) => {
        fetchMethods();
        setNewlyAddedMethod(newMethod);
        setModalStep('success');
        // Auto-advance to subscription prompt after a brief success display
        setTimeout(() => setModalStep('prompt'), 1500);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setTimeout(() => {
            setModalStep('add');
            setIsUpdatingSubscriptions(false);
        }, 300);
    };

    const handleUpdateSubscriptions = async (scope: 'property' | 'all') => {
        if (!newlyAddedMethod || !selectedProperty) return;
        setIsUpdatingSubscriptions(true);
        try {
            if (scope === 'property') {
                await updateSubscriptionsForProperty(selectedProperty.id, newlyAddedMethod.id);
                showToast('success', `Subscriptions for ${selectedProperty.address} have been updated.`);
            } else {
                await updateAllUserSubscriptions(newlyAddedMethod.id);
                showToast('success', 'All of your subscriptions have been updated.');
            }
        } catch (error) {
            console.error("Failed to update subscriptions:", error);
            showToast('error', 'Could not update subscriptions. Please try again.');
        } finally {
            setIsUpdatingSubscriptions(false);
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
                showToast('success', `Subscriptions for ${selectedProperty.address} updated to use ${assignMethod.brand || 'payment method'} ending in ${assignMethod.last4}.`);
            } else {
                await updateAllUserSubscriptions(assignMethod.id);
                showToast('success', `All subscriptions updated to use ${assignMethod.brand || 'payment method'} ending in ${assignMethod.last4}.`);
            }
        } catch (error) {
            console.error("Failed to assign payment method to plans:", error);
            showToast('error', 'Could not update subscriptions. Please try again.');
        } finally {
            setIsAssigning(false);
            setIsAssignModalOpen(false);
            setAssignMethod(null);
        }
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <Card className="shadow-xl border-none">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 p-6 bg-gray-50/50 border-b border-base-100">
                        <div>
                            <h2 className="text-xl font-black text-gray-900 tracking-tight">Payment Methods</h2>
                            <p className="text-gray-500 text-sm mt-1">Manage your saved cards and bank accounts.</p>
                        </div>
                        <div className="h-10 w-36 bg-gray-200 rounded-md animate-pulse" />
                    </div>
                    <div className="space-y-4 p-6">
                        <SkeletonCard />
                        <SkeletonCard />
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Expired card nudge banner */}
            {hasExpiredMethods && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3" role="alert">
                    <ExclamationCircleIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-amber-800">You have an expired payment method</p>
                        <p className="text-sm text-amber-700 mt-0.5">Please add a new card or bank account to keep your services running without interruption.</p>
                    </div>
                </div>
            )}

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
                                isSettingPrimary={settingPrimaryId === method.id}
                                isDeletingId={deletingId}
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

            {/* Add Payment Method Modal */}
            <Modal
                title={modalStep === 'add' ? "Add Payment Method" : modalStep === 'success' ? "Payment Method Added" : "Update Subscriptions?"}
                isOpen={isModalOpen}
                onClose={closeModal}
            >
                {modalStep === 'add' ? (
                    <AddPaymentMethodForm onAdd={handleMethodAdded} onClose={closeModal} />
                ) : modalStep === 'success' ? (
                    <div className="flex flex-col items-center py-4">
                        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                        </div>
                        <p className="text-lg font-semibold text-gray-900">
                            {newlyAddedMethod?.brand || 'Payment method'} ending in {newlyAddedMethod?.last4 || '****'} added successfully!
                        </p>
                    </div>
                ) : (
                    <UpdateSubscriptionsPrompt
                        onUpdate={handleUpdateSubscriptions}
                        onClose={closeModal}
                        propertyName={selectedProperty?.address || ''}
                        isUpdating={isUpdatingSubscriptions}
                    />
                )}
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={isDeleteConfirmOpen}
                onClose={() => { setIsDeleteConfirmOpen(false); setDeleteTarget(null); }}
                title="Delete Payment Method"
            >
                {deleteTarget && (
                    <>
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-4">
                            {deleteTarget.type === 'Card' ? <CreditCardIcon className="w-6 h-6 text-neutral" /> : <BanknotesIcon className="w-6 h-6 text-neutral" />}
                            <div>
                                <p className="font-semibold text-neutral">
                                    {deleteTarget.brand ? `${deleteTarget.brand} ending in ${deleteTarget.last4}` : `Bank Account ending in ${deleteTarget.last4}`}
                                </p>
                                {deleteTarget.type === 'Card' && deleteTarget.expiryMonth && deleteTarget.expiryYear && (
                                    <p className="text-sm text-gray-500">Expires {deleteTarget.expiryMonth}/{deleteTarget.expiryYear}</p>
                                )}
                            </div>
                        </div>
                        <p className="text-gray-600 mb-6">Are you sure you want to remove this payment method? This action cannot be undone.</p>
                        <div className="flex justify-end gap-3">
                            <Button variant="secondary" onClick={() => { setIsDeleteConfirmOpen(false); setDeleteTarget(null); }}>Cancel</Button>
                            <Button onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete</Button>
                        </div>
                    </>
                )}
            </Modal>

            {/* Cannot Delete - In Use Modal */}
            <Modal
                isOpen={isDeleteErrorModalOpen}
                onClose={() => { setIsDeleteErrorModalOpen(false); setDeleteBlockedSubs([]); }}
                title="Cannot Delete Payment Method"
            >
                <p className="text-gray-600 mb-3">
                    This payment method is linked to {deleteBlockedSubs.length} active subscription{deleteBlockedSubs.length !== 1 ? 's' : ''}:
                </p>
                <ul className="mb-4 space-y-1">
                    {deleteBlockedSubs.map(sub => (
                        <li key={sub.id} className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                            <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                            {sub.serviceName || 'Subscription'}
                        </li>
                    ))}
                </ul>
                <p className="text-gray-600 mb-6">
                    Please assign a different payment method to these subscriptions before deleting this one.
                </p>
                <div className="flex justify-end gap-3">
                    <Button onClick={() => { setIsDeleteErrorModalOpen(false); setDeleteBlockedSubs([]); }}>
                        Okay
                    </Button>
                </div>
            </Modal>

            {/* Assign to Plans Modal */}
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
