import React, { useState, useEffect, useMemo } from 'react';
import { useProperty } from '../PropertyContext.tsx';
import { getInvoices } from '../services/apiService.ts';
import { Invoice, Property } from '../types.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import PayBalanceModal from './PayBalanceModal.tsx';
import { CurrencyDollarIcon, HomeModernIcon, CheckCircleIcon } from './Icons.tsx';

interface PropertyDueInfo {
    property: Property;
    totalDue: number;
    earliestDueDate: string;
}

const MakePaymentHub: React.FC = () => {
    const { properties } = useProperty();
    const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);

    const [isPayModalOpen, setIsPayModalOpen] = useState(false);
    const [payModalPropertyId, setPayModalPropertyId] = useState<string | undefined>(undefined);

    const fetchData = async () => {
        setLoading(true);
        try {
            const invoicesData = await getInvoices();
            setAllInvoices(invoicesData);
        } catch (error) {
            console.error("Failed to fetch invoices:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const dueInvoices = useMemo(() => 
        allInvoices.filter(inv => inv.status === 'Due' || inv.status === 'Overdue'), 
    [allInvoices]);

    const dueInvoicesByProperty = useMemo(() => {
        const grouped = new Map<string, PropertyDueInfo>();
        const propertyIds = new Set(properties.map(p => p.id));

        properties.forEach(prop => {
            const propInvoices = dueInvoices.filter(inv => inv.propertyId === prop.id);
            if (propInvoices.length > 0) {
                const totalDue = propInvoices.reduce((sum, inv) => sum + inv.amount, 0);
                const earliestDueDate = propInvoices.reduce((earliest, inv) => 
                    new Date(inv.date) < new Date(earliest) ? inv.date : earliest, 
                    propInvoices[0].date
                );
                grouped.set(prop.id, {
                    property: prop,
                    totalDue,
                    earliestDueDate,
                });
            }
        });

        const unassigned = dueInvoices.filter(inv => !inv.propertyId || !propertyIds.has(inv.propertyId));
        if (unassigned.length > 0) {
            const totalDue = unassigned.reduce((sum, inv) => sum + inv.amount, 0);
            const earliestDueDate = unassigned.reduce((earliest, inv) => 
                new Date(inv.date) < new Date(earliest) ? inv.date : earliest, 
                unassigned[0].date
            );
            grouped.set('__account__', {
                property: { id: '__account__', address: 'Account-Level Charges', serviceType: 'personal' } as Property,
                totalDue,
                earliestDueDate,
            });
        }

        return Array.from(grouped.values());
    }, [dueInvoices, properties]);

    const totalOutstandingBalance = useMemo(() => 
        dueInvoicesByProperty.reduce((sum, propInfo) => sum + propInfo.totalDue, 0)
    , [dueInvoicesByProperty]);

    const handlePayClick = (propertyId?: string) => {
        setPayModalPropertyId(propertyId);
        setIsPayModalOpen(true);
    };

    const handlePaymentSuccess = () => {
        setIsPayModalOpen(false);
        fetchData(); // Refresh data after payment
    };

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div></div>;
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-base-200 pb-8">
                <div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">Make a Payment</h1>
                    <p className="text-gray-500 font-medium mt-1 text-lg">Settle your outstanding balances for one or all properties.</p>
                </div>
            </div>

            {totalOutstandingBalance > 0 ? (
                <div className="space-y-8">
                    <Card className="bg-primary/5 border-primary/10 shadow-lg">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                            <div>
                                <h3 className="font-black text-lg text-primary tracking-tight">Total Outstanding Balance</h3>
                                <p className="text-4xl font-black text-gray-900">${totalOutstandingBalance.toFixed(2)}</p>
                            </div>
                            <Button onClick={() => handlePayClick(undefined)} className="rounded-xl font-black uppercase text-xs tracking-widest h-14 px-8">
                                Pay Full Balance
                            </Button>
                        </div>
                    </Card>

                    <h2 className="text-xl font-black text-gray-900 tracking-tight">Balances by Property</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {dueInvoicesByProperty.map(info => (
                            <Card key={info.property.id} className="border-none ring-1 ring-base-200 shadow-xl">
                                <div className="flex items-center gap-3 mb-4">
                                    <HomeModernIcon className="w-5 h-5 text-gray-400" />
                                    <h3 className="text-lg font-bold text-gray-800 tracking-tight">{info.property.address}</h3>
                                </div>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-sm text-red-600 font-bold">Due by: {new Date(info.earliestDueDate).toLocaleDateString()}</p>
                                        <p className="text-3xl font-black text-neutral">${info.totalDue.toFixed(2)}</p>
                                    </div>
                                    <Button onClick={() => handlePayClick(info.property.id)} variant="secondary" className="rounded-lg">
                                        Pay Now
                                    </Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            ) : (
                <Card className="text-center py-20">
                    <CheckCircleIcon className="mx-auto h-16 w-16 text-primary" />
                    <h3 className="mt-4 text-2xl font-black text-gray-900">All Caught Up!</h3>
                    <p className="mt-2 text-sm text-gray-500">You have no outstanding balances.</p>
                </Card>
            )}

            <PayBalanceModal
                isOpen={isPayModalOpen}
                onClose={() => setIsPayModalOpen(false)}
                onSuccess={handlePaymentSuccess}
                propertyId={payModalPropertyId}
            />
        </div>
    );
};

export default MakePaymentHub;
