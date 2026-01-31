import React, { useEffect, useState, useMemo } from 'react';
import { getSubscriptions, getInvoices, getServiceAlerts } from '../services/mockApiService';
import { getNextPickupInfo, PickupInfo } from '../services/optimoRouteService';
import { Subscription, Invoice, ServiceAlert, View, Property } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { 
    CalendarIcon, BanknotesIcon, ListBulletIcon, 
    ClockIcon, MegaphoneIcon, XMarkIcon, 
    BuildingOffice2Icon, ExclamationTriangleIcon, 
    CalendarDaysIcon, PauseCircleIcon, ArrowRightIcon
} from './Icons';
import { useProperty } from '../App';

interface DashboardProps {
    setCurrentView: (view: View) => void;
}

const QuickAction: React.FC<{ label: string; icon: React.ReactNode; onClick: () => void }> = ({ label, icon, onClick }) => (
    <button 
        onClick={onClick}
        className="flex flex-col items-center justify-center p-6 bg-white border border-base-300 rounded-2xl hover:border-primary hover:shadow-xl hover:shadow-primary/5 transition-all group"
    >
        <div className="p-4 rounded-2xl bg-gray-50 group-hover:bg-primary/10 text-gray-400 group-hover:text-primary mb-3 transition-colors">
            {icon}
        </div>
        <span className="text-sm font-bold text-gray-700 group-hover:text-gray-900">{label}</span>
    </button>
);

