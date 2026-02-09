
import React, { useEffect, useState, useMemo } from 'react';
import Billing from './Billing.tsx';
import PaymentMethods from './PaymentMethods.tsx';
import { View } from '../types.ts';
import { getInvoices, getSubscriptions } from '../services/mockApiService.ts';
import { useProperty } from '../PropertyContext.tsx';
import { Card } from './Card.tsx';
import { BanknotesIcon, CalendarDaysIcon } from './Icons.tsx';

const BillingHub: React.FC = () => {
    const { selectedProperty, properties } = useProperty();
    const [outstandingBalance, setOutstandingBalance] = useState(0);
    const [monthlyTotal, setMonthlyTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    const isAllMode = !selectedProperty && properties.length > 0;

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [invoices, subscriptions] = await Promise.all([getInvoices(), getSubscriptions()]);
                
                const targetInvoices = isAllMode 
                    ? invoices 
                    : invoices.filter(i => i.propertyId === selectedProperty?.id);
                const balance = targetInvoices.filter(i => i.status !== 'Paid').reduce((acc, i) => acc + i.amount, 0);
                setOutstandingBalance(balance);

                const targetSubs = isAllMode
                    ? subscriptions
                    : subscriptions.filter(s => s.propertyId === selectedProperty?.id);
                const total = targetSubs.filter(s => s.status === 'active').reduce((acc, s) => acc + s.totalPrice, 0);
                setMonthlyTotal(total);

            } catch (error) {
                console.error("Failed to fetch billing summary:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [selectedProperty, isAllMode]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Summary Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-1">
                    <div className="flex items-center gap-4">
                         <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center">
                            <BanknotesIcon className="w-6 h-6"/>
                        </div>
                        <div>
                             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Outstanding Balance</p>
                             <p className="text-3xl font-black text-gray-900 mt-1">${outstandingBalance.toFixed(2)}</p>
                        </div>
                    </div>
                </Card>
                 <Card className="md:col-span-2">
                     <div className="flex flex-col sm:flex-row justify-between items-center h-full gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-primary/5 text-primary flex items-center justify-center">
                                <CalendarDaysIcon className="w-6 h-6"/>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Next AutoPay</p>
                                <p className="text-lg font-black text-gray-900 mt-1">August 1, 2025</p>
                            </div>
                        </div>
                         <div className="text-left sm:text-right">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estimated Total</p>
                            <p className="text-lg font-black text-gray-900 mt-1">${monthlyTotal.toFixed(2)}</p>
                        </div>
                    </div>
                </Card>
            </div>
        
            {/* Payment Methods Section */}
            <div>
                <PaymentMethods setCurrentView={() => {}} />
            </div>

            {/* Invoices Section */}
            <div>
                <Billing />
            </div>
        </div>
    );
};

export default BillingHub;
