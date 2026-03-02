import React, { useEffect, useState, useMemo } from 'react';
import { getInvoices, getPaymentMethods, payInvoice, submitBillingDispute, getBillingDisputes } from '../services/apiService.ts';
import { Invoice, PaymentMethod } from '../types.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import Modal from './Modal.tsx';
import PayBalanceModal from './PayBalanceModal.tsx';
import { ArrowDownTrayIcon, CheckCircleIcon, CreditCardIcon, BanknotesIcon, BuildingOffice2Icon } from './Icons.tsx';
import { useLocation } from '../LocationContext.tsx';

const DISPUTE_REASONS = ['Incorrect charge', 'Duplicate charge', 'Service not received', 'Other'] as const;

const DisputeModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    invoice: Invoice;
}> = ({ isOpen, onClose, onSuccess, invoice }) => {
    const [reason, setReason] = useState<string>(DISPUTE_REASONS[0]);
    const [details, setDetails] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await submitBillingDispute({
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                amount: invoice.amount,
                reason,
                details: details.trim() || undefined,
            });
            onSuccess();
        } catch (err: any) {
            setError(err.message || 'Failed to submit dispute');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Dispute Invoice">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <p className="text-sm text-gray-600">
                        Invoice: <span className="font-bold">{invoice.invoiceNumber || invoice.id}</span> — <span className="font-black">${Number(invoice.amount).toFixed(2)}</span>
                    </p>
                </div>

                <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Reason</label>
                    <select
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                        {DISPUTE_REASONS.map(r => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Details (optional)</label>
                    <textarea
                        value={details}
                        onChange={e => setDetails(e.target.value)}
                        placeholder="Please describe the issue..."
                        rows={3}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                    />
                </div>

                {error && (
                    <p className="text-sm text-red-600 font-bold">{error}</p>
                )}

                <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
                    <Button type="submit" disabled={submitting}>
                        {submitting ? 'Submitting...' : 'Submit Dispute'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

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
        } catch (error: any) {
            console.error("Payment failed:", error);
            alert(error?.message || "Payment failed. Please try again.");
        } finally {
            setIsPaying(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Pay Invoice ${invoice.id}`}>
             <div className="space-y-4">
                <p className="text-lg text-center">Amount Due: <span className="font-bold text-primary">${Number(invoice.amount).toFixed(2)}</span></p>
                
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
                        {isPaying ? 'Processing...' : `Confirm $${Number(invoice.amount).toFixed(2)}`}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

const statusColor = {
    Paid: 'bg-green-100 text-green-800',
    Due: 'bg-yellow-100 text-yellow-800',
    Overdue: 'bg-red-100 text-red-800',
};

// Mobile-first Invoice List component
const InvoiceList: React.FC<{
    invoices: Invoice[];
    onPay: (invoice: Invoice) => void;
    onDispute?: (invoice: Invoice) => void;
    disputedInvoiceIds?: Set<string>;
}> = ({ invoices, onPay, onDispute, disputedInvoiceIds }) => {
    return (
        <div className="space-y-3">
            {invoices.map(invoice => {
                const isDisputed = disputedInvoiceIds?.has(invoice.id);
                return (
                <div key={invoice.id} className="p-4 flex flex-col gap-4 rounded-xl bg-gray-50 border border-base-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="font-bold text-neutral text-sm">{invoice.description || 'Monthly Service'}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : invoice.id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {isDisputed && (
                                <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-full bg-orange-100 text-orange-800">Disputed</span>
                            )}
                            <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-full ${statusColor[invoice.status]}`}>{invoice.status}</span>
                        </div>
                    </div>

                    <div className="flex justify-between items-end">
                         <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</p>
                            <p className="font-medium text-gray-600 text-sm">{invoice.date}</p>
                        </div>
                         <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amount</p>
                            <p className="font-black text-neutral text-lg text-right">${Number(invoice.amount).toFixed(2)}</p>
                        </div>
                    </div>

                    <div className="border-t border-base-200 -mx-4 px-4 pt-3 flex items-center gap-2">
                        {invoice.status === 'Due' || invoice.status === 'Overdue' ? (
                            <>
                                <Button size="sm" onClick={() => onPay(invoice)} className="flex-1 rounded-lg">Pay Now</Button>
                                {!isDisputed && onDispute && (
                                    <button type="button" onClick={() => onDispute(invoice)} className="text-xs font-bold text-gray-400 hover:text-orange-600 transition-colors">
                                        Dispute
                                    </button>
                                )}
                            </>
                        ) : invoice.pdfUrl ? (
                            <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-full px-4 py-2 text-sm font-bold text-primary hover:bg-gray-100 rounded-lg transition-colors">
                                <ArrowDownTrayIcon className="w-4 h-4 mr-2" /> Download PDF
                            </a>
                        ) : invoice.hostedUrl ? (
                            <a href={invoice.hostedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-full px-4 py-2 text-sm font-bold text-primary hover:bg-gray-100 rounded-lg transition-colors">
                                <ArrowDownTrayIcon className="w-4 h-4 mr-2" /> View Invoice
                            </a>
                        ) : null}
                    </div>
                </div>
                );
            })}
        </div>
    );
};


