import React, { useState, useEffect } from 'react';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { UsersIcon, BuildingOffice2Icon, ChartPieIcon, ArrowRightIcon, MagnifyingGlassIcon, ClockIcon } from './Icons.tsx';

interface AdminStats {
  totalUsers: number;
  totalProperties: number;
  recentUsers: number;
  activeTransfers: number;
  totalReferrals: number;
  pendingReferrals: number;
  revenue: number;
  activeSubscriptions: number;
  openInvoices: number;
}

interface CustomerListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  memberSince: string;
  stripeCustomerId: string | null;
  isAdmin: boolean;
  createdAt: string;
}

interface CustomerDetail {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  memberSince: string;
  stripeCustomerId: string | null;
  isAdmin: boolean;
  createdAt: string;
  properties: { id: string; address: string; serviceType: string; transferStatus: string | null }[];
  stripe: {
    balance: number;
    subscriptions: { id: string; status: string; currentPeriodEnd: string; items: { productName: string; amount: number; interval: string }[] }[];
    invoices: { id: string; number: string; amount: number; status: string; created: string }[];
    paymentMethods: { id: string; brand: string; last4: string; expMonth: number; expYear: number }[];
  } | null;
}

interface ActivityData {
  recentSignups: { id: string; name: string; email: string; date: string }[];
  recentPickups: { id: string; userName: string; serviceName: string; pickupDate: string; status: string; date: string }[];
  recentReferrals: { id: string; referrerName: string; referredEmail: string; status: string; date: string }[];
}

type AdminView = 'overview' | 'customers' | 'properties' | 'activity';

const StatCard: React.FC<{ label: string; value: string | number; icon: React.ReactNode; accent?: string }> = ({ label, value, icon, accent = 'text-primary' }) => (
  <Card className="p-5">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-gray-400">{label}</p>
        <p className={`text-2xl font-black mt-1 ${accent}`}>{value}</p>
      </div>
      <div className="text-gray-300">{icon}</div>
    </div>
  </Card>
);

