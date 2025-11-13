
import React, { useEffect, useState } from 'react';
import { getInvoices, getPaymentMethods, payInvoice } from '../services/mockApiService';
import { Invoice, PaymentMethod } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import Modal from './Modal';
import { ArrowDownTrayIcon, CheckCircleIcon, CreditCardIcon, BanknotesIcon } from './Icons';
import { useProperty } from '../App';

const PayInvoiceModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    invoice: Invoice;
    paymentMethods: PaymentMethod[];
}> = ({ isOpen, onClose, onSuccess, invoice, paymentMethods }) => {
    const primaryMethod = paymentMethods.find(p => p.isPrimary) || paymentMethods[0];
    const [selectedMethodId, setSelectedMethodId] = useState(primaryMethod?.id || '');
    const [isPaying, setIsPaying] = useState(false);

    useEffect(() => {
        const primary = paymentMethods.find(p => p.isPrimary) || paymentMethods[0];
        setSelectedMethodId(primary?.id || '');
    }, [paymentMethods]);

    const handlePayment = async () => {
        if (!selectedMethodId) {
            alert("Please select a payment method.");
            return;
        }
        setIsPaying(true);
        try {
            await payInvoice(invoice.id, selectedMethodId);
            onSuccess();
        } catch (error) {
            console.error("Payment failed:", error);
            alert("Payment failed. Please try again.");
        } finally {
            setIsPaying(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Pay Invoice ${invoice.id}`}>
             <div className="space-y-4">
                <p className="text-lg text-center">Amount Due: <span className="font-bold text-primary">${invoice.amount.toFixed(2)}</span></p>
                
                <h4 className="font-semibold">Select Payment Method:</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {paymentMethods.length > 0 ? paymentMethods.map(method => (
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
                    )) : (
                        <p className="text-center text-gray-500">No payment methods found. Please add one first.</p>
                    )}
                </div>

                 <div className="mt-6 flex justify-end gap-3">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={isPaying}>Cancel</Button>
                    <Button type="button" onClick={handlePayment} disabled={isPaying || paymentMethods.length === 0}>
                        {isPaying ? 'Processing...' : `Pay $${invoice.amount.toFixed(2)}`}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};


const Billing: React.FC = () => {
    const { selectedProperty } = useProperty();
    const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            const [invoicesData, methodsData] = await Promise.all([getInvoices(), getPaymentMethods()]);
            setAllInvoices(invoicesData);
            setPaymentMethods(methodsData);
        } catch (error) {
            console.error("Failed to fetch billing data:", error);
        } finally {
            setLoading(false);
        }
    };
    
    useEffect(() => {
        fetchAllData();
    }, []);
    
    const handleOpenPayModal = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setIsPaymentModalOpen(true);
    };

    const handlePaymentSuccess = () => {
        setIsPaymentModalOpen(false);
        setSelectedInvoice(null);
        // Refresh invoices list without full page reload
        getInvoices().then(setAllInvoices); 
    };

    const statusColor = {
        Paid: 'bg-green-100 text-green-800',
        Due: 'bg-yellow-100 text-yellow-800',
        Overdue: 'bg-red-100 text-red-800',
    };
    
    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    const filteredInvoices = selectedProperty
        ? allInvoices.filter(i => i.propertyId === selectedProperty.id)
        : [];

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-neutral">Billing History</h1>
            <p className="text-gray-600">
                Reviewing invoices for: <span className="font-semibold text-neutral">{selectedProperty?.address || 'No property selected'}</span>
            </p>
            <Card>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice ID</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th scope="col" className="relative px-6 py-3">
                                    <span className="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredInvoices.length > 0 ? (
                                filteredInvoices.map((invoice) => (
                                    <tr key={invoice.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{invoice.id}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.date}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${invoice.amount.toFixed(2)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor[invoice.status]}`}>
                                                {invoice.status}
                                            </span>
                                            {invoice.status === 'Paid' && invoice.paymentDate && (
                                                <div className="text-xs text-gray-500 mt-1 flex items-center">
                                                    <CheckCircleIcon className="w-4 h-4 mr-1 text-green-500" />
                                                    Paid on {invoice.paymentDate}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            {invoice.status === 'Due' || invoice.status === 'Overdue' ? (
                                                <Button size="sm" onClick={() => handleOpenPayModal(invoice)}>Pay Now</Button>
                                            ) : (
                                                <Button variant="ghost" size="sm">
                                                    <ArrowDownTrayIcon className="w-4 h-4 mr-2" /> Download
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                             ) : (
                                <tr>
                                    <td colSpan={5} className="text-center py-10 text-gray-500">
                                        No invoices found for this property.
                                    </td>
                                </tr>
                             )}
                        </tbody>
                    </table>
                </div>
            </Card>
            {isPaymentModalOpen && selectedInvoice && (
                <PayInvoiceModal
                    isOpen={isPaymentModalOpen}
                    onClose={() => setIsPaymentModalOpen(false)}
                    onSuccess={handlePaymentSuccess}
                    invoice={selectedInvoice}
                    paymentMethods={paymentMethods}
                />
            )}
        </div>
    );
};

export default Billing;