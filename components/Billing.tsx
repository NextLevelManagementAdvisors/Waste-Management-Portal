
import React, { useEffect, useState } from 'react';
import { getInvoices } from '../services/mockApiService';
import { Invoice } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import { ArrowDownTrayIcon } from './Icons';
import { useProperty } from '../App';

const Billing: React.FC = () => {
    const { selectedProperty } = useProperty();
    const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchInvoices = async () => {
            setLoading(true);
            const data = await getInvoices();
            setAllInvoices(data);
            setLoading(false);
        };
        fetchInvoices();
    }, []);

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
                                    <span className="sr-only">Download</span>
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
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <Button variant="ghost" size="sm">
                                               <ArrowDownTrayIcon className="w-4 h-4 mr-2" /> Download
                                            </Button>
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
        </div>
    );
};

export default Billing;
