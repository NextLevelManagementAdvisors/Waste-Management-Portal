import React, { useEffect, useState, useMemo } from 'react';
import { getSubscriptions, getInvoices, getServiceAlerts, getPaymentMethods } from '../services/mockApiService';
import { getNextPickupInfo, PickupInfo } from '../services/optimoRouteService';
import { Subscription, Invoice, ServiceAlert, PaymentMethod, View, Property } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CalendarIcon, BanknotesIcon, ListBulletIcon, ClockIcon, MegaphoneIcon, XMarkIcon, BuildingOffice2Icon } from './Icons';
import { useProperty } from '../App';

interface DashboardProps {
    setCurrentView: (view: View) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ setCurrentView }) => {
    const { user, selectedProperty, properties } = useProperty();
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [pickupInfos, setPickupInfos] = useState<Record<string, PickupInfo | null>>({});
    const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
    const [visibleAlerts, setVisibleAlerts] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    const isAllMode = !selectedProperty && properties.length > 0;

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [subsData, invoicesData, alertsData, methodsData] = await Promise.all([
                    getSubscriptions(),
                    getInvoices(),
                    getServiceAlerts(),
                    getPaymentMethods()
                ]);

                if (isAllMode) {
                    setSubscriptions(subsData);
                    setInvoices(invoicesData);
                } else if (selectedProperty) {
                    setSubscriptions(subsData.filter(s => s.propertyId === selectedProperty.id));
                    setInvoices(invoicesData.filter(i => i.propertyId === selectedProperty.id));
                }

                const activeProps = isAllMode ? properties : (selectedProperty ? [selectedProperty] : []);
                const pickupResults: Record<string, PickupInfo | null> = {};
                await Promise.all(activeProps.map(async p => {
                    pickupResults[p.id] = await getNextPickupInfo(p.address);
                }));

                setPickupInfos(pickupResults);
                setAlerts(alertsData);
                setVisibleAlerts(alertsData.map(a => a.id));
            } catch (error) {
                console.error("Dashboard fetch error:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [selectedProperty, properties, isAllMode]);
    
    const dismissAlert = (alertId: string) => {
        setVisibleAlerts(current => current.filter(id => id !== alertId));
    };

    const nextPickupInfo = useMemo(() => {
        const activePickups = Object.values(pickupInfos).filter((p): p is PickupInfo => !!p);
        if (activePickups.length === 0) return null;
        return activePickups.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
    }, [pickupInfos]);

    const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
    const monthlyCost = activeSubscriptions.reduce((acc, sub) => acc + sub.totalPrice, 0);

    const chartData = useMemo(() => {
        const paid = invoices.filter(inv => inv.status === 'Paid');
        const grouped: Record<string, number> = {};
        paid.forEach(inv => {
            const date = new Date(inv.date);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            grouped[key] = (grouped[key] || 0) + inv.amount;
        });

        return Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-6)
            .map(([key, amount]) => {
                const [year, month] = key.split('-');
                return {
                    name: new Date(Number(year), Number(month) - 1).toLocaleString('default', { month: 'short' }),
                    amount: amount
                };
            });
    }, [invoices]);
    
    const isToday = nextPickupInfo && nextPickupInfo.date === new Date().toISOString().split('T')[0];

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
             {alerts.filter(a => visibleAlerts.includes(a.id)).map(alert => (
                <div key={alert.id} className="bg-teal-50 border-l-4 border-primary text-primary-focus p-4 rounded-r-lg shadow-sm flex justify-between items-center" role="alert">
                    <div className="flex items-center">
                        <MegaphoneIcon className="w-6 h-6 mr-3 text-primary" />
                        <p className="font-semibold">{alert.message}</p>
                    </div>
                    <button onClick={() => dismissAlert(alert.id)} className="p-1 rounded-full hover:bg-teal-100 transition-colors">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
            ))}

            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 border-b-2 border-base-200 pb-4">
                <div>
                    <h1 className="text-4xl font-black text-neutral tracking-tight">
                        {isAllMode ? "Portfolio Summary" : "Property Overview"}
                    </h1>
                    <p className="text-gray-500 text-lg font-medium mt-1">
                        {isAllMode 
                            ? `Aggregated data for your ${properties.length} residential properties.` 
                            : `Managing: ${selectedProperty?.address}`}
                    </p>
                </div>
                {isAllMode && (
                    <div className="bg-primary text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-primary-focus flex items-center gap-2 shadow-lg shadow-teal-900/10">
                         <BuildingOffice2Icon className="w-3.5 h-3.5" /> Consolidated Account
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {/* Portfolio Aggregate Card */}
                 <Card className={`${isAllMode ? 'bg-primary text-white border-none shadow-xl shadow-teal-900/20' : 'bg-white border-base-300'} transition-all duration-500 overflow-hidden relative`}>
                    <div className="flex items-center space-x-4 relative z-10">
                        <div className={`${isAllMode ? 'bg-white/20' : 'bg-primary/10'} p-4 rounded-2xl`}>
                           <BanknotesIcon className={`w-8 h-8 ${isAllMode ? 'text-white' : 'text-primary'}`} />
                        </div>
                        <div>
                            <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${isAllMode ? 'text-teal-100' : 'text-gray-400'}`}>
                                {isAllMode ? 'Portfolio Monthly' : 'Property Monthly'}
                            </h3>
                            <p className={`text-4xl font-black mt-1 ${isAllMode ? 'text-white' : 'text-neutral'}`}>
                                ${monthlyCost.toFixed(2)}
                            </p>
                            <p className={`text-[9px] font-black mt-1.5 uppercase tracking-widest flex items-center gap-1.5 ${isAllMode ? 'text-teal-200' : 'text-primary'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isAllMode ? 'bg-teal-200' : 'bg-primary'} animate-pulse`} />
                                {activeSubscriptions.length} Active Services
                            </p>
                        </div>
                    </div>
                    {isAllMode && <BuildingOffice2Icon className="absolute -right-4 -bottom-4 w-32 h-32 text-white opacity-5" />}
                </Card>

                <Card className="hover:shadow-md transition-shadow duration-300">
                    <div className="flex items-center space-x-4">
                        <div className="bg-primary/10 p-4 rounded-2xl">
                           {isToday ? (
                                <ClockIcon className="w-8 h-8 text-primary animate-pulse" />
                           ) : (
                                <CalendarIcon className="w-8 h-8 text-primary" />
                           )}
                        </div>
                        <div>
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Soonest Pickup</h3>
                            {nextPickupInfo ? (
                                <>
                                    <p className="text-2xl font-black text-neutral uppercase">
                                        {isToday && nextPickupInfo.eta ? `~ ${nextPickupInfo.eta}` : new Date(nextPickupInfo.date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}
                                    </p>
                                    <p className="text-[9px] text-primary font-black mt-1 uppercase tracking-tighter">Next Scheduled Route</p>
                                </>
                            ) : (
                                 <p className="text-2xl font-black text-gray-300">Not Scheduled</p>
                            )}
                        </div>
                    </div>
                </Card>
               
                <Card className="hover:shadow-md transition-shadow duration-300">
                    <div className="flex items-center space-x-4">
                        <div className="bg-primary/10 p-4 rounded-2xl">
                           <ListBulletIcon className="w-8 h-8 text-primary" />
                        </div>
                        <div>
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Active Locations</h3>
                            <p className="text-3xl font-black text-neutral">{isAllMode ? properties.length : '1'}</p>
                            <p className="text-[9px] text-primary font-black mt-1 uppercase tracking-tighter">{isAllMode ? 'Total Managed' : 'Active Property'}</p>
                        </div>
                    </div>
                </Card>
            </div>
            
            <div className="grid grid-cols-1 gap-6">
                <Card>
                    <div className="flex justify-between items-center mb-10">
                        <div>
                            <h3 className="text-2xl font-black text-neutral tracking-tight">Spending Trend</h3>
                            <p className="text-sm text-gray-500">{isAllMode ? "Portfolio-wide" : "Local property"} spending history</p>
                        </div>
                        <div className="text-right">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Avg Monthly</span>
                            <p className="text-2xl font-black text-primary leading-none mt-1">${(chartData.reduce((s, d) => s + d.amount, 0) / (chartData.length || 1)).toFixed(2)}</p>
                        </div>
                    </div>
                    {chartData.length > 0 ? (
                        <div style={{ width: '100%', height: 320 }}>
                            <ResponsiveContainer>
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#0D9488" stopOpacity={0.1}/>
                                            <stop offset="95%" stopColor="#0D9488" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 10, fontWeight: 800}} />
                                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 10, fontWeight: 800}} tickFormatter={(val) => `$${val}`} />
                                    <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '16px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)' }} itemStyle={{ color: '#0D9488', fontWeight: 900 }} />
                                    <Area type="monotone" dataKey="amount" stroke="#0D9488" strokeWidth={4} fillOpacity={1} fill="url(#colorAmount)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">No Billing History Found</p>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default Dashboard;