// Reusable table component for displaying invoices
const InvoiceTable: React.FC<{
    invoices: Invoice[];
    onPay: (invoice: Invoice) => void;
    onDispute?: (invoice: Invoice) => void;
    disputedInvoiceIds?: Set<string>;
}> = ({ invoices, onPay, onDispute, disputedInvoiceIds }) => {
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
                    {invoices.map((invoice) => {
                        const isDisputed = disputedInvoiceIds?.has(invoice.id);
                        return (
                        <tr key={invoice.id} className="hover:bg-gray-50/50 transition-colors group">
                            <td className="px-6 py-5 whitespace-nowrap max-w-sm">
                                <p className="text-sm font-bold text-neutral truncate">{invoice.description || 'Monthly Service'}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : invoice.id}</p>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-gray-600">{invoice.date}</td>
                            <td className="px-6 py-5 whitespace-nowrap text-sm font-black text-neutral">${Number(invoice.amount).toFixed(2)}</td>
                            <td className="px-6 py-5 whitespace-nowrap text-sm">
                                <div className="flex items-center gap-2">
                                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${statusColor[invoice.status]}`}>{invoice.status}</span>
                                    {isDisputed && (
                                        <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-full bg-orange-100 text-orange-800">Disputed</span>
                                    )}
                                </div>
                                {invoice.status === 'Paid' && invoice.paymentDate && (
                                    <div className="text-[10px] text-green-600 font-bold mt-1.5 flex items-center uppercase tracking-tighter">
                                        <CheckCircleIcon className="w-3 h-3 mr-1" />
                                        Success: {invoice.paymentDate}
                                    </div>
                                )}
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex items-center justify-end gap-3">
                                    {(invoice.status === 'Due' || invoice.status === 'Overdue') && !isDisputed && onDispute && (
                                        <button type="button" onClick={() => onDispute(invoice)} className="text-xs font-bold text-gray-400 hover:text-orange-600 transition-colors opacity-0 group-hover:opacity-100">
                                            Dispute
                                        </button>
                                    )}
                                    {invoice.status === 'Due' || invoice.status === 'Overdue' ? (
                                        <Button size="sm" onClick={() => onPay(invoice)} className="shadow-sm">Pay Now</Button>
                                    ) : invoice.pdfUrl ? (
                                        <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-1.5 text-sm font-bold text-primary hover:bg-gray-100 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                                            <ArrowDownTrayIcon className="w-4 h-4 mr-2" /> PDF
                                        </a>
                                    ) : invoice.hostedUrl ? (
                                        <a href={invoice.hostedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-1.5 text-sm font-bold text-primary hover:bg-gray-100 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                                            <ArrowDownTrayIcon className="w-4 h-4 mr-2" /> View
                                        </a>
                                    ) : null}
                                </div>
                            </td>
                        </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const Billing: React.FC = () => {
    const { selectedLocation, locations } = useLocation();
    const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isPayBalanceModalOpen, setIsPayBalanceModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [disputeInvoice, setDisputeInvoice] = useState<Invoice | null>(null);
    const [disputedInvoiceIds, setDisputedInvoiceIds] = useState<Set<string>>(new Set());

    const isAllMode = !selectedLocation && locations.length > 0;

    const fetchAllData = async () => {
        setLoading(true);
        try {
            const [invoicesData, methodsData, disputes] = await Promise.all([getInvoices(), getPaymentMethods(), getBillingDisputes()]);
            setAllInvoices(invoicesData);
            setPaymentMethods(methodsData);
            setDisputedInvoiceIds(new Set(disputes.map(d => d.invoice_id)));
        } catch (error) {
            console.error("Failed to fetch billing data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, []);

    const outstandingInvoices = useMemo(() => 
        allInvoices.filter(i => (i.status === 'Due' || i.status === 'Overdue') && (isAllMode || i.locationId === selectedLocation?.id))
    , [allInvoices, isAllMode, selectedLocation]);

    const outstandingBalance = useMemo(() => 
        outstandingInvoices.reduce((total, inv) => total + inv.amount, 0)
    , [outstandingInvoices]);

    const singleLocationInvoices = useMemo(() => {
        if (isAllMode || !selectedLocation) return [];
        return allInvoices
            .filter(i => i.locationId === selectedLocation.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [allInvoices, selectedLocation, isAllMode]);

    const groupedInvoices = useMemo(() => {
        if (!isAllMode) return [];
        return locations
            .map(location => ({
                location,
                invoices: allInvoices
                    .filter(i => i.locationId === location.id)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            }))
            .filter(group => group.invoices.length > 0)
            .sort((a, b) => a.location.address.localeCompare(b.location.address));
    }, [allInvoices, locations, isAllMode]);
    
    const handleOpenPayModal = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setIsPaymentModalOpen(true);
    };

    const handlePaymentSuccess = () => {
        setIsPaymentModalOpen(false);
        setIsPayBalanceModalOpen(false);
        setSelectedInvoice(null);
        fetchAllData();
    };

    const handleDisputeSuccess = () => {
        setDisputeInvoice(null);
        fetchAllData();
    };

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div></div>;
    }

    return (
        <div className="space-y-6">
            {outstandingBalance > 0 && (
                <Card className="bg-red-50 border-red-200 shadow-lg">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                        <div>
                            <h3 className="font-black text-lg text-red-800 tracking-tight">Outstanding Balance</h3>
                            <p className="text-3xl font-black text-red-900">${outstandingBalance.toFixed(2)}</p>
                            <p className="text-xs text-red-700 font-bold">{outstandingInvoices.length} invoice(s) are past due.</p>
                        </div>
                        <Button onClick={() => setIsPayBalanceModalOpen(true)} className="bg-red-600 hover:bg-red-700 text-white rounded-xl font-black uppercase text-xs tracking-widest h-14 px-8">Pay Total Balance</Button>
                    </div>
                </Card>
            )}

            {isAllMode ? (
                <div className="space-y-8">
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">Invoice History by Location</h2>
                    {groupedInvoices.length > 0 ? (
                        groupedInvoices.map(({ location, invoices }) => (
                            <Card key={location.id} className="overflow-hidden border-none shadow-xl p-0">
                                <div className="p-6 border-b border-base-100 bg-gray-50/50 flex items-center gap-3">
                                    <BuildingOffice2Icon className="w-5 h-5 text-primary" />
                                    <h3 className="text-lg font-bold text-gray-800 tracking-tight">{location.address}</h3>
                                </div>
                                 <div className="hidden sm:block">
                                    <InvoiceTable invoices={invoices} onPay={handleOpenPayModal} onDispute={setDisputeInvoice} disputedInvoiceIds={disputedInvoiceIds} />
                                </div>
                                <div className="block sm:hidden p-4">
                                    <InvoiceList invoices={invoices} onPay={handleOpenPayModal} onDispute={setDisputeInvoice} disputedInvoiceIds={disputedInvoiceIds} />
                                </div>
                            </Card>
                        ))
                    ) : (
                        <Card className="text-center py-20 text-gray-400 font-medium italic">
                            No billing activity found for any location.
                        </Card>
                    )}
                </div>
            ) : (
                <Card className="overflow-hidden border-none shadow-xl p-0">
                    <div className="p-6 border-b border-base-100 bg-gray-50/50">
                        <h2 className="text-xl font-black text-gray-900 tracking-tight">Invoice History</h2>
                    </div>
                    {singleLocationInvoices.length > 0 ? (
                        <>
                            <div className="hidden sm:block">
                                <InvoiceTable invoices={singleLocationInvoices} onPay={handleOpenPayModal} onDispute={setDisputeInvoice} disputedInvoiceIds={disputedInvoiceIds} />
                            </div>
                             <div className="block sm:hidden p-4">
                                <InvoiceList invoices={singleLocationInvoices} onPay={handleOpenPayModal} onDispute={setDisputeInvoice} disputedInvoiceIds={disputedInvoiceIds} />
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-20 text-gray-400 font-medium italic">
                            No billing activity found for this location.
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

            <PayBalanceModal
                isOpen={isPayBalanceModalOpen}
                onClose={() => setIsPayBalanceModalOpen(false)}
                onSuccess={handlePaymentSuccess}
            />

            {disputeInvoice && (
                <DisputeModal
                    isOpen={!!disputeInvoice}
                    onClose={() => setDisputeInvoice(null)}
                    onSuccess={handleDisputeSuccess}
                    invoice={disputeInvoice}
                />
            )}
        </div>
    );
};

export default Billing;