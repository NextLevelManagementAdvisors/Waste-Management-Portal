import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/Card.tsx';
import { Button } from '../components/Button.tsx';
import {
  UsersIcon,
  ChartPieIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
} from '../components/Icons.tsx';
import DashboardView from './components/DashboardView.tsx';
import CustomersView from './components/CustomersView.tsx';
import BillingView from './components/BillingView.tsx';
import OperationsView from './components/OperationsView.tsx';
import SystemView from './components/SystemView.tsx';
import CommunicationsView from './components/CommunicationsView.tsx';

interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
}

type AdminView = 'dashboard' | 'customers' | 'billing' | 'operations' | 'communications' | 'system';

const CurrencyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const TruckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
  </svg>
);

const ChatIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
  </svg>
);

const CogIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
);

const AdminApp: React.FC = () => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentView, setCurrentView] = useState<AdminView>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);

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

  const handleGlobalSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults(null); return; }
    try {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
      if (res.ok) setSearchResults(await res.json());
    } catch {}
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
    { view: 'dashboard', label: 'Dashboard', icon: <ChartPieIcon className="w-5 h-5" /> },
    { view: 'customers', label: 'Customers', icon: <UsersIcon className="w-5 h-5" /> },
    { view: 'billing', label: 'Billing', icon: <CurrencyIcon className="w-5 h-5" /> },
    { view: 'operations', label: 'Operations', icon: <TruckIcon className="w-5 h-5" /> },
    { view: 'communications', label: 'Communications', icon: <ChatIcon className="w-5 h-5" /> },
    { view: 'system', label: 'System', icon: <CogIcon className="w-5 h-5" /> },
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
          <div className="ml-auto relative">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-lg hover:bg-gray-100"
            >
              <MagnifyingGlassIcon className="w-5 h-5" />
            </button>
            {searchOpen && (
              <div className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => handleGlobalSearch(e.target.value)}
                  placeholder="Search customers, properties..."
                  className="w-full px-4 py-3 text-sm border-b border-gray-100 rounded-t-xl focus:outline-none"
                  autoFocus
                />
                {searchResults && (
                  <div className="max-h-80 overflow-y-auto p-2">
                    {searchResults.users?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-2 py-1">Customers</p>
                        {searchResults.users.map((u: any) => (
                          <button key={u.id} onClick={() => { setCurrentView('customers'); setSearchOpen(false); setSearchQuery(''); setSearchResults(null); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">
                            <p className="font-bold text-gray-900">{u.first_name} {u.last_name}</p>
                            <p className="text-xs text-gray-400">{u.email}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults.properties?.length > 0 && (
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-2 py-1">Properties</p>
                        {searchResults.properties.map((p: any) => (
                          <button key={p.id} onClick={() => { setCurrentView('customers'); setSearchOpen(false); setSearchQuery(''); setSearchResults(null); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">
                            <p className="font-bold text-gray-900">{p.address}</p>
                            <p className="text-xs text-gray-400">{p.owner_name} · {p.service_type}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {(!searchResults.users?.length && !searchResults.properties?.length) && (
                      <p className="text-sm text-gray-400 text-center py-4">No results found</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8">
          {currentView === 'dashboard' && <DashboardView />}
          {currentView === 'customers' && <CustomersView />}
          {currentView === 'billing' && <BillingView />}
          {currentView === 'operations' && <OperationsView />}
          {currentView === 'communications' && <CommunicationsView />}
          {currentView === 'system' && <SystemView />}
        </div>
      </main>
    </div>
  );
};

export default AdminApp;
