
import React, { useEffect, useState, useMemo } from 'react';
import { getInvoices, getPaymentMethods, payInvoice } from '../services/mockApiService.ts';
import { Invoice, PaymentMethod } from '../types.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import Modal from './Modal.tsx';
import { ArrowDownTrayIcon, CheckCircleIcon, CreditCardIcon, BanknotesIcon, BuildingOffice2Icon } from './Icons.tsx';
import { useProperty } from '../PropertyContext.tsx';

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
                            <input
                                type="radio"
                                name="paymentMethod"
                                value={method.id}
                                checked={selectedMethodId === method.id}
                                readOnly
                                className="h-4 w-4 text-primary focus:ring-primary border-gray-300"
                            />
                        </div>
                    )) : (
                        <p className="text-center text-gray-500">No payment methods found. Please add one first.</p>
                    )}
                </div>

                 <div className="mt-6 flex justify-end gap-3">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={isPaying}>Cancel</Button>
                    <Button type="button" onClick={handlePayment} disabled={isPaying || paymentMethods.length === 0} className="px-8">
                        {isPaying ? 'Processing...' : `Confirm $${invoice.amount.toFixed(2)}`}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

// Reusable table component for displaying invoices
const InvoiceTable: React.FC<{ 
    invoices: Invoice[];
    onPay: (invoice: Invoice) => void;
}> = ({ invoices, onPay }) => {
    const statusColor = {
        Paid: 'bg-green-100 text-green-800',
        Due: 'bg-yellow-100 text-yellow-800',
        Overdue: 'bg-red-100 text-red-800',
    };

    return (
         <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50/50">
                    <tr>
                        <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Description</th>
                        <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Date</th>
                        <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Amount</th>
                        <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Status</th>
                        <th scope="col" className="relative px-6 py-4"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                    {invoices.map((invoice) => (
                        <tr key={invoice.id} className="hover:bg-gray-50/50 transition-colors group">
                            <td className="px-6 py-5 whitespace-nowrap max-w-sm">
                                <p className="text-sm font-bold text-neutral truncate">{invoice.description || 'Monthly Service'}</p>
                                <p className="text-xs text-gray-400 mt-0.5">ID: {invoice.id}</p>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-gray-600">{invoice.date}</td>
                            <td className="px-6 py-5 whitespace-nowrap text-sm font-black text-neutral">${invoice.amount.toFixed(2)}</td>
                            <td className="px-6 py-5 whitespace-nowrap text-sm">
                                <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${statusColor[invoice.status]}`}>{invoice.status}</span>
                                {invoice.status === 'Paid' && invoice.paymentDate && (
                                    <div className="text-[10px] text-green-600 font-bold mt-1.5 flex items-center uppercase tracking-tighter">
                                        <CheckCircleIcon className="w-3 h-3 mr-1" />
                                        Success: {invoice.paymentDate}
                                    </div>
                                )}
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-medium">
                                {invoice.status === 'Due' || invoice.status === 'Overdue' ? (
                                    <Button size="sm" onClick={() => onPay(invoice)} className="shadow-sm">Pay Now</Button>
                                ) : (
                                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <ArrowDownTrayIcon className="w-4 h-4 mr-2" /> Download
                                    </Button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const Billing: React.FC = () => {
    const { selectedProperty, properties } = useProperty();
    const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

    const isAllMode = !selectedProperty && properties.length > 0;

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

    const singlePropertyInvoices = useMemo(() => {
        if (isAllMode || !selectedProperty) return [];
        return allInvoices
            .filter(i => i.propertyId === selectedProperty.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [allInvoices, selectedProperty, isAllMode]);

    const groupedInvoices = useMemo(() => {
        if (!isAllMode) return [];
        return properties
            .map(property => ({
                property,
                invoices: allInvoices
                    .filter(i => i.propertyId === property.id)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            }))
            .filter(group => group.invoices.length > 0)
            .sort((a, b) => a.property.address.localeCompare(b.property.address));
    }, [allInvoices, properties, isAllMode]);
    
    const handleOpenPayModal = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setIsPaymentModalOpen(true);
    };

    const handlePaymentSuccess = () => {
        setIsPaymentModalOpen(false);
        setSelectedInvoice(null);
        getInvoices().then(setAllInvoices); 
    };

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div></div>;
    }

    return (
        <div className="space-y-6">
            {isAllMode ? (
                <div className="space-y-8">
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">Invoice History by Property</h2>
                    {groupedInvoices.length > 0 ? (
                        groupedInvoices.map(({ property, invoices }) => (
                            <Card key={property.id} className="overflow-hidden border-none shadow-xl p-0">
                                <div className="p-6 border-b border-base-100 bg-gray-50/50 flex items-center gap-3">
                                    <BuildingOffice2Icon className="w-5 h-5 text-primary" />
                                    <h3 className="text-lg font-bold text-gray-800 tracking-tight">{property.address}</h3>
                                </div>
                                <InvoiceTable invoices={invoices} onPay={handleOpenPayModal} />
                            </Card>
                        ))
                    ) : (
                        <Card className="text-center py-20 text-gray-400 font-medium italic">
                            No billing activity found for any property.
                        </Card>
                    )}
                </div>
            ) : (
                <Card className="overflow-hidden border-none shadow-xl p-0">
                    <div className="p-6 border-b border-base-100 bg-gray-50/50">
                        <h2 className="text-xl font-black text-gray-900 tracking-tight">Invoice History</h2>
                    </div>
                    {singlePropertyInvoices.length > 0 ? (
                        <InvoiceTable invoices={singlePropertyInvoices} onPay={handleOpenPayModal} />
                    ) : (
                        <div className="text-center py-20 text-gray-400 font-medium italic">
                            No billing activity found for this property.
                        </div>
                    )}
                </Card>
            )}

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