const AdminDashboard: React.FC = () => {
  const [adminView, setAdminView] = useState<AdminView>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/stats', { credentials: 'include' });
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error('Failed to load admin stats:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async (search = '') => {
    try {
      const url = search ? `/api/admin/customers?search=${encodeURIComponent(search)}` : '/api/admin/customers';
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) setCustomers(await res.json());
    } catch (e) {
      console.error('Failed to load customers:', e);
    }
  };

  const loadCustomerDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/${id}`, { credentials: 'include' });
      if (res.ok) setSelectedCustomer(await res.json());
    } catch (e) {
      console.error('Failed to load customer detail:', e);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadActivity = async () => {
    try {
      const res = await fetch('/api/admin/activity', { credentials: 'include' });
      if (res.ok) setActivity(await res.json());
    } catch (e) {
      console.error('Failed to load activity:', e);
    }
  };

  useEffect(() => {
    if (adminView === 'customers') loadCustomers();
    if (adminView === 'activity') loadActivity();
  }, [adminView]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadCustomers(searchQuery);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const navItems: { view: AdminView; label: string; icon: React.ReactNode }[] = [
    { view: 'overview', label: 'Overview', icon: <ChartPieIcon className="w-4 h-4" /> },
    { view: 'customers', label: 'Customers', icon: <UsersIcon className="w-4 h-4" /> },
    { view: 'properties', label: 'Properties', icon: <BuildingOffice2Icon className="w-4 h-4" /> },
    { view: 'activity', label: 'Activity', icon: <ClockIcon className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Admin Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Manage customers, view reports, and monitor activity.</p>
      </div>

      <div className="flex gap-2 border-b border-gray-200 pb-1 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {navItems.map(item => (
          <button
            key={item.view}
            onClick={() => { setAdminView(item.view); setSelectedCustomer(null); }}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-bold rounded-t-lg transition-colors whitespace-nowrap ${
              adminView === item.view
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {adminView === 'overview' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Total Customers" value={stats.totalUsers} icon={<UsersIcon className="w-8 h-8" />} />
            <StatCard label="Total Properties" value={stats.totalProperties} icon={<BuildingOffice2Icon className="w-8 h-8" />} />
            <StatCard label="New (30 Days)" value={stats.recentUsers} icon={<UsersIcon className="w-8 h-8" />} accent="text-green-600" />
            <StatCard label="30-Day Revenue" value={`$${stats.revenue.toFixed(2)}`} icon={<ChartPieIcon className="w-8 h-8" />} accent="text-green-600" />
            <StatCard label="Active Subscriptions" value={stats.activeSubscriptions} icon={<ChartPieIcon className="w-8 h-8" />} />
            <StatCard label="Open Invoices" value={stats.openInvoices} icon={<ChartPieIcon className="w-8 h-8" />} accent="text-orange-500" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Total Referrals" value={stats.totalReferrals} icon={<UsersIcon className="w-8 h-8" />} />
            <StatCard label="Pending Referrals" value={stats.pendingReferrals} icon={<ClockIcon className="w-8 h-8" />} accent="text-yellow-600" />
            <StatCard label="Active Transfers" value={stats.activeTransfers} icon={<ArrowRightIcon className="w-8 h-8" />} accent="text-blue-600" />
          </div>
        </div>
      )}

      {adminView === 'customers' && !selectedCustomer && (
        <div className="space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <Button type="submit">Search</Button>
          </form>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400">Customer</th>
                    <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400 hidden md:table-cell">Phone</th>
                    <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400 hidden lg:table-cell">Joined</th>
                    <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400">Stripe</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {customers.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-gray-900">{c.name}</p>
                        {c.isAdmin && <span className="text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">Admin</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{c.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{c.phone || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-3">
                        {c.stripeCustomerId ? (
                          <span className="text-[9px] font-black uppercase tracking-widest text-green-700 bg-green-100 px-2 py-1 rounded-full">Linked</span>
                        ) : (
                          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-2 py-1 rounded-full">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm" onClick={() => loadCustomerDetail(c.id)}>
                          <ArrowRightIcon className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {customers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">No customers found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {adminView === 'customers' && selectedCustomer && (
        <div className="space-y-6">
          <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)} className="text-sm">
            ← Back to customer list
          </Button>

          {detailLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              <Card className="p-6">
                <div className="flex flex-col sm:flex-row justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-black text-gray-900">{selectedCustomer.name}</h2>
                    <p className="text-sm text-gray-500 mt-1">{selectedCustomer.email}</p>
                    <p className="text-sm text-gray-400">{selectedCustomer.phone || 'No phone'}</p>
                  </div>
                  <div className="text-sm text-gray-500 space-y-1">
                    <p>Member since: <span className="font-bold text-gray-700">{formatDate(selectedCustomer.memberSince || selectedCustomer.createdAt)}</span></p>
                    {selectedCustomer.stripeCustomerId && (
                      <p>Stripe: <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{selectedCustomer.stripeCustomerId}</span></p>
                    )}
                    {selectedCustomer.isAdmin && <span className="inline-block text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-1 rounded-full">Admin</span>}
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Properties ({selectedCustomer.properties.length})</h3>
                  {selectedCustomer.properties.length > 0 ? (
                    <div className="space-y-3">
                      {selectedCustomer.properties.map(p => (
                        <div key={p.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <p className="text-sm font-bold text-gray-900">{p.address}</p>
                          <div className="flex gap-2 mt-1">
                            <span className="text-xs text-gray-500">{p.serviceType}</span>
                            {p.transferStatus && <span className="text-xs text-orange-600 font-bold">Transfer: {p.transferStatus}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No properties</p>
                  )}
                </Card>

                {selectedCustomer.stripe && (
                  <Card className="p-6">
                    <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Stripe Account</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm text-gray-600">Balance</span>
                        <span className={`text-sm font-black ${selectedCustomer.stripe.balance < 0 ? 'text-green-600' : selectedCustomer.stripe.balance > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                          ${Math.abs(selectedCustomer.stripe.balance).toFixed(2)} {selectedCustomer.stripe.balance < 0 ? 'credit' : selectedCustomer.stripe.balance > 0 ? 'owed' : ''}
                        </span>
                      </div>

                      <div>
                        <p className="text-xs font-bold text-gray-500 mb-2">Payment Methods</p>
                        {selectedCustomer.stripe.paymentMethods.map(pm => (
                          <div key={pm.id} className="flex items-center gap-2 text-sm text-gray-700 py-1">
                            <span className="capitalize font-bold">{pm.brand}</span>
                            <span>••••{pm.last4}</span>
                            <span className="text-gray-400">{pm.expMonth}/{pm.expYear}</span>
                          </div>
                        ))}
                        {selectedCustomer.stripe.paymentMethods.length === 0 && <p className="text-xs text-gray-400">No payment methods</p>}
                      </div>

                      <div>
                        <p className="text-xs font-bold text-gray-500 mb-2">Subscriptions ({selectedCustomer.stripe.subscriptions.length})</p>
                        {selectedCustomer.stripe.subscriptions.map(sub => (
                          <div key={sub.id} className="p-2 bg-gray-50 rounded-lg mb-1">
                            <div className="flex justify-between items-center">
                              <span className={`text-[9px] font-black uppercase tracking-widest rounded-full px-2 py-0.5 ${
                                sub.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                              }`}>{sub.status}</span>
                              <span className="text-xs text-gray-400">until {formatDate(sub.currentPeriodEnd)}</span>
                            </div>
                            {sub.items.map((item, i) => (
                              <p key={i} className="text-sm text-gray-700 mt-1">{item.productName} - ${item.amount}/{item.interval}</p>
                            ))}
                          </div>
                        ))}
                        {selectedCustomer.stripe.subscriptions.length === 0 && <p className="text-xs text-gray-400">No subscriptions</p>}
                      </div>

                      <div>
                        <p className="text-xs font-bold text-gray-500 mb-2">Recent Invoices ({selectedCustomer.stripe.invoices.length})</p>
                        {selectedCustomer.stripe.invoices.map(inv => (
                          <div key={inv.id} className="flex justify-between items-center py-1 text-sm">
                            <span className="text-gray-700">{inv.number || inv.id}</span>
                            <div className="flex items-center gap-3">
                              <span className="font-bold">${inv.amount.toFixed(2)}</span>
                              <span className={`text-[9px] font-black uppercase tracking-widest rounded-full px-2 py-0.5 ${
                                inv.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-700'
                              }`}>{inv.status}</span>
                            </div>
                          </div>
                        ))}
                        {selectedCustomer.stripe.invoices.length === 0 && <p className="text-xs text-gray-400">No invoices</p>}
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {adminView === 'properties' && (
        <PropertiesView />
      )}

      {adminView === 'activity' && (
        <ActivityView activity={activity} formatDate={formatDate} />
      )}
    </div>
  );
};