const DashboardChart: React.FC<{ data: any[] }> = ({ data }) => {
    if (data.length === 0) {
        return (
            <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">No Billing History Found</p>
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
    );
};

const Dashboard: React.FC<DashboardProps> = ({ setCurrentView }) => {
    const { selectedProperty, properties } = useProperty();
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [pickupInfos, setPickupInfos] = useState<Record<string, PickupInfo | null>>({});
    const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
    const [visibleAlerts, setVisibleAlerts] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    const isAllMode = useMemo(() => !selectedProperty && properties.length > 0, [selectedProperty, properties]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [subsData, invoicesData, alertsData] = await Promise.all([
                    getSubscriptions(),
                    getInvoices(),
                    getServiceAlerts()
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
    
    const nextPickupInfo = useMemo(() => {
        const activePickups = Object.values(pickupInfos).filter((p): p is PickupInfo => !!p);
        if (activePickups.length === 0) return null;
        return [...activePickups].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
    }, [pickupInfos]);

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

    const activeSubscriptions = useMemo(() => subscriptions.filter(s => s.status === 'active'), [subscriptions]);
    const monthlyCost = useMemo(() => activeSubscriptions.reduce((acc, sub) => acc + sub.totalPrice, 0), [activeSubscriptions]);
    const unpaidInvoices = useMemo(() => invoices.filter(inv => inv.status !== 'Paid'), [invoices]);
    const totalBalance = useMemo(() => unpaidInvoices.reduce((acc, inv) => acc + inv.amount, 0), [unpaidInvoices]);
    const isToday = useMemo(() => nextPickupInfo && nextPickupInfo.date === new Date().toISOString().split('T')[0], [nextPickupInfo]);

    const dismissAlert = (alertId: string) => {
        setVisibleAlerts(current => current.filter(id => id !== alertId));
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {loading ? (
                <div className="flex justify-center items-center h-96">
                    <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div>
                </div>
            ) : (
                <>
                    <div className="bg-gray-900 rounded-[2rem] p-8 text-white relative overflow-hidden shadow-2xl">
                        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div>
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-primary/30">
                                        {isAllMode ? "Portfolio Summary" : "Property Status"}
                                    </span>
                                </div>
                                <h1 className="text-3xl md:text-5xl font-black tracking-tighter mb-2">
                                    {isToday ? "Pickup is Today!" : (nextPickupInfo ? `Next Pickup: ${new Date(nextPickupInfo.date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}` : "No Scheduled Pickup")}
                                </h1>
                                <p className="text-gray-400 font-medium text-lg">
                                    {isToday && nextPickupInfo?.eta ? `Estimated arrival around ${nextPickupInfo.eta}` : (isAllMode ? `Managing ${properties.length} locations` : `Address: ${selectedProperty?.address}`)}
                                </p>
                            </div>
                            <div className="flex items-center gap-4">
                                <Button onClick={() => setCurrentView('services')} size="lg" className="rounded-2xl px-8 shadow-xl">
                                    Upgrade Service
                                </Button>
                            </div>
                        </div>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full -mr-20 -mt-20 blur-3xl" />
                        <div className="absolute bottom-0 left-0 w-32 h-32 bg-primary/5 rounded-full -ml-10 -mb-10 blur-2xl" />
                    </div>

                    <div>
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 ml-2">Quick Actions</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <QuickAction label="Report Missed" icon={<ExclamationTriangleIcon className="w-6 h-6" />} onClick={() => setCurrentView('missed-pickup')} />
                            <QuickAction label="Special Pickup" icon={<CalendarDaysIcon className="w-6 h-6" />} onClick={() => setCurrentView('special-pickup')} />
                            <QuickAction label="Vacation Hold" icon={<PauseCircleIcon className="w-6 h-6" />} onClick={() => setCurrentView('vacation-holds')} />
                            <QuickAction label="View Invoices" icon={<BanknotesIcon className="w-6 h-6" />} onClick={() => setCurrentView('billing')} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <Card className="lg:col-span-2">
                            <div className="flex justify-between items-start mb-8">
                                <div>
                                    <h3 className="text-2xl font-black text-gray-900 tracking-tight">Spending & Billing</h3>
                                    <p className="text-sm text-gray-500">Monthly costs across {isAllMode ? "all locations" : "this property"}</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Monthly Subscriptions</span>
                                    <p className="text-3xl font-black text-primary leading-none mt-1">${monthlyCost.toFixed(2)}</p>
                                </div>
                            </div>
                            <DashboardChart data={chartData} />
                            <div className="bg-gray-50 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 border border-base-200 mt-8">
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-xl ${totalBalance > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                        <BanknotesIcon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Outstanding Balance</p>
                                        <p className="text-2xl font-black text-gray-900">${totalBalance.toFixed(2)}</p>
                                    </div>
                                </div>
                                {totalBalance > 0 ? (
                                    <Button onClick={() => setCurrentView('billing')} className="w-full md:w-auto px-8 rounded-xl">Pay Balance Now</Button>
                                ) : (
                                    <div className="flex items-center text-green-600 font-bold text-sm gap-2">
                                        <ClockIcon className="w-5 h-5" /> Account Up to Date
                                    </div>
                                )}
                            </div>
                        </Card>

                        <Card>
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-black text-gray-900 tracking-tight">Active Subscriptions</h3>
                                <button onClick={() => setCurrentView('subscriptions')} className="text-xs font-bold text-primary hover:underline">View All</button>
                            </div>
                            <div className="space-y-4">
                                {activeSubscriptions.slice(0, 3).map(sub => (
                                    <div key={sub.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-primary" />
                                            <div>
                                                <p className="text-sm font-bold text-gray-900">{sub.serviceName}</p>
                                                <p className="text-[10px] text-gray-400 font-medium">Next: {sub.nextBillingDate}</p>
                                            </div>
                                        </div>
                                        <span className="text-sm font-black text-gray-900">${sub.totalPrice.toFixed(2)}</span>
                                    </div>
                                ))}
                                {activeSubscriptions.length > 3 && (
                                    <p className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest pt-2">
                                        + {activeSubscriptions.length - 3} more services
                                    </p>
                                )}
                                {activeSubscriptions.length === 0 && (
                                    <div className="text-center py-10">
                                        <p className="text-sm text-gray-400 font-medium italic">No active services.</p>
                                        <Button onClick={() => setCurrentView('services')} variant="ghost" size="sm" className="mt-2">Start a Service <ArrowRightIcon className="w-3 h-3 ml-1"/></Button>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>
                    
                    {alerts.filter(a => visibleAlerts.includes(a.id)).length > 0 && (
                        <div>
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 ml-2">Service Notifications</h3>
                            <div className="space-y-3">
                                {alerts.filter(a => visibleAlerts.includes(a.id)).map(alert => (
                                    <div key={alert.id} className="bg-teal-50 border border-primary/20 text-primary-focus p-5 rounded-2xl shadow-sm flex justify-between items-center">
                                        <div className="flex items-center">
                                            <MegaphoneIcon className="w-5 h-5 mr-4 text-primary" />
                                            <p className="font-bold text-sm">{alert.message}</p>
                                        </div>
                                        <button onClick={() => dismissAlert(alert.id)} className="p-1.5 rounded-full hover:bg-teal-100 transition-colors">
                                            <XMarkIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default Dashboard;