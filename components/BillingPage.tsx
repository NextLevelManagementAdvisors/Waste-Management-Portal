import React, { useState, useEffect, useMemo } from 'react';
import { useProperty } from '../PropertyContext.tsx';
import { getInvoices, getSubscriptions, getPaymentMethods } from '../services/apiService.ts';
import { Invoice, Subscription, PaymentMethod } from '../types.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import PayBalanceModal from './PayBalanceModal.tsx';
import Billing from './Billing.tsx';
import Subscriptions from './Subscriptions.tsx';
import PaymentMethodsPanel from './PaymentMethods.tsx';
import {
    ChartPieIcon, ClipboardDocumentIcon, BanknotesIcon, CreditCardIcon,
    CheckCircleIcon, ArrowRightIcon, CalendarDaysIcon
} from './Icons.tsx';

type BillingTab = 'overview' | 'invoices' | 'subscriptions' | 'payment-methods';

const TABS: { id: BillingTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <ChartPieIcon className="w-5 h-5" /> },
    { id: 'invoices', label: 'Invoices', icon: <ClipboardDocumentIcon className="w-5 h-5" /> },
    { id: 'subscriptions', label: 'Subscriptions', icon: <BanknotesIcon className="w-5 h-5" /> },
    { id: 'payment-methods', label: 'Payment Methods', icon: <CreditCardIcon className="w-5 h-5" /> },
];