const PropertiesView: React.FC = () => {
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/properties', { credentials: 'include' })
      .then(r => r.json())
      .then(setProperties)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div></div>;
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400">Address</th>
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400">Owner</th>
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400 hidden md:table-cell">Service</th>
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400 hidden lg:table-cell">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {properties.map(p => (
              <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 text-sm font-bold text-gray-900">{p.address}</td>
                <td className="px-4 py-3">
                  <p className="text-sm text-gray-700">{p.ownerName || '-'}</p>
                  <p className="text-xs text-gray-400">{p.ownerEmail || ''}</p>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{p.serviceType || '-'}</td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  {p.transferStatus ? (
                    <span className="text-[9px] font-black uppercase tracking-widest text-orange-700 bg-orange-100 px-2 py-1 rounded-full">Transfer {p.transferStatus}</span>
                  ) : (
                    <span className="text-[9px] font-black uppercase tracking-widest text-green-700 bg-green-100 px-2 py-1 rounded-full">Active</span>
                  )}
                </td>
              </tr>
            ))}
            {properties.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-400 text-sm">No properties found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

const ActivityView: React.FC<{ activity: ActivityData | null; formatDate: (d: string) => string }> = ({ activity, formatDate }) => {
  if (!activity) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Recent Signups</h3>
        <div className="space-y-3">
          {activity.recentSignups.map(s => (
            <div key={s.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-bold text-gray-900">{s.name}</p>
                <p className="text-xs text-gray-400">{s.email}</p>
              </div>
              <p className="text-xs text-gray-400">{formatDate(s.date)}</p>
            </div>
          ))}
          {activity.recentSignups.length === 0 && <p className="text-sm text-gray-400">No recent signups</p>}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Special Pickups</h3>
        <div className="space-y-3">
          {activity.recentPickups.map(p => (
            <div key={p.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-bold text-gray-900">{p.serviceName}</p>
                <p className="text-xs text-gray-400">{p.userName}</p>
              </div>
              <span className={`text-[9px] font-black uppercase tracking-widest rounded-full px-2 py-0.5 ${
                p.status === 'completed' ? 'bg-green-100 text-green-800' :
                p.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>{p.status}</span>
            </div>
          ))}
          {activity.recentPickups.length === 0 && <p className="text-sm text-gray-400">No recent pickups</p>}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Referrals</h3>
        <div className="space-y-3">
          {activity.recentReferrals.map(r => (
            <div key={r.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-bold text-gray-900">{r.referrerName}</p>
                <p className="text-xs text-gray-400">→ {r.referredEmail}</p>
              </div>
              <span className={`text-[9px] font-black uppercase tracking-widest rounded-full px-2 py-0.5 ${
                r.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}>{r.status}</span>
            </div>
          ))}
          {activity.recentReferrals.length === 0 && <p className="text-sm text-gray-400">No recent referrals</p>}
        </div>
      </Card>
    </div>
  );
};

export default AdminDashboard;
