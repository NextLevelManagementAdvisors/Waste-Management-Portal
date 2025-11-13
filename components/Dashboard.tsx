
import React, { useEffect, useState } from 'react';
import { getSubscriptions, getInvoices, getServiceAlerts } from '../services/mockApiService';
import { getNextPickupInfo, PickupInfo } from '../services/optimoRouteService';
import { Subscription, Invoice, ServiceAlert } from '../types';
import { Card } from './Card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CalendarIcon, BanknotesIcon, ListBulletIcon, ClockIcon, MegaphoneIcon, XMarkIcon } from './Icons';
import { useProperty } from '../App';

const Dashboard: React.FC = () => {
    const { user, selectedProperty } = useProperty();
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [pickupInfo, setPickupInfo] = useState<PickupInfo | null>(null);
    const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
    const [visibleAlerts, setVisibleAlerts] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (!selectedProperty) return;
            setLoading(true);
            setPickupInfo(null);
            try {
                const [subsData, invoicesData, pickupData, alertsData] = await Promise.all([
                    getSubscriptions(),
                    getInvoices(),
                    getNextPickupInfo(selectedProperty.address),
                    getServiceAlerts()
                ]);
                setSubscriptions(subsData.filter(s => s.propertyId === selectedProperty.id));
                setInvoices(invoicesData.filter(i => i.propertyId === selectedProperty.id));
                setPickupInfo(pickupData);
                setAlerts(alertsData);
                setVisibleAlerts(alertsData.map(a => a.id));
            } catch (error) {
                console.error("Failed to fetch dashboard data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [selectedProperty]);
    
    const dismissAlert = (alertId: string) => {
        setVisibleAlerts(current => current.filter(id => id !== alertId));
    };

    const formatPickupDate = (dateString: string): string => {
        // Adjust for timezone differences by parsing as UTC
        const date = new Date(dateString + 'T00:00:00Z');
        return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    };

    const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
    const monthlyCost = activeSubscriptions.reduce((acc, sub) => acc + sub.totalPrice, 0);
    const nextBillingDate = activeSubscriptions.length > 0 ? activeSubscriptions[0].nextBillingDate : 'N/A';

    const chartData = invoices
        .filter(inv => inv.status === 'Paid')
        .slice()
        .reverse()
        .map(inv => ({
            name: new Date(inv.date).toLocaleString('default', { month: 'short' }),
            amount: inv.amount
        }));
    
    const isToday = pickupInfo && pickupInfo.date === new Date().toISOString().split('T')[0];

    if (!selectedProperty) {
        return <div className="text-center p-8">Please select a property to view the dashboard.</div>
    }

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    return (
        <div className="space-y-6">
             {alerts.filter(a => visibleAlerts.includes(a.id)).map(alert => (
                <div key={alert.id} className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 rounded-md shadow-sm flex justify-between items-center" role="alert">
                    <div className="flex items-center">
                        <MegaphoneIcon className="w-6 h-6 mr-3" />
                        <p className="font-medium">{alert.message}</p>
                    </div>
                    <button onClick={() => dismissAlert(alert.id)} className="p-1 rounded-full hover:bg-blue-200">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
            ))}
            <h1 className="text-3xl font-bold text-neutral">Welcome back, {user?.firstName}!</h1>
            <p className="text-gray-600">Showing overview for <span className="font-semibold text-neutral">{selectedProperty.address}</span></p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card>
                    <div className="flex items-center space-x-4">
                        <div className="bg-secondary p-3 rounded-full">
                           {isToday ? (
                                <ClockIcon className="w-8 h-8 text-secondary-content" />
                           ) : (
                                <CalendarIcon className="w-8 h-8 text-secondary-content" />
                           )}
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-neutral">Next Pickup</h3>
                            {pickupInfo ? (
                                <>
                                    <p className="text-2xl font-bold text-primary">
                                        {isToday && pickupInfo.eta ? `Arriving ~${pickupInfo.eta}` : formatPickupDate(pickupInfo.date)}
                                    </p>
                                    {pickupInfo.timeWindow && !isToday && (
                                        <p className="text-sm text-gray-600">
                                            Between {pickupInfo.timeWindow.start} - {pickupInfo.timeWindow.end}
                                        </p>
                                    )}
                                </>
                            ) : (
                                 <p className="text-2xl font-bold text-primary">Not Scheduled</p>
                            )}
                            <p className="text-sm text-gray-500 mt-1">Powered by OptimoRoute</p>
                        </div>
                    </div>
                </Card>
                 <Card>
                    <div className="flex items-center space-x-4">
                        <div className="bg-secondary p-3 rounded-full">
                           <BanknotesIcon className="w-8 h-8 text-secondary-content" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-neutral">Monthly Total</h3>
                            <p className="text-2xl font-bold text-primary">${monthlyCost.toFixed(2)}</p>
                            <p className="text-sm text-gray-500">Next bill: {nextBillingDate}</p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="flex items-center space-x-4">
                        <div className="bg-secondary p-3 rounded-full">
                           <ListBulletIcon className="w-8 h-8 text-secondary-content" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-neutral">Active Services</h3>
                            <p className="text-2xl font-bold text-primary">{activeSubscriptions.length}</p>
                            <p className="text-sm text-gray-500">for this property</p>
                        </div>
                    </div>
                </Card>
            </div>
            
            <Card>
                <h3 className="text-xl font-semibold text-neutral mb-4">Billing History (Last 6 Months)</h3>
                 {chartData.length > 0 ? (
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #ddd' }} />
                                <Legend />
                                <Line type="monotone" dataKey="amount" stroke="#0D9488" strokeWidth={2} activeDot={{ r: 8 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                 ) : (
                     <div className="text-center py-12 text-gray-500">
                         No paid invoices for this property yet.
                     </div>
                 )}
            </Card>

        </div>
    );
};

export default Dashboard;
