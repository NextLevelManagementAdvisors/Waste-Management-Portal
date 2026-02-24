import React, { useState, useEffect, useMemo } from 'react';
import Modal from './Modal.tsx';
import { Button } from './Button.tsx';
import { getInvoices, getPaymentMethods, payOutstandingBalance } from '../services/apiService.ts';
import { Invoice, PaymentMethod, View } from '../types.ts';
import { CreditCardIcon, BanknotesIcon, ArrowRightIcon } from './Icons.tsx';
import { useProperty } from '../PropertyContext.tsx';

interface PayBalanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    propertyId?: string;
}

const PayBalanceModal: React.FC<PayBalanceModalProps> = ({ isOpen, onClose, onSuccess, propertyId }) => {
    const { setCurrentView } = useProperty();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMethodId, setSelectedMethodId] = useState('');
    const [isPaying, setIsPaying] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            Promise.all([getInvoices(), getPaymentMethods()]).then(([invs, methods]) => {
                const dueInvoices = invs.filter(i => i.status === 'Due' || i.status === 'Overdue');
                const relevantInvoices = propertyId
                    ? propertyId === '__account__'
                        ? dueInvoices.filter(i => !i.propertyId)
                        : dueInvoices.filter(i => i.propertyId === propertyId)
                    : dueInvoices;
                setInvoices(relevantInvoices);
                setPaymentMethods(methods);
                const primaryMethod = methods.find(m => m.isPrimary) || methods[0];
                setSelectedMethodId(primaryMethod?.id || '');
                setLoading(false);
            });
        }
    }, [isOpen, propertyId]);

    const totalBalance = useMemo(() => invoices.reduce((sum, inv) => sum + inv.amount, 0), [invoices]);

    const handlePayment = async () => {
        if (!selectedMethodId) {
            alert("Please select a payment method.");
            return;
        }
        setIsPaying(true);
        try {
            await payOutstandingBalance(selectedMethodId, propertyId);
            onSuccess();
        } catch (error) {
            alert("Payment failed. Please try again.");
        } finally {
            setIsPaying(false);
        }
    };
    
    const navigateTo = (view: View) => {
        if (setCurrentView) {
            setCurrentView(view);
        }
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Pay Outstanding Balance">
            {loading ? (
                <div className="flex justify-center items-center h-48">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : (
                <div className="space-y-4">
                    <p className="text-lg text-center">Total Amount Due: <span className="font-bold text-primary">${totalBalance.toFixed(2)}</span></p>
                    
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2 border-t border-b py-2">
                        <h4 className="font-semibold text-neutral text-sm">Invoices to be paid:</h4>
                        {invoices.map(invoice => (
                            <div key={invoice.id} className="flex justify-between text-xs text-gray-600">
                                <span>{invoice.description || 'Monthly Service'} ({invoice.date})</span>
                                <span>${Number(invoice.amount).toFixed(2)}</span>
                            </div>
                        ))}
                    </div>

                    <h4 className="font-semibold text-neutral">Select Payment Method:</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                        {paymentMethods.length > 0 ? paymentMethods.map(method => (
                            <div 
                                key={method.id} 
                                onClick={() => setSelectedMethodId(method.id)}
                                className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${selectedMethodId === method.id ? 'border-primary ring-1 ring-primary bg-teal-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                            >
                                {method.type === 'Card' ? <CreditCardIcon className="w-6 h-6 mr-3 text-neutral" /> : <BanknotesIcon className="w-6 h-6 mr-3 text-neutral" />}
                                <div className="flex-1">
                                    <p className="font-semibold text-neutral">{method.brand ? `${method.brand} ending in ${method.last4}` : `Bank Account ending in ${method.last4}`}</p>
                                    {method.isPrimary && <p className="text-xs text-primary font-bold">Primary</p>}
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-4 bg-gray-50 rounded-lg">
                                <p className="text-sm font-bold text-gray-700">No payment methods found.</p>
                                <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => navigateTo('billing')}>
                                    Add a Payment Method <ArrowRightIcon className="w-3 h-3 ml-1"/>
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="mt-6 flex flex-col items-center gap-3">
                        <div className="flex justify-end gap-3 w-full">
                            <Button type="button" variant="secondary" onClick={onClose} disabled={isPaying}>Cancel</Button>
                            <Button type="button" onClick={handlePayment} disabled={isPaying || paymentMethods.length === 0 || totalBalance <= 0} className="px-8">
                                {isPaying ? 'Processing...' : `Pay $${totalBalance.toFixed(2)}`}
                            </Button>
                        </div>
                         <Button variant="ghost" size="sm" className="text-xs text-gray-500" onClick={() => navigateTo('billing')}>
                            View Billing Details
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default PayBalanceModal;