const Tab: React.FC<{
    id: BillingTab;
    label: string;
    icon: React.ReactNode;
    activeTab: BillingTab;
    onClick: (id: BillingTab) => void;
}> = ({ id, label, icon, activeTab, onClick }) => (
    <button
        onClick={() => onClick(id)}
        className={`group inline-flex flex-shrink-0 items-center justify-center sm:justify-start gap-2 whitespace-nowrap py-4 px-3 sm:px-4 border-b-2 font-medium transition-colors text-sm
            ${activeTab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
        aria-label={label}
    >
        {icon}
        <span className="font-bold hidden sm:inline">{label}</span>
    </button>
);

const statusColor: Record<string, string> = {
    Paid: 'bg-green-100 text-green-800',
    Due: 'bg-yellow-100 text-yellow-800',
    Overdue: 'bg-red-100 text-red-800',
};

const BillingPage: React.FC = () => {
    const { selectedProperty, properties } = useProperty();
    const [activeTab, setActiveTab] = useState<BillingTab>('overview');

    // Overview data
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [isPayBalanceModalOpen, setIsPayBalanceModalOpen] = useState(false);

    const isAllMode = !selectedProperty && properties.length > 0;

    useEffect(() => {
        if (activeTab !== 'overview') return;
        setLoading(true);
        Promise.all([getInvoices(), getSubscriptions(), getPaymentMethods()])
            .then(([inv, subs, methods]) => {
                setInvoices(inv);
                setSubscriptions(subs);
                setPaymentMethods(methods);
            })
            .catch(err => console.error('Failed to fetch billing overview:', err))
            .finally(() => setLoading(false));
    }, [activeTab]);

    const filteredInvoices = useMemo(() => {
        if (isAllMode) return invoices;
        return invoices.filter(i => i.propertyId === selectedProperty?.id);
    }, [invoices, isAllMode, selectedProperty]);

    const outstandingInvoices = useMemo(() =>
        filteredInvoices.filter(i => i.status === 'Due' || i.status === 'Overdue'),
    [filteredInvoices]);

    const outstandingBalance = useMemo(() =>
        outstandingInvoices.reduce((sum, inv) => sum + inv.amount, 0),
    [outstandingInvoices]);

    const activeSubscriptions = useMemo(() => {
        const subs = subscriptions.filter(s => s.status === 'active' || s.status === 'paused');
        if (isAllMode) return subs;
        return subs.filter(s => s.propertyId === selectedProperty?.id);
    }, [subscriptions, isAllMode, selectedProperty]);

    const totalMonthlyCost = useMemo(() =>
        activeSubscriptions.reduce((sum, s) => sum + Number(s.totalPrice || s.price || 0), 0),
    [activeSubscriptions]);

    const nextBillingDate = useMemo(() => {
        const activeSubs = activeSubscriptions.filter(s => s.status === 'active' && s.nextBillingDate);
        if (activeSubs.length === 0) return null;
        return activeSubs.reduce((earliest, s) =>
            new Date(s.nextBillingDate) < new Date(earliest.nextBillingDate) ? s : earliest
        );
    }, [activeSubscriptions]);

    const primaryMethod = useMemo(() =>
        paymentMethods.find(m => m.isPrimary) || paymentMethods[0] || null,
    [paymentMethods]);

    const recentInvoices = useMemo(() =>
        [...filteredInvoices]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5),
    [filteredInvoices]);

    const handlePaymentSuccess = () => {
        setIsPayBalanceModalOpen(false);
        // Re-fetch overview data
        Promise.all([getInvoices(), getSubscriptions(), getPaymentMethods()])
            .then(([inv, subs, methods]) => {
                setInvoices(inv);
                setSubscriptions(subs);
                setPaymentMethods(methods);
            });
    };

    const renderOverview = () => {
        if (loading) {
            return (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary"></div>
                </div>
            );
        }

        return (
            <div className="p-4 sm:p-6 lg:p-8 space-y-8">
                {/* Outstanding Balance */}
                {outstandingBalance > 0 ? (
                    <Card className="bg-red-50 border-red-200">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                            <div>
                                <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">Outstanding Balance</p>
                                <p className="text-4xl font-black text-red-900">${outstandingBalance.toFixed(2)}</p>
                                <p className="text-xs text-red-700 font-bold mt-1">{outstandingInvoices.length} invoice{outstandingInvoices.length !== 1 ? 's' : ''} need attention</p>
                            </div>
                            <Button onClick={() => setIsPayBalanceModalOpen(true)} className="bg-red-600 hover:bg-red-700 text-white rounded-xl font-black uppercase text-xs tracking-widest h-14 px-8">
                                Pay Now
                            </Button>
                        </div>
                    </Card>
                ) : (
                    <Card className="bg-primary/5 border-primary/10">
                        <div className="flex items-center gap-4">
                            <CheckCircleIcon className="w-10 h-10 text-primary flex-shrink-0" />
                            <div>
                                <p className="font-black text-gray-900 text-lg">All Caught Up!</p>
                                <p className="text-sm text-gray-500">You have no outstanding balance.</p>
                            </div>
                        </div>
                    </Card>
                )}

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setActiveTab('subscriptions')}>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Active Subscriptions</p>
                        <p className="text-3xl font-black text-gray-900 mt-1">{activeSubscriptions.length}</p>
                        <p className="text-sm text-gray-500 mt-1">${totalMonthlyCost.toFixed(2)}/mo</p>
                    </Card>

                    <Card>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Next Payment</p>
                        {nextBillingDate ? (
                            <>
                                <p className="text-xl font-black text-gray-900 mt-1 flex items-center gap-2">
                                    <CalendarDaysIcon className="w-5 h-5 text-gray-400" />
                                    {nextBillingDate.nextBillingDate}
                                </p>
                                <p className="text-sm text-gray-500 mt-1">${Number(nextBillingDate.totalPrice || nextBillingDate.price || 0).toFixed(2)}</p>
                            </>
                        ) : (
                            <p className="text-sm text-gray-500 mt-2">No upcoming payments</p>
                        )}
                    </Card>

                    <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setActiveTab('payment-methods')}>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment Method</p>
                        {primaryMethod ? (
                            <>
                                <p className="text-lg font-black text-gray-900 mt-1">
                                    {primaryMethod.brand || 'Bank Account'} ****{primaryMethod.last4}
                                </p>
                                <p className="text-sm text-primary font-bold mt-1 flex items-center gap-1">
                                    Manage <ArrowRightIcon className="w-3 h-3" />
                                </p>
                            </>
                        ) : (
                            <p className="text-sm text-gray-500 mt-2">No payment method saved</p>
                        )}
                    </Card>
                </div>

                {/* Recent Invoices */}
                {recentInvoices.length > 0 && (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Recent Invoices</h3>
                            <Button variant="ghost" size="sm" onClick={() => setActiveTab('invoices')} className="text-xs font-bold">
                                View All <ArrowRightIcon className="w-3 h-3 ml-1" />
                            </Button>
                        </div>
                        <Card className="overflow-hidden p-0">
                            <div className="divide-y divide-gray-100">
                                {recentInvoices.map(invoice => (
                                    <div key={invoice.id} className="flex items-center justify-between px-4 sm:px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-900 truncate">{invoice.description || 'Monthly Service'}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">{invoice.date}</p>
                                        </div>
                                        <div className="flex items-center gap-3 ml-4">
                                            <span className="text-sm font-black text-gray-900">${Number(invoice.amount).toFixed(2)}</span>
                                            <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-full ${statusColor[invoice.status] || 'bg-gray-100 text-gray-600'}`}>
                                                {invoice.status}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>
                )}

                <PayBalanceModal
                    isOpen={isPayBalanceModalOpen}
                    onClose={() => setIsPayBalanceModalOpen(false)}
                    onSuccess={handlePaymentSuccess}
                />
            </div>
        );
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'overview':
                return renderOverview();
            case 'invoices':
                return (
                    <div className="p-4 sm:p-6 lg:p-8">
                        <Billing />
                    </div>
                );
            case 'subscriptions':
                return (
                    <div className="p-4 sm:p-6 lg:p-8">
                        <Subscriptions />
                    </div>
                );
            case 'payment-methods':
                return (
                    <div className="p-4 sm:p-6 lg:p-8">
                        <PaymentMethodsPanel />
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="animate-in fade-in duration-500">
            <style>{`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
            <div className="bg-white rounded-[1.5rem] shadow-lg">
                <nav className="flex items-center justify-around sm:justify-start sm:gap-2 border-b border-base-200 px-2 sm:px-6 overflow-x-auto no-scrollbar">
                    {TABS.map(tab => (
                        <Tab
                            key={tab.id}
                            id={tab.id}
                            label={tab.label}
                            icon={tab.icon}
                            activeTab={activeTab}
                            onClick={setActiveTab}
                        />
                    ))}
                </nav>
                <div>
                    {renderTabContent()}
                </div>
            </div>
        </div>
    );
};

export default BillingPage;
