import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card.tsx';
import { Button } from '../components/Button.tsx';
import {
  UsersIcon,
  BuildingOffice2Icon,
  ChartPieIcon,
  ArrowRightIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  ShieldCheckIcon,
  BellAlertIcon,
} from '../components/Icons.tsx';

interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
}

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

type AdminView = 'overview' | 'customers' | 'properties' | 'activity' | 'notifications';

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const StatCard: React.FC<{ label: string; value: string | number; icon: React.ReactNode; accent?: string }> = ({ label, value, icon, accent = 'text-teal-700' }) => (
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

const AdminApp: React.FC = () => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentView, setCurrentView] = useState<AdminView>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error('Not authenticated');
        return r.json();
      })
      .then(json => {
        if (json.data?.isAdmin) {
          setUser(json.data);
        }
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <ShieldCheckIcon className="w-16 h-16 text-teal-600 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-gray-900 mb-2">Admin Access Required</h1>
          <p className="text-gray-500 mb-6">You need to be logged in with an admin account to access this portal.</p>
          <a href="/" className="inline-block">
            <Button>Go to Client Portal</Button>
          </a>
        </Card>
      </div>
    );
  }

  const navItems: { view: AdminView; label: string; icon: React.ReactNode }[] = [
    { view: 'overview', label: 'Overview', icon: <ChartPieIcon className="w-5 h-5" /> },
    { view: 'customers', label: 'Customers', icon: <UsersIcon className="w-5 h-5" /> },
    { view: 'properties', label: 'Properties', icon: <BuildingOffice2Icon className="w-5 h-5" /> },
    { view: 'activity', label: 'Activity', icon: <ClockIcon className="w-5 h-5" /> },
    { view: 'notifications', label: 'Notify', icon: <BellAlertIcon className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 text-white transform transition-transform lg:translate-x-0 lg:static lg:inset-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <ShieldCheckIcon className="w-8 h-8 text-teal-400" />
            <div>
              <h1 className="text-lg font-black tracking-tight">Admin Portal</h1>
              <p className="text-xs text-gray-400">Waste Management</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map(item => (
            <button
              key={item.view}
              onClick={() => { setCurrentView(item.view); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${
                currentView === item.view
                  ? 'bg-teal-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-xs font-black">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
          </div>
          <a href="/" className="block text-center text-xs text-gray-400 hover:text-white transition-colors py-2 rounded-lg hover:bg-gray-800">
            Switch to Client Portal
          </a>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-500 hover:text-gray-900">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <h2 className="text-lg font-black text-gray-900">
            {navItems.find(n => n.view === currentView)?.label || 'Admin'}
          </h2>
        </header>

        <div className="p-4 sm:p-6 lg:p-8">
          {currentView === 'overview' && <OverviewView />}
          {currentView === 'customers' && <CustomersView />}
          {currentView === 'properties' && <PropertiesView />}
          {currentView === 'activity' && <ActivityView />}
          {currentView === 'notifications' && <NotificationsView />}
        </div>
      </main>
    </div>
  );
};

const OverviewView: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/stats', { credentials: 'include' })
      .then(r => r.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!stats) return <p className="text-gray-400">Failed to load stats</p>;

  return (
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
  );
};

const CustomersView: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadCustomers = async (search = '') => {
    setLoading(true);
    try {
      const url = search ? `/api/admin/customers?search=${encodeURIComponent(search)}` : '/api/admin/customers';
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) setCustomers(await res.json());
    } catch (e) {
      console.error('Failed to load customers:', e);
    } finally {
      setLoading(false);
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

  useEffect(() => { loadCustomers(); }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadCustomers(searchQuery);
  };

  if (selectedCustomer) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)} className="text-sm">
          ← Back to customer list
        </Button>
        {detailLoading ? <LoadingSpinner /> : <CustomerDetailView customer={selectedCustomer} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {loading ? <LoadingSpinner /> : (
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
                  <tr key={c.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => loadCustomerDetail(c.id)}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-gray-900">{c.name}</p>
                      {c.isAdmin && <span className="text-[9px] font-black uppercase tracking-widest text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded-full">Admin</span>}
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
                      <ArrowRightIcon className="w-4 h-4 text-gray-400" />
                    </td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">No customers found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

const CustomerDetailView: React.FC<{ customer: CustomerDetail }> = ({ customer }) => (
  <>
    <Card className="p-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-900">{customer.name}</h2>
          <p className="text-sm text-gray-500 mt-1">{customer.email}</p>
          <p className="text-sm text-gray-400">{customer.phone || 'No phone'}</p>
        </div>
        <div className="text-sm text-gray-500 space-y-1">
          <p>Member since: <span className="font-bold text-gray-700">{formatDate(customer.memberSince || customer.createdAt)}</span></p>
          {customer.stripeCustomerId && (
            <p>Stripe: <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{customer.stripeCustomerId}</span></p>
          )}
          {customer.isAdmin && <span className="inline-block text-[9px] font-black uppercase tracking-widest text-teal-700 bg-teal-100 px-2 py-1 rounded-full">Admin</span>}
        </div>
      </div>
    </Card>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Properties ({customer.properties.length})</h3>
        {customer.properties.length > 0 ? (
          <div className="space-y-3">
            {customer.properties.map(p => (
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

      {customer.stripe && (
        <Card className="p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Stripe Account</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Balance</span>
              <span className={`text-sm font-black ${customer.stripe.balance < 0 ? 'text-green-600' : customer.stripe.balance > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                ${Math.abs(customer.stripe.balance).toFixed(2)} {customer.stripe.balance < 0 ? 'credit' : customer.stripe.balance > 0 ? 'owed' : ''}
              </span>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">Payment Methods</p>
              {customer.stripe.paymentMethods.map(pm => (
                <div key={pm.id} className="flex items-center gap-2 text-sm text-gray-700 py-1">
                  <span className="capitalize font-bold">{pm.brand}</span>
                  <span>····{pm.last4}</span>
                  <span className="text-gray-400">{pm.expMonth}/{pm.expYear}</span>
                </div>
              ))}
              {customer.stripe.paymentMethods.length === 0 && <p className="text-xs text-gray-400">No payment methods</p>}
            </div>

            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">Subscriptions ({customer.stripe.subscriptions.length})</p>
              {customer.stripe.subscriptions.map(sub => (
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
              {customer.stripe.subscriptions.length === 0 && <p className="text-xs text-gray-400">No subscriptions</p>}
            </div>

            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">Recent Invoices ({customer.stripe.invoices.length})</p>
              {customer.stripe.invoices.map(inv => (
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
              {customer.stripe.invoices.length === 0 && <p className="text-xs text-gray-400">No invoices</p>}
            </div>
          </div>
        </Card>
      )}
    </div>
  </>
);

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

  if (loading) return <LoadingSpinner />;

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

const ActivityView: React.FC = () => {
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/activity', { credentials: 'include' })
      .then(r => r.json())
      .then(setActivity)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!activity) return <p className="text-gray-400">Failed to load activity</p>;

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

const NotificationsView: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [notificationType, setNotificationType] = useState('pickup_reminder');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/customers', { credentials: 'include' })
      .then(r => r.json())
      .then(setCustomers)
      .catch(console.error);
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: selectedCustomerId, type: notificationType, message }),
      });
      const json = await res.json();
      setResult({ success: res.ok, message: res.ok ? 'Notification sent successfully!' : (json.error || 'Failed to send') });
      if (res.ok) setMessage('');
    } catch {
      setResult({ success: false, message: 'Failed to send notification' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <Card className="p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6">Send Notification</h3>
        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Customer</label>
            <select
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              required
            >
              <option value="">Select a customer...</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Notification Type</label>
            <select
              value={notificationType}
              onChange={e => setNotificationType(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="pickup_reminder">Pickup Reminder</option>
              <option value="billing_alert">Billing Alert</option>
              <option value="service_update">Service Update</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Message (optional)</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              placeholder="Additional details..."
            />
          </div>

          {result && (
            <div className={`p-3 rounded-lg text-sm font-bold ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {result.message}
            </div>
          )}

          <Button type="submit" disabled={sending || !selectedCustomerId}>
            {sending ? 'Sending...' : 'Send Notification'}
          </Button>
        </form>
      </Card>
    </div>
  );
};

const LoadingSpinner: React.FC = () => (
  <div className="flex justify-center py-12">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-teal-600"></div>
  </div>
);

export default AdminApp